// Helpers do navegador para a sessão Binance. As chaves nunca ficam no cliente:
// o servidor as guarda em cookie httpOnly criptografado (ver binance-session.ts).

const LEGACY_KEYS = ["binance_api_key", "binance_api_secret", "binance_connected", "binance_testnet"];

export interface BinanceSessionStatus {
  connected: boolean;
  testnet: boolean;
}

// Versões antigas guardavam as chaves em localStorage. Migra para a sessão do servidor
// (se ainda não houver uma) e apaga o rastro local.
async function migrateLegacyCredentials(): Promise<void> {
  const apiKey = localStorage.getItem("binance_api_key");
  const apiSecret = localStorage.getItem("binance_api_secret");
  const testnet = localStorage.getItem("binance_testnet") !== "false";
  try {
    if (apiKey && apiSecret) {
      await fetch("/api/binance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret, testnet }),
      });
    }
  } catch {
    // sem rede: o usuário reconecta manualmente
  } finally {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  }
}

export async function restoreBinanceSession(): Promise<BinanceSessionStatus> {
  try {
    if (localStorage.getItem("binance_api_key")) {
      await migrateLegacyCredentials();
    }
    const res = await fetch("/api/binance/login", { cache: "no-store" });
    const data = await res.json();
    return { connected: !!data.connected, testnet: Boolean(data.testnet) };
  } catch {
    return { connected: false, testnet: false };
  }
}

export async function disconnectBinanceSession(): Promise<void> {
  await fetch("/api/binance/login", { method: "DELETE" }).catch(() => {});
}
