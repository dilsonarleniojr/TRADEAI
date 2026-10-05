// Catálogo dos motores de IA (só metadados: pode ser importado no navegador).

export type AIProviderId = "claude" | "openai" | "gemini" | "qwen";

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  vendor: string;
  /** Variáveis de ambiente aceitas para a chave (a primeira é a recomendada). */
  envKeys: string[];
  /** Modelo inicial sugerido; o usuário pode trocar e listar os disponíveis na conta. */
  defaultModel: string;
  /** Onde criar a chave. */
  keyUrl: string;
}

export const AI_PROVIDERS: AIProviderInfo[] = [
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    envKeys: ["ANTHROPIC_API_KEY"],
    defaultModel: "claude-opus-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    vendor: "OpenAI (GPT)",
    envKeys: ["OPENAI_API_KEY"],
    defaultModel: "gpt-5",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Gemini",
    vendor: "Google",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "qwen",
    name: "Qwen",
    vendor: "Alibaba Cloud (DashScope)",
    envKeys: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    defaultModel: "qwen-plus",
    keyUrl: "https://modelstudio.console.alibabacloud.com/",
  },
];

export const DEFAULT_PROVIDER: AIProviderId = "claude";

export function isProviderId(v: unknown): v is AIProviderId {
  return typeof v === "string" && AI_PROVIDERS.some((p) => p.id === v);
}

export function getProvider(id: AIProviderId): AIProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id)!;
}
