import naughtyWords from 'naughty-words';

export interface FilterResult {
    sanitized: string;
    wasFiltered: boolean;
    toxicityScore?: number;
}

export interface ChatFilterOptions {
    toxicityThreshold?: number;
    perspectiveLanguage?: string;
}

export class ChatFilterError extends Error {
    constructor(message: string, public readonly score: number) {
        super(message);
        this.name = 'ChatFilterError';
    }
}

// ─── Normalización ────────────────────────────────────────────────────────────
//
// Convierte leet speak, acentos y caracteres de evasión a ASCII básico.
// "put4" → "puta", "p.u.t.a" → "puta", "püta" → "puta", "fuuuuck" → "fuuck"

const CHAR_MAP: Record<string, string> = {
    '@': 'a', '4': 'a',
    '3': 'e',
    '1': 'i', '!': 'i', '|': 'i',
    '0': 'o',
    '$': 's', '5': 's',
    '7': 't',
    '9': 'g', '6': 'g',
    '8': 'b',
    'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ñ': 'n', 'ç': 'c',
};

const EVASION_CHARS = new Set(['.', '-', '_', ' ', '*', '~', ',', ';']);

/**
 * Normaliza un string y devuelve:
 * - `norm`: texto normalizado
 * - `map[i]`: índice en el texto original del carácter normalizado i
 *
 * Permite encontrar un match en el texto normalizado y luego
 * asteriscar el rango exacto en el texto original.
 */
function normalize(text: string): { norm: string; map: number[] } {
    const lower = text.toLowerCase();
    const normChars: string[] = [];
    const map: number[] = [];

    for (let i = 0; i < lower.length; i++) {
        const ch = lower[i];

        // Saltar separadores de evasión entre caracteres alfanuméricos
        if (EVASION_CHARS.has(ch)) {
            const prevIsAlpha = normChars.length > 0 && /[a-z0-9]/.test(normChars[normChars.length - 1]);
            const nextCh = lower[i + 1] ?? '';
            const nextIsAlpha = /[a-z0-9äáàâãéèêëíìîïóòôöõúùûüñç@4310!|$57986]/.test(nextCh);
            if (prevIsAlpha && nextIsAlpha) continue;
        }

        const nc = CHAR_MAP[ch] ?? ch;

        // Colapsar repeticiones: "fuuuuck" → "fuuck" (máx 2 seguidas)
        const n = normChars.length;
        if (n >= 2 && normChars[n - 1] === nc && normChars[n - 2] === nc) continue;

        normChars.push(nc);
        map.push(i);
    }

    return { norm: normChars.join(''), map };
}

// ─── Set de palabras prohibidas ───────────────────────────────────────────────
//
// Set<string> en lugar de una regex gigante → lookup O(1) por token,
// sin riesgo de backtracking catastrófico ni cuelgues al importar el módulo.

const ACTIVE_LOCALES = ['en', 'es', 'de', 'fr', 'pt', 'it'];

function buildWordSet(locales: string[]): { set: Set<string>; maxLen: number } {
    const set = new Set<string>();
    let maxLen = 0;

    for (const locale of locales) {
        const list = (naughtyWords as Record<string, readonly string[]>)[locale] ?? [];
        for (const word of list) {
            const { norm } = normalize(word);
            if (norm.length >= 2) {
                set.add(norm);
                if (norm.length > maxLen) maxLen = norm.length;
            }
        }
    }

    return { set, maxLen };
}

const { set: BAD_WORDS, maxLen: MAX_WORD_LEN } = buildWordSet(ACTIVE_LOCALES);

// ─── Búsqueda con ventana deslizante ─────────────────────────────────────────
//
// Escanea el texto normalizado buscando substrings presentes en el Set.
// Para cada posición i, prueba ventanas de MAX_WORD_LEN a MIN_WORD_LEN.
// Solo hace match en límites de palabra (no dentro de palabras más largas).

const MIN_WORD_LEN = 2;
const ALPHA = /[a-z]/;

interface MatchRange {
    origStart: number;
    origEnd: number;
}

function findBadWords(norm: string, map: number[]): MatchRange[] {
    const ranges: MatchRange[] = [];
    const len = norm.length;
    let i = 0;

    while (i < len) {
        // Solo empezar en límite de palabra
        if (i > 0 && ALPHA.test(norm[i - 1])) { i++; continue; }

        const maxEnd = Math.min(i + MAX_WORD_LEN, len);
        let matched = false;

        for (let j = maxEnd; j >= i + MIN_WORD_LEN; j--) {
            // Solo terminar en límite de palabra
            if (j < len && ALPHA.test(norm[j])) continue;

            if (BAD_WORDS.has(norm.slice(i, j))) {
                ranges.push({ origStart: map[i], origEnd: map[j - 1] });
                i = j; // Saltar al final del match
                matched = true;
                break;
            }
        }

        if (!matched) i++;
    }

    return ranges;
}

