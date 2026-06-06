interface TelemetryEvent {
  id: string;
  type: 'trade' | 'alert' | 'pnl' | 'heartbeat';
  timestamp: string;
  payload: any;
  retryCount: number;
}

class TelemetryManager {
  private queue: TelemetryEvent[] = [];
  private isProcessing = false;
  private isSimulatedFailed = false;

  constructor() {
    if (typeof window !== "undefined") {
      // Start heartbeat every 15 seconds
      setInterval(() => {
        const portfolio = (window as any).useCryptoStore?.getState()?.portfolio;
        this.emit('heartbeat', {
          status: 'alive',
          pnl: portfolio?.pnl ?? 0,
          pnlPercent: portfolio?.pnlPercent ?? 0,
          cashBalance: portfolio?.cashBalance ?? 10000,
        });
      }, 15000);
    }
  }

  setSimulateFailure(fail: boolean) {
    this.isSimulatedFailed = fail;
    console.log(`[TelemetryClient] Simulated failure mode set to: ${fail}`);
  }

  emit(type: TelemetryEvent['type'], payload: any) {
    const event: TelemetryEvent = {
      id: `tele-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      payload,
      retryCount: 0,
    };
    
    this.queue.push(event);
    console.log(`[TelemetryClient] Event queued:`, event);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const event = this.queue[0];
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.isSimulatedFailed) {
          headers['x-simulate-fail'] = 'true';
        }

        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: event.id,
            type: event.type,
            timestamp: event.timestamp,
            payload: event.payload,
          }),
        });

        if (res.ok) {
          this.queue.shift();
          console.log(`[TelemetryClient] Event ${event.id} (${event.type}) sent successfully`);
        } else {
          throw new Error(`Server returned status ${res.status}`);
        }
      } catch (err: any) {
        event.retryCount++;
        const backoffMs = Math.min(1000 * Math.pow(2, event.retryCount), 15000);
        console.error(`[TelemetryClient] Failed to send event ${event.id} (attempt ${event.retryCount}). Retrying in ${backoffMs}ms. Error:`, err.message);
        
        this.isProcessing = false;
        setTimeout(() => this.processQueue(), backoffMs);
        return;
      }
    }

    this.isProcessing = false;
  }
}

export const telemetry = new TelemetryManager();

if (typeof window !== "undefined") {
  (window as any).telemetry = telemetry;
}
