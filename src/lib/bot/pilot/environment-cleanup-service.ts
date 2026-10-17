import crypto from "crypto";
import { RiskManager } from "../risk-manager";

export interface CleanupReport {
  timestampSynced: boolean;
  timeOffsetMs: number;
  openOrdersCancelled: number;
  residualPositionsFound: string[];
  localSafetyGatesReset: boolean;
  baselineBalanceUsd: number;
  errors: string[];
}

export class EnvironmentCleanupService {
  private static instance: EnvironmentCleanupService;
  private timeOffsetMs: number = 0;

  private constructor() {}

  public static getInstance(): EnvironmentCleanupService {
    if (!EnvironmentCleanupService.instance) {
      EnvironmentCleanupService.instance = new EnvironmentCleanupService();
    }
    return EnvironmentCleanupService.instance;
  }

  public getTimeOffsetMs(): number {
    return this.timeOffsetMs;
  }

  public getSynchronizedTimestamp(): number {
    return Date.now() + this.timeOffsetMs;
  }

  /**
   * 1. Sincronização de Relógio com o servidor da Binance
   * Previne de imediato o erro -1021 (Timestamp outside of recvWindow)
   */
  public async syncServerTime(baseUrl = "https://api.binance.com"): Promise<number> {
    const localBefore = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/v3/time`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.serverTime) {
          const localAfter = Date.now();
          const latency = (localAfter - localBefore) / 2;
          this.timeOffsetMs = Math.round(data.serverTime - (localBefore + latency));
          console.log(`[EnvironmentCleanupService] Relógio sincronizado com a Binance. Offset: ${this.timeOffsetMs}ms`);
          return this.timeOffsetMs;
        }
      }
    } catch (e: any) {
      console.warn(`[EnvironmentCleanupService] Falha ao sincronizar tempo com Binance:`, e.message);
    }
    return this.timeOffsetMs;
  }

  /**
   * 2. Cancelar todas as ordens abertas vinculadas à API key nos pares especificados
   */
  public async cancelAllOpenOrders(
    symbols: string[],
    apiKey?: string,
    apiSecret?: string,
    baseUrl = "https://api.binance.com"
  ): Promise<{ cancelledCount: number; errors: string[] }> {
    let cancelledCount = 0;
    const errors: string[] = [];

    if (!apiKey || !apiSecret) {
      console.log("[EnvironmentCleanupService] Modo simulação/sem chaves: nenhuma ordem externa para cancelar.");
      return { cancelledCount: 0, errors: [] };
    }

    for (const symbol of symbols) {
      const sym = symbol.toUpperCase();
      try {
        const timestamp = this.getSynchronizedTimestamp();
        const queryString = `symbol=${sym}&timestamp=${timestamp}&recvWindow=5000`;
        const signature = crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");

        const res = await fetch(`${baseUrl}/api/v3/openOrders?${queryString}&signature=${signature}`, {
          method: "DELETE",
          headers: {
            "X-MBX-APIKEY": apiKey,
          },
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          const data = await res.json();
          const count = Array.isArray(data) ? data.length : 1;
          cancelledCount += count;
          console.log(`[EnvironmentCleanupService] Canceladas ${count} ordens abertas para ${sym}`);
        } else if (res.status === 400) {
          // 400 pode ser "No open orders for symbol", que é normal
          console.log(`[EnvironmentCleanupService] Nenhuma ordem aberta encontrada para ${sym}`);
        } else {
          const errText = await res.text();
          errors.push(`Erro HTTP ${res.status} em ${sym}: ${errText}`);
        }
      } catch (err: any) {
        errors.push(`Falha de rede ao cancelar ordens em ${sym}: ${err.message}`);
      }
    }

    return { cancelledCount, errors };
  }

  /**
   * 3. Auditoria de resíduos em carteira e saldos bloqueados
   */
  public async auditResidualPositions(
    apiKey?: string,
    apiSecret?: string,
    baseUrl = "https://api.binance.com"
  ): Promise<{ residuals: string[]; freeUsdt: number; errors: string[] }> {
    const residuals: string[] = [];
    const errors: string[] = [];
    let freeUsdt = 70.0;

    if (!apiKey || !apiSecret) {
      return { residuals: [], freeUsdt: 70.0, errors: [] };
    }

    try {
      const timestamp = this.getSynchronizedTimestamp();
      const queryString = `timestamp=${timestamp}&recvWindow=5000`;
      const signature = crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");

      const res = await fetch(`${baseUrl}/api/v3/account?${queryString}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        const balances: Array<{ asset: string; free: string; locked: string }> = data.balances || [];

        for (const b of balances) {
          const free = parseFloat(b.free);
          const locked = parseFloat(b.locked);
          if (b.asset === "USDT") {
            freeUsdt = free;
          } else if (free > 0 || locked > 0) {
            residuals.push(`${b.asset} (Livre: ${free}, Travado: ${locked})`);
          }
        }
      } else {
        const errText = await res.text();
        errors.push(`Erro ao consultar saldo da conta: HTTP ${res.status} - ${errText}`);
      }
    } catch (err: any) {
      errors.push(`Falha ao auditar conta: ${err.message}`);
    }

    return { residuals, freeUsdt, errors };
  }

  /**
   * 4. Reset de Travas Locais, Cooldowns e Contadores de Segurança
   * Zera a linha de base para contagem de PnL a partir de exatos $70.00 USD
   */
  public resetLocalSafetyGates(baselineUsd = 70.0): boolean {
    try {
      const rm = RiskManager.getInstance();
      rm.resetCircuitBreakers();

      // Resetar o Circuit Breaker específico do piloto de $70 USD
      const { PilotRiskCircuitBreaker } = require("./pilot-circuit-breaker");
      PilotRiskCircuitBreaker.getInstance().reset(baselineUsd);

      // Limpar chaves locais se estiver em ambiente de browser ou store
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem("tradeai_circuit_breaker_tripped");
        localStorage.removeItem("tradeai_consecutive_loss_brake");
        localStorage.removeItem("tradeai_pilot_daily_pnl");
      }

      console.log(`[EnvironmentCleanupService] Travas locais zeradas. Linha de base definida em $${baselineUsd.toFixed(2)} USD.`);
      return true;
    } catch (err: any) {
      console.warn(`[EnvironmentCleanupService] Erro ao resetar travas locais:`, err.message);
      return false;
    }
  }

  /**
   * Executa a purga preliminar completa (Fase 0 Obrigatória)
   */
  public async executePreFlightPurge(
    symbols: string[],
    apiKey?: string,
    apiSecret?: string,
    baselineUsd = 70.0,
    baseUrl = "https://api.binance.com"
  ): Promise<CleanupReport> {
    console.log(`[EnvironmentCleanupService] Iniciando Fase 0: Purga Preliminar e Reset de Estado...`);

    const offset = await this.syncServerTime(baseUrl);
    const orderResult = await this.cancelAllOpenOrders(symbols, apiKey, apiSecret, baseUrl);
    const auditResult = await this.auditResidualPositions(apiKey, apiSecret, baseUrl);
    const gatesReset = this.resetLocalSafetyGates(baselineUsd);

    return {
      timestampSynced: true,
      timeOffsetMs: offset,
      openOrdersCancelled: orderResult.cancelledCount,
      residualPositionsFound: auditResult.residuals,
      localSafetyGatesReset: gatesReset,
      baselineBalanceUsd: baselineUsd,
      errors: [...orderResult.errors, ...auditResult.errors],
    };
  }
}
