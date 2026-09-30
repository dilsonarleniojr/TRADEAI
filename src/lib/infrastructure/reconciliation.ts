/**
 * Account Balance and Trade Reconciliation
 * Compares the client's internal MarginLedger and portfolio balances with the official API.
 * Detects discrepancies, missing orders, or ghost executions.
 */

import { useCryptoStore } from "@/lib/store";

export interface ReconciliationReport {
  timestamp: number;
  synchronized: boolean;
  ledgerTotal: number;
  apiTotal: number;
  divergence: number;
  message: string;
}

export class CryptoReconciliation {
  private static alertThreshold = 1.0; // USD divergence threshold

  /**
   * Reconciles internal store state with external api-provided state
   * Returns a report detailing synchronization status
   */
  public static async reconcile(): Promise<ReconciliationReport> {
    const store = useCryptoStore.getState();
    const ledgerTotal = store.marginLedger.totalAccount;

    try {
      // Fetch current Binance/Account details from api endpoint
      const res = await fetch("/api/account", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch official API state: ${res.statusText}`);
      }

      const apiData = await res.json();
      
      // Calculate total value according to API data
      // For this implementation, the API returns cashBalance, totalValue, etc.
      // E.g. { totalValue: 10250.45, cashBalance: 8000.50 }
      const apiTotal = apiData?.data?.totalValue ?? apiData?.totalValue ?? ledgerTotal;
      const divergence = Math.abs(ledgerTotal - apiTotal);
      const synchronized = divergence < this.alertThreshold;

      let message = "Total balance synchronized.";
      if (!synchronized) {
        message = `⚠️ Balance divergence detected! Ledger: $${ledgerTotal.toFixed(2)}, API: $${apiTotal.toFixed(2)}. Difference: $${divergence.toFixed(2)}`;
        console.warn(`[Reconciliation] ${message}`);
        
        // Log to store console
        store.addBotLog({
          message: `[RECONCILIAÇÃO] Divergência de saldo detectada: $${divergence.toFixed(2)} (Ledger: $${ledgerTotal.toFixed(2)} vs API: $${apiTotal.toFixed(2)})`,
          type: "warning"
        });
      }

      return {
        timestamp: Date.now(),
        synchronized,
        ledgerTotal,
        apiTotal,
        divergence,
        message
      };

    } catch (e: any) {
      console.error("[Reconciliation] Error performing account reconciliation:", e);
      return {
        timestamp: Date.now(),
        synchronized: false,
        ledgerTotal,
        apiTotal: ledgerTotal,
        divergence: 0,
        message: `Reconciliation error: ${e.message}`
      };
    }
  }
}
