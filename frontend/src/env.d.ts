/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE?: string;
  readonly INTERNAL_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
