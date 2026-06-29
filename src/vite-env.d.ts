/// <reference types="vite/client" />

// Tipagem das variaveis de ambiente do front (autocomplete + checagem).
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
