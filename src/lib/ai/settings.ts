// Configuração do motor de IA, guardada no servidor em .data/ai-settings.json (fora do git).
// Chaves digitadas na tela ficam cifradas (AES-256-GCM); a resposta da API nunca as devolve.

import fs from "fs";
import path from "path";
import { sealSecret, openSecret } from "@/lib/secret-box";
import { AI_PROVIDERS, DEFAULT_PROVIDER, getProvider, isProviderId, type AIProviderId } from "./providers";

interface StoredSettings {
  provider: AIProviderId;
  activeProviders?: AIProviderId[]; // Provedores ativos para modo Multi-IA
  multiAiEnabled?: boolean;         // Flag para ativar modo Multi-IA simultâneo
  models: Partial<Record<AIProviderId, string>>;
  keys: Partial<Record<AIProviderId, string>>; // cifradas separadamente por IA
}

const FILE = path.join(process.cwd(), ".data", "ai-settings.json");

function read(): StoredSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const primary = isProviderId(raw.provider) ? raw.provider : DEFAULT_PROVIDER;
    const active = Array.isArray(raw.activeProviders)
      ? (raw.activeProviders.filter(isProviderId) as AIProviderId[])
      : [primary];

    return {
      provider: primary,
      activeProviders: active.length > 0 ? active : [primary],
      multiAiEnabled: typeof raw.multiAiEnabled === "boolean" ? raw.multiAiEnabled : false,
      models: typeof raw.models === "object" && raw.models ? raw.models : {},
      keys: typeof raw.keys === "object" && raw.keys ? raw.keys : {},
    };
  } catch {
    return {
      provider: DEFAULT_PROVIDER,
      activeProviders: [DEFAULT_PROVIDER],
      multiAiEnabled: false,
      models: {},
      keys: {},
    };
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

/** Retorna lista de provedores ativos habilitados para uso simultâneo */
export function getActiveProvidersList(): AIProviderId[] {
  const s = read();
  if (!s.multiAiEnabled) return [s.provider];
  const list = s.activeProviders && s.activeProviders.length > 0 ? s.activeProviders : [s.provider];
  return list;
}

export function getModel(id: AIProviderId): string {
  const custom = read().models[id];
  if (custom) return custom;
  if (id === "gemini" && process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL;
  }
  return getProvider(id).defaultModel;
}

export interface PublicSettings {
  provider: AIProviderId;
  activeProviders: AIProviderId[];
  multiAiEnabled: boolean;
  providers: {
    id: AIProviderId;
    name: string;
    vendor: string;
    model: string;
    configured: boolean;
    active: boolean; // se está na lista de ativos simultâneos
    keySource: KeySource;
    envKey: string | null;
  }[];
}

export function getPublicSettings(): PublicSettings {
  const s = read();
  const activeSet = new Set(s.activeProviders || [s.provider]);

  return {
    provider: s.provider,
    activeProviders: s.activeProviders || [s.provider],
    multiAiEnabled: s.multiAiEnabled ?? true,
    providers: AI_PROVIDERS.map((p) => {
      const { key, source } = resolveApiKey(p.id);
      return {
        id: p.id,
        name: p.name,
        vendor: p.vendor,
        model: s.models[p.id] || p.defaultModel,
        configured: !!key,
        active: activeSet.has(p.id),
        keySource: source,
        envKey: source === "env" ? p.envKeys.find((n) => process.env[n]) ?? null : null,
      };
    }),
  };
}

export interface SettingsUpdate {
  provider?: AIProviderId;
  activeProviders?: AIProviderId[];
  multiAiEnabled?: boolean;
  /** Provedor ao qual model/apiKey/clearKey se referem (padrão: o provider da atualização ou o ativo). */
  target?: AIProviderId;
  model?: string;
  apiKey?: string;
  clearKey?: boolean;
}

export function updateSettings(u: SettingsUpdate): void {
  const s = read();
  const target = u.target ?? u.provider ?? s.provider;

  if (u.provider && isProviderId(u.provider)) {
    s.provider = u.provider;
  }

  if (Array.isArray(u.activeProviders)) {
    s.activeProviders = u.activeProviders.filter(isProviderId);
  }

  if (typeof u.multiAiEnabled === "boolean") {
    s.multiAiEnabled = u.multiAiEnabled;
  }

  if (typeof u.model === "string") {
    const m = u.model.trim();
    if (m) s.models[target] = m;
    else delete s.models[target];
  }

  if (u.clearKey) {
    delete s.keys[target];
  }

  if (typeof u.apiKey === "string" && u.apiKey.trim()) {
    s.keys[target] = sealSecret(u.apiKey.trim());
  }

  write(s);
}
