import type { YenMoveDto } from "./yenMove";

export interface ChooseMoveResponseDto {
    api_version: string;
    bot_id: string;
    coords: YenMoveDto;
}