// ─── Patrones contextuales ────────────────────────────────────────────────────
//
// Para palabras ambiguas que solo son insulto en ciertos contextos.
// Son ~7 patrones concretos, no miles → regex aquí es perfectamente seguro.
//
// ✅ "eres malo", "eres un idiota", "qué tonto eres", "vete a la mierda"
// ❌ "estoy malo", "estoy malo de la cabeza", "me siento mal"

const CONTEXT_PATTERNS: RegExp[] = [
    /\b(eres|sos|es)\s+(un[ao]?\s+)?(malo|mala|feo|fea|tonto|tonta|estúpid[ao]|estupid[ao]|idiota|imbécil|imbecil|inútil|inutil|asqueros[ao]|pésim[ao]|pesim[ao]|nul[ao]|basura|patétic[ao]|patetico)\b/gi,
    /\b(qué|que|menudo|vaya)\s+(un[ao]?\s+)?(idiota|imbécil|imbecil|estúpid[ao]|estupid[ao]|tont[ao]|inútil|inutil)\b/gi,
    /\b\w+\s+de\s+(mierda|porquería|porqueria|asco)\b/gi,
    /\b(vete|ándate|andate|métete|metete)\s+(a\s+la\s+)?(mierda|porra)\b/gi,
    /\byou\s+'?re?\s+(a\s+)?(loser|idiot|stupid|dumb|moron|clown|garbage|trash|worthless|useless)\b/gi,
    /\bwhat\s+a\s+(loser|idiot|moron|dumbass|jerk|clown)\b/gi,
    /\byou\s+suck\b/gi,
];

// ─── Perspective API ──────────────────────────────────────────────────────────

const PERSPECTIVE_URL = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

async function getToxicityScore(text: string, language: string, apiKey: string): Promise<number> {
    const res = await fetch(`${PERSPECTIVE_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            comment: { text },
            languages: [language],
            requestedAttributes: { TOXICITY: {} },
        }),
    });

    if (!res.ok) {
        console.warn('[ChatFilter] Perspective API error:', res.status, await res.text());
        return 0;
    }

    const data = (await res.json()) as {
        attributeScores: { TOXICITY: { summaryScore: { value: number } } };
    };
    return data.attributeScores.TOXICITY.summaryScore.value;
}

// ─── ChatFilter ───────────────────────────────────────────────────────────────

export class ChatFilter {
    private readonly toxicityThreshold: number;
    private readonly perspectiveLanguage: string;
    private readonly perspectiveApiKey: string | undefined;

    constructor(options: ChatFilterOptions = {}) {
        this.toxicityThreshold = options.toxicityThreshold ?? 0.8;
        this.perspectiveLanguage = options.perspectiveLanguage ?? 'es';
        this.perspectiveApiKey = process.env.PERSPECTIVE_API_KEY;
    }

    filterSync(text: string): Omit<FilterResult, 'toxicityScore'> {
        const masked = text.split('');
        let wasFiltered = false;

        // Tier 1 — Lista de palabras con normalización
        // Detecta variantes: "put4", "p.u.t.a", "puuuuta", "pütä", "j0d3r"...
        const { norm, map } = normalize(text);
        for (const { origStart, origEnd } of findBadWords(norm, map)) {
            for (let k = origStart; k <= origEnd; k++) masked[k] = '*';
            wasFiltered = true;
        }

        // Tier 2 — Patrones contextuales
        // Detecta "eres malo" pero no "estoy malo"
        for (const pattern of CONTEXT_PATTERNS) {
            pattern.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = pattern.exec(text)) !== null) {
                for (let k = m.index; k < m.index + m[0].length; k++) masked[k] = '*';
                wasFiltered = true;
            }
        }

        return { sanitized: masked.join(''), wasFiltered };
    }

    async filter(text: string): Promise<FilterResult> {
        const { sanitized, wasFiltered } = this.filterSync(text);

        if (wasFiltered) {
            console.warn('[ChatFilter] Tier-1 match');
        }

        if (!this.perspectiveApiKey) {
            return { sanitized, wasFiltered };
        }

        // Tier 3 — Perspective API para lo que escape al filtro estático
        const toxicityScore = await getToxicityScore(
            text,
            this.perspectiveLanguage,
            this.perspectiveApiKey,
        );

        if (toxicityScore >= this.toxicityThreshold) {
            throw new ChatFilterError(
                `Message rejected (toxicity score: ${toxicityScore.toFixed(2)})`,
                toxicityScore,
            );
        }

        return { sanitized, wasFiltered, toxicityScore };
    }
}