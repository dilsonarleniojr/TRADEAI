// Configuração do motor de IA, guardada no servidor em .data/ai-settings.json (fora do git).
// Chaves digitadas na tela ficam cifradas (AES-256-GCM); a resposta da API nunca as devolve.

import fs from "fs";
import path from "path";
import { sealSecret, openSecret } from "@/lib/secret-box";
import { AI_PROVIDERS, DEFAULT_PROVIDER, getProvider, isProviderId, type AIProviderId } from "./providers";

interface StoredSettings {
  provider: AIProviderId;
  models: Partial<Record<AIProviderId, string>>;
  keys: Partial<Record<AIProviderId, string>>; // cifradas
}

const FILE = path.join(process.cwd(), ".data", "ai-settings.json");

function read(): StoredSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return {
      provider: isProviderId(raw.provider) ? raw.provider : DEFAULT_PROVIDER,
      models: typeof raw.models === "object" && raw.models ? raw.models : {},
      keys: typeof raw.keys === "object" && raw.keys ? raw.keys : {},
    };
  } catch {
    return { provider: DEFAULT_PROVIDER, models: {}, keys: {} };
  }
}

function write(s: StoredSettings) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

export type KeySource = "app" | "env" | null;

export function resolveApiKey(id: AIProviderId): { key: string | null; source: KeySource } {
  const sealed = read().keys[id];
  if (sealed) {
    const key = openSecret(sealed);
    if (key) return { key, source: "app" };
  }
  for (const name of getProvider(id).envKeys) {
    const v = process.env[name];
    if (v) return { key: v, source: "env" };
  }
  return { key: null, source: null };
}

export function getActiveProvider(): AIProviderId {
  return read().provider;
}

export function getModel(id: AIProviderId): string {
  return read().models[id] || getProvider(id).defaultModel;
}

export interface PublicSettings {
  provider: AIProviderId;
  providers: {
    id: AIProviderId;
    model: string;
    configured: boolean;
    keySource: KeySource;
    /** Variável de ambiente que está sendo usada, quando a chave vem do ambiente. */
    envKey: string | null;
  }[];
}

export function getPublicSettings(): PublicSettings {
  const s = read();
  return {
    provider: s.provider,
    providers: AI_PROVIDERS.map((p) => {
      const { key, source } = resolveApiKey(p.id);
      return {
        id: p.id,
        model: s.models[p.id] || p.defaultModel,
        configured: !!key,
        keySource: source,
        envKey: source === "env" ? p.envKeys.find((n) => process.env[n]) ?? null : null,
      };
    }),
  };
}

export interface SettingsUpdate {
  provider?: AIProviderId;
  /** Provedor ao qual model/apiKey/clearKey se referem (padrão: o provider da atualização ou o ativo). */
  target?: AIProviderId;
  model?: string;
  apiKey?: string;
  clearKey?: boolean;
}

export function updateSettings(u: SettingsUpdate): void {
  const s = read();
  const target = u.target ?? u.provider ?? s.provider;
  if (u.provider) s.provider = u.provider;
  if (typeof u.model === "string") {
    const m = u.model.trim();
    if (m) s.models[target] = m;
    else delete s.models[target];
  }
  if (u.clearKey) delete s.keys[target];
  if (typeof u.apiKey === "string" && u.apiKey.trim()) s.keys[target] = sealSecret(u.apiKey.trim());
  write(s);
}
