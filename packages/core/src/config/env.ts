declare const __LYRA_IMPORT_META_ENV__: {
  readonly VITE_LYRA_ZERO_CONFIG?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_DEEPSEEK_API_KEY?: string;
  readonly VITE_ZHIPU_API_KEY?: string;
  readonly VITE_ZHIPU_EMBEDDING_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
};

function getEnv() {
  return (
    typeof __LYRA_IMPORT_META_ENV__ !== "undefined"
      ? __LYRA_IMPORT_META_ENV__
      : (import.meta as unknown as { env?: Record<string, string | undefined> })
          .env ?? {}
  );
}

export const env = getEnv;
