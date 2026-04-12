import { randomInt } from 'crypto';

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

export function resolveRulesForMatch(boardSize: number, rawRules: unknown): MatchRules {
    const normalized = normalizeMatchRules(rawRules);
    if (!normalized.honey.enabled) {
        return normalized;
    }

    if (normalized.honey.blockedCells.length > 0) {
        return normalized;
    }

    return {
        ...normalized,
        honey: {
            ...normalized.honey,
            blockedCells: generateHoneyBlockedCells(boardSize),
        },
    };
}

function generateHoneyBlockedCells(boardSize: number): BlockedCell[] {
    const rows = Number.isInteger(boardSize) && boardSize > 1 ? boardSize : 8;
    const targetCount = Math.max(1, Math.floor(rows / 6));
    const used = new Set<string>();
    const blockedCells: BlockedCell[] = [];

    while (blockedCells.length < targetCount) {
        const row = randomInt(1, rows);
        const col = randomInt(0, row + 1);
        const key = `${row}:${col}`;
        if (used.has(key)) continue;
        used.add(key);
        blockedCells.push({ row, col });
    }

    return blockedCells;
}