export interface BlockedCellDto {
    row: number;
    col: number;
}

export interface MatchRulesDto {
    pieRule: {
        enabled: boolean;
    };
    honey: {
        enabled: boolean;
        blockedCells: BlockedCellDto[];
    };
}

export interface YenPositionDto {
    size: number;
    turn: number;
    players: string[];
    layout: string;
    rules?: MatchRulesDto;
}