export interface BlockedCell {
    row: number;
    col: number;
}

export interface MatchRules {
    pieRule: {
        enabled: boolean;
    };
    honey: {
        enabled: boolean;
        blockedCells: BlockedCell[];
    };
}

export const DEFAULT_MATCH_RULES: MatchRules = {
    pieRule: { enabled: false },
    honey: { enabled: false, blockedCells: [] },
};

export function cloneDefaultMatchRules(): MatchRules {
    return {
        pieRule: { ...DEFAULT_MATCH_RULES.pieRule },
        honey: {
            enabled: DEFAULT_MATCH_RULES.honey.enabled,
            blockedCells: [...DEFAULT_MATCH_RULES.honey.blockedCells],
        },
    };
}

export function normalizeMatchRules(rawRules: unknown): MatchRules {
    const normalized = cloneDefaultMatchRules();
    if (!rawRules || typeof rawRules !== 'object') return normalized;

    const candidate = rawRules as Record<string, unknown>;
    const pieRule = candidate.pieRule;
    const honey = candidate.honey;

    if (pieRule && typeof pieRule === 'object') {
        const pieEnabled = (pieRule as Record<string, unknown>).enabled;
        normalized.pieRule.enabled = pieEnabled === true;
    }

    if (honey && typeof honey === 'object') {
        const honeyRecord = honey as Record<string, unknown>;
        normalized.honey.enabled = honeyRecord.enabled === true;

        if (Array.isArray(honeyRecord.blockedCells)) {
            normalized.honey.blockedCells = honeyRecord.blockedCells
                .filter((cell): cell is Record<string, unknown> => typeof cell === 'object' && cell !== null)
                .map((cell) => ({ row: Number(cell.row), col: Number(cell.col) }))
                .filter((cell) => Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row >= 0 && cell.col >= 0);
        }
    }

    if (!normalized.honey.enabled) {
        normalized.honey.blockedCells = [];
    }

    return normalized;
}