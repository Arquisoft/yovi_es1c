/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GAME_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
// Declare CSS modules so they are treated as modules by TypeScript.
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
