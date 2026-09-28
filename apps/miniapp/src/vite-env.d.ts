/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Только для `npm run dev` вне MAX: подписанная строка initData из `npm run dev:init-data` в apps/server. */
  readonly VITE_DEV_INIT_DATA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
