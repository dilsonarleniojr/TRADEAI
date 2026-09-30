/**
 * Dynamic Endpoint Selector
 * Measures round-trip ping latency to alternative Binance REST API endpoints.
 * Automatically chooses the lowest-latency endpoint for queries.
 */

export interface EndpointMetric {
  url: string;
  latencyMs: number;
  available: boolean;
}

export class DynamicEndpointSelector {
  private endpoints = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com"
  ];
  
  private bestEndpoint = "https://api.binance.com";
  private currentLatency = 0;
  private metrics: EndpointMetric[] = [];
  private checkIntervalId: any = null;

  constructor() {
    this.metrics = this.endpoints.map(url => ({ url, latencyMs: 9999, available: false }));
  }

  public getBestEndpoint(): string {
    return this.bestEndpoint;
  }

  public getBestLatency(): number {
    return this.currentLatency;
  }

  public getMetrics(): EndpointMetric[] {
    return this.metrics;
  }

  /**
   * Pings all endpoints concurrently and returns the best one
   */
  public async selectBestEndpoint(): Promise<string> {
    const promises = this.endpoints.map(async (url) => {
      const startTime = Date.now();
      try {
        // Use standard Binance ping endpoint
        const res = await fetch(`${url}/api/v3/ping`, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
          }
        });
        const latency = Date.now() - startTime;
        return {
          url,
          latencyMs: res.ok ? latency : 9999,
          available: res.ok
        };
      } catch (e) {
        return {
          url,
          latencyMs: 9999,
          available: false
        };
      }
    });

    const results = await Promise.all(promises);
    this.metrics = results;

    const healthy = results.filter(r => r.available);
    if (healthy.length > 0) {
      healthy.sort((a, b) => a.latencyMs - b.latencyMs);
      this.bestEndpoint = healthy[0].url;
      this.currentLatency = healthy[0].latencyMs;
    } else {
      // Fallback
      this.bestEndpoint = this.endpoints[0];
      this.currentLatency = 9999;
    }

    console.log(`[Endpoint-Selector] Best endpoint is ${this.bestEndpoint} with latency ${this.currentLatency}ms`);
    return this.bestEndpoint;
  }

  public startPeriodicCheck(intervalMs = 60000) {
    if (this.checkIntervalId) return;
    
    // Check immediately
    this.selectBestEndpoint().catch(e => console.error("Initial endpoint check failed:", e));

    this.checkIntervalId = setInterval(() => {
      this.selectBestEndpoint().catch(e => console.error("Periodic endpoint selection check failed:", e));
    }, intervalMs);
  }

  public stopPeriodicCheck() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }
}

// Global shared instance
export const globalEndpointSelector = typeof window !== "undefined" ? new DynamicEndpointSelector() : null;
if (globalEndpointSelector) {
  globalEndpointSelector.startPeriodicCheck();
}
