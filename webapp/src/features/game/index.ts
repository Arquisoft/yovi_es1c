export { default as GameUI } from "./ui/tsx/GameUI.tsx";
export {
    resolveCurrentTurnLabel,
    resolveGameOverText,
    resolveLoserLabel,
    resolvePlayerName,
    resolveWinnerLabel,
    resolveWinnerMessage,
} from "./ui/tsx/gameUIHelpers.ts";
export type { GameMode, Player, WinnerSymbol } from "./ui/tsx/gameUIHelpers.ts";
