/// <reference types="vite/client" />

declare const __LYRA_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_LYRA_ZERO_CONFIG?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_DEEPSEEK_API_KEY?: string;
  readonly VITE_ZHIPU_API_KEY?: string;
  readonly VITE_FXB_API_KEY?: string;
  readonly VITE_ZHIPU_EMBEDDING_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
