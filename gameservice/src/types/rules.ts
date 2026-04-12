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