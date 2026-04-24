import naughtyWords from 'naughty-words';

export interface FilterResult {
    sanitized: string;
    wasFiltered: boolean;
    toxicityScore?: number;
}

export type PerspectiveFailureMode = 'allow' | 'reject';
export type ChatFilterErrorKind = 'toxicity' | 'service_unavailable';

export interface ChatFilterOptions {
    toxicityThreshold?: number;
    perspectiveLanguage?: string;
    perspectiveTimeoutMs?: number;
    perspectiveFailureMode?: PerspectiveFailureMode;
}

export class ChatFilterError extends Error {
    public readonly kind: ChatFilterErrorKind;
    public readonly score?: number;

    constructor(
        message: string,
        options: {
            kind?: ChatFilterErrorKind;
            score?: number;
        } = {},
    ) {
        super(message);
        this.name = 'ChatFilterError';
        this.kind = options.kind ?? 'toxicity';
        this.score = options.score;
    }
}

const CHAR_MAP: Record<string, string> = {
    '@': 'a', '4': 'a',
    '3': 'e',
    '1': 'i', '!': 'i', '|': 'i',
    '0': 'o',
    '$': 's', '5': 's',
    '7': 't',
    '9': 'g', '6': 'g',
    '8': 'b',
    '\u00e1': 'a', '\u00e0': 'a', '\u00e2': 'a', '\u00e4': 'a', '\u00e3': 'a',
    '\u00e9': 'e', '\u00e8': 'e', '\u00ea': 'e', '\u00eb': 'e',
    '\u00ed': 'i', '\u00ec': 'i', '\u00ee': 'i', '\u00ef': 'i',
    '\u00f3': 'o', '\u00f2': 'o', '\u00f4': 'o', '\u00f6': 'o', '\u00f5': 'o',
    '\u00fa': 'u', '\u00f9': 'u', '\u00fb': 'u', '\u00fc': 'u',
    '\u00f1': 'n', '\u00e7': 'c',
};

const EVASION_CHARS = new Set(['.', '-', '_', ' ', '*', '~', ',', ';']);
const ACTIVE_LOCALES = ['en', 'es', 'de', 'fr', 'pt', 'it'];
const MIN_WORD_LEN = 2;
const DEFAULT_PERSPECTIVE_TIMEOUT_MS = 1500;
const DEFAULT_PERSPECTIVE_FAILURE_MODE: PerspectiveFailureMode = 'allow';
const PERSPECTIVE_URL = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

const CONTEXT_PATTERNS: RegExp[] = [
    /\b(eres|sos|es)\s+(un[ao]?\s+)?(malo|mala|feo|fea|tonto|tonta|est[u\u00fa]pid[ao]|idiota|imb[e\u00e9]cil|in[u\u00fa]til|asqueros[ao]|p[e\u00e9]sim[ao]|nul[ao]|basura|pat[e\u00e9]tic[ao])\b/gi,
    /\b(qu[e\u00e9]|menudo|vaya)\s+(un[ao]?\s+)?(idiota|imb[e\u00e9]cil|est[u\u00fa]pid[ao]|tont[ao]|in[u\u00fa]til)\b/gi,
    /\b\w+\s+de\s+(mierda|porquer[i\u00ed]a|asco)\b/gi,
    /\b(vete|[a\u00e1]ndate|m[e\u00e9]tete)\s+(a\s+la\s+)?(mierda|porra)\b/gi,
    /\byou\s+'?re?\s+(a\s+)?(loser|idiot|stupid|dumb|moron|clown|garbage|trash|worthless|useless)\b/gi,
    /\bwhat\s+a\s+(loser|idiot|moron|dumbass|jerk|clown)\b/gi,
    /\byou\s+suck\b/gi,
];

interface MatchRange {
    origStart: number;
    origEnd: number;
}

