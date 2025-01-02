/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KITE_API_KEY: string;
  readonly VITE_KITE_API_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
