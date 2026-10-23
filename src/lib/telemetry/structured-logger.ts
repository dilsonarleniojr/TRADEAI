import { CircularBuffer } from "./circular-buffer";

export type LogChannel = "MARKET_DATA" | "SIGNALS" | "RISK_ENGINE" | "BINANCE_API";
export type LogSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface StructuredLogEntry {
  id: string;
  timestamp: number;
  formattedTime: string; // HH:mm:ss.SSS
  timestampFormatted?: string;
  channel: LogChannel;
  severity: LogSeverity;
  message: string;
  botId?: string;
  botName?: string;
  symbol?: string;
  metadata?: Record<string, any>;
  details?: Record<string, any>;
}

export type LogListener = (entry: StructuredLogEntry) => void;

function formatTimestampPrecise(date: Date): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${h}:${m}:${s}.${ms}`;
}

let entryCounter = 0;

export class StructuredLogger {
  private buffer: CircularBuffer<StructuredLogEntry>;
  private listeners: Set<LogListener> = new Set();

  constructor(capacity = 2000) {
    this.buffer = new CircularBuffer<StructuredLogEntry>(capacity);
  }

  log(
    channel: LogChannel,
    severity: LogSeverity,
    message: string,
    options?: {
      botId?: string;
      botName?: string;
      symbol?: string;
      metadata?: Record<string, any>;
      timestamp?: number;
      details?: Record<string, any>;
      [key: string]: any;
    }
  ): StructuredLogEntry {
    const ts = options?.timestamp ?? Date.now();
    const date = new Date(ts);
    const isGenericDetails =
      options &&
      !("botId" in options) &&
      !("symbol" in options) &&
      !("metadata" in options) &&
      !("timestamp" in options);
    const resolvedDetails =
      (options as any)?.details || options?.metadata || (isGenericDetails ? options : undefined);

    const entry: StructuredLogEntry = {
      id: `log-${ts}-${++entryCounter}`,
      timestamp: ts,
      formattedTime: formatTimestampPrecise(date),
      timestampFormatted: formatTimestampPrecise(date),
      channel,
      severity,
      message,
      botId: options?.botId,
      botName: options?.botName,
      symbol: options?.symbol,
      metadata: resolvedDetails,
      details: resolvedDetails,
    };

    this.buffer.push(entry);

    // Notifica ouvintes ativos (ex: React state / WebSocket streamer)
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("[StructuredLogger] Error in log listener:", err);
      }
    }

    return entry;
  }

  info(channel: LogChannel, message: string, options?: Parameters<StructuredLogger["log"]>[3]): StructuredLogEntry {
    return this.log(channel, "INFO", message, options);
  }

  warn(channel: LogChannel, message: string, options?: Parameters<StructuredLogger["log"]>[3]): StructuredLogEntry {
    return this.log(channel, "WARN", message, options);
  }

  error(channel: LogChannel, message: string, options?: Parameters<StructuredLogger["log"]>[3]): StructuredLogEntry {
    return this.log(channel, "ERROR", message, options);
  }

  critical(channel: LogChannel, message: string, options?: Parameters<StructuredLogger["log"]>[3]): StructuredLogEntry {
    return this.log(channel, "CRITICAL", message, options);
  }

  getEntries(): StructuredLogEntry[] {
    return this.buffer.toArrayReversed();
  }

  getChronologicalEntries(): StructuredLogEntry[] {
    return this.buffer.toArray();
  }

  size(): number {
    return this.buffer.size;
  }

  get sizeCount(): number {
    return this.buffer.size;
  }

  clear(): void {
    this.buffer.clear();
  }

  addListener(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribe(listener: LogListener): () => void {
    return this.addListener(listener);
  }

  getByChannel(channel: LogChannel): StructuredLogEntry[] {
    return this.getChronologicalEntries().filter((entry) => entry.channel === channel);
  }
}

// Singleton global do logger estruturado
export const structuredLogger = new StructuredLogger(2000);
