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

const ACTIVE_LOCALES = ['en', 'es', 'de', 'fr', 'pt', 'it'];

function buildWordListPattern(locales: string[]): RegExp {
    const words: string[] = [];

    for (const locale of locales) {
        const list = (naughtyWords as Record<string, readonly string[]>)[locale];
        if (list) words.push(...list);
    }

    const unique = [...new Set(words)].map(escapeRegex);

    return new RegExp(
        `(?<![\\w\\u00C0-\\u024F])(${unique.join('|')})(?![\\w\\u00C0-\\u024F])`,
        'gi',
    );
}

const WORD_LIST_PATTERN = buildWordListPattern(ACTIVE_LOCALES);

const PERSPECTIVE_URL =
    'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

async function getToxicityScore(text: string, language: string, apiKey: string): Promise<number> {
    const response = await fetch(`${PERSPECTIVE_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            comment: { text },
            languages: [language],
            requestedAttributes: { TOXICITY: {} },
        }),
    });

    if (!response.ok) {
        console.warn('[ChatFilter] Perspective API error:', response.status, await response.text());
        return 0;
    }

    const data = (await response.json()) as {
        attributeScores: { TOXICITY: { summaryScore: { value: number } } };
    };
    return data.attributeScores.TOXICITY.summaryScore.value;
}

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
        WORD_LIST_PATTERN.lastIndex = 0;

        let wasFiltered = false;
        const sanitized = text.replace(WORD_LIST_PATTERN, (match) => {
            wasFiltered = true;
            return '*'.repeat(match.length);
        });

        return { sanitized, wasFiltered };
    }

    async filter(text: string): Promise<FilterResult> {
        const { sanitized, wasFiltered } = this.filterSync(text);

        if (!this.perspectiveApiKey) {
            return { sanitized, wasFiltered };
        }

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

export class ChatFilterError extends Error {
    constructor(message: string, public readonly score: number) {
        super(message);
        this.name = 'ChatFilterError';
    }
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}