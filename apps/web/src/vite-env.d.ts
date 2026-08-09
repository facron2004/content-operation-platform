/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopAPI {
  getConfig: () => Promise<{
    public: Record<string, string>;
    secrets: Record<string, boolean>;
  }>;
  setSecret: (name: string, value: string | null) => Promise<unknown>;
  savePublicConfig: (config: Record<string, unknown>) => Promise<unknown>;
}

interface Window {
  desktopAPI?: DesktopAPI;
}
