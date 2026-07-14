/**
 * Watchdog Timer (Dead Man's Switch)
 * Monitora heartbeat de cada bot. Se bot não emitir sinal por >15s → ERROR.
 * Se >50% dos bots travarem → aciona Kill Switch global.
 */

export interface WatchdogConfig {
  heartbeatTimeoutMs: number;   // default 15000
  globalKillThreshold: number;  // fraction of bots dead to trigger global kill (0.5)
  onBotDead: (botId: string) => void;
  onGlobalKill: () => void;
}

export class WatchdogTimer {
  private config: WatchdogConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: WatchdogConfig) {
    this.config = config;
  }

  start(getBots: () => Array<{ id: string; heartbeatAt: number; status: string }>): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      const bots = getBots();
      if (bots.length === 0) return;
      const now = Date.now();
      let deadCount = 0;

      for (const bot of bots) {
        if (bot.status !== "RUNNING") continue;
        const age = now - bot.heartbeatAt;
        if (age > this.config.heartbeatTimeoutMs) {
          deadCount++;
          this.config.onBotDead(bot.id);
        }
      }

      const runningBots = bots.filter((b) => b.status === "RUNNING");
      if (
        runningBots.length > 0 &&
        deadCount / runningBots.length >= this.config.globalKillThreshold
      ) {
        this.config.onGlobalKill();
      }
    }, 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