function resolvePositiveInteger(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function resolvePerspectiveFailureMode(raw: string | undefined): PerspectiveFailureMode {
    return raw === 'reject' ? 'reject' : DEFAULT_PERSPECTIVE_FAILURE_MODE;
}

function normalize(text: string): { norm: string; map: number[] } {
    const lower = text.toLowerCase();
    const normChars: string[] = [];
    const map: number[] = [];

    for (let i = 0; i < lower.length; i += 1) {
        const ch = lower[i];

        if (EVASION_CHARS.has(ch)) {
            const prevIsAlpha = normChars.length > 0 && /[a-z0-9]/.test(normChars[normChars.length - 1]);
            const nextCh = lower[i + 1] ?? '';
            const nextIsAlpha = /[a-z0-9\u00e4\u00e1\u00e0\u00e2\u00e3\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u00f1\u00e7@4310!|$57986]/.test(nextCh);
            if (prevIsAlpha && nextIsAlpha) continue;
        }

        const normalized = CHAR_MAP[ch] ?? ch;
        const length = normChars.length;
        if (length >= 2 && normChars[length - 1] === normalized && normChars[length - 2] === normalized) {
            continue;
        }

        normChars.push(normalized);
        map.push(i);
    }

    return { norm: normChars.join(''), map };
}

function buildWordSet(locales: string[]): { set: Set<string>; maxLen: number } {
    const set = new Set<string>();
    let maxLen = 0;

    for (const locale of locales) {
        const list = (naughtyWords as Record<string, readonly string[]>)[locale] ?? [];
        for (const word of list) {
            const { norm } = normalize(word);
            if (norm.length < MIN_WORD_LEN) continue;
            set.add(norm);
            if (norm.length > maxLen) {
                maxLen = norm.length;
            }
        }
    }

    return { set, maxLen };
}

const { set: BAD_WORDS, maxLen: MAX_WORD_LEN } = buildWordSet(ACTIVE_LOCALES);

function findBadWords(norm: string, map: number[]): MatchRange[] {
    const ranges: MatchRange[] = [];
    let index = 0;

    while (index < norm.length) {
        let matched = false;
        const maxEnd = Math.min(index + MAX_WORD_LEN, norm.length);

        for (let end = maxEnd; end >= index + MIN_WORD_LEN; end -= 1) {
            const slice = norm.slice(index, end);
            if (!BAD_WORDS.has(slice)) continue;
            ranges.push({
                origStart: map[index],
                origEnd: map[end - 1],
            });
            index = end;
            matched = true;
            break;
        }

        if (!matched) {
            index += 1;
        }
    }

    return ranges;
}

async function getToxicityScore(
    text: string,
    language: string,
    apiKey: string,
    timeoutMs: number,
): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${PERSPECTIVE_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment: { text },
                languages: [language],
                requestedAttributes: { TOXICITY: {} },
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Perspective API responded with status ${response.status}`);
        }

        const data = await response.json() as {
            attributeScores: {
                TOXICITY: {
                    summaryScore: {
                        value: number;
                    };
                };
            };
        };

        return data.attributeScores.TOXICITY.summaryScore.value;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Perspective request timed out after ${timeoutMs}ms`);
        }
        throw error instanceof Error ? error : new Error('Perspective request failed');
    } finally {
        clearTimeout(timeout);
    }
}

export class ChatFilter {
    private readonly toxicityThreshold: number;
    private readonly perspectiveLanguage: string;
    private readonly perspectiveApiKey: string | undefined;
    private readonly perspectiveTimeoutMs: number;
    private readonly perspectiveFailureMode: PerspectiveFailureMode;

    constructor(options: ChatFilterOptions = {}) {
        this.toxicityThreshold = options.toxicityThreshold ?? 0.8;
        this.perspectiveLanguage = options.perspectiveLanguage ?? 'es';
        this.perspectiveApiKey = process.env.PERSPECTIVE_API_KEY;
        this.perspectiveTimeoutMs = options.perspectiveTimeoutMs
            ?? resolvePositiveInteger(process.env.PERSPECTIVE_TIMEOUT_MS, DEFAULT_PERSPECTIVE_TIMEOUT_MS);
        this.perspectiveFailureMode = options.perspectiveFailureMode
            ?? resolvePerspectiveFailureMode(process.env.PERSPECTIVE_FAIL_MODE);
    }

    filterSync(text: string): Omit<FilterResult, 'toxicityScore'> {
        const masked = text.split('');
        let wasFiltered = false;

        const { norm, map } = normalize(text);
        for (const { origStart, origEnd } of findBadWords(norm, map)) {
            for (let cursor = origStart; cursor <= origEnd; cursor += 1) {
                masked[cursor] = '*';
            }
            wasFiltered = true;
        }

        for (const pattern of CONTEXT_PATTERNS) {
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(text)) !== null) {
                for (let cursor = match.index; cursor < match.index + match[0].length; cursor += 1) {
                    masked[cursor] = '*';
                }
                wasFiltered = true;
            }
        }

        return {
            sanitized: masked.join(''),
            wasFiltered,
        };
    }

    async filter(text: string): Promise<FilterResult> {
        const { sanitized, wasFiltered } = this.filterSync(text);

        if (!this.perspectiveApiKey) {
            return { sanitized, wasFiltered };
        }

        try {
            const toxicityScore = await getToxicityScore(
                text,
                this.perspectiveLanguage,
                this.perspectiveApiKey,
                this.perspectiveTimeoutMs,
            );

            if (toxicityScore >= this.toxicityThreshold) {
                throw new ChatFilterError(
                    `Message rejected (toxicity score: ${toxicityScore.toFixed(2)})`,
                    { kind: 'toxicity', score: toxicityScore },
                );
            }

            return { sanitized, wasFiltered, toxicityScore };
        } catch (error) {
            if (error instanceof ChatFilterError) {
                throw error;
            }
            console.warn('[ChatFilter] Perspective unavailable:', error);
            if (this.perspectiveFailureMode === 'reject') {
                throw new ChatFilterError(
                    'Message rejected because moderation is temporarily unavailable',
                    { kind: 'service_unavailable' },
                );
            }
            return { sanitized, wasFiltered };
        }
    }
}
