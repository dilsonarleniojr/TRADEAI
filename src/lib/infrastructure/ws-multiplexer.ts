/**
 * WebSocket Multiplexer (Combined Streams) for Binance
 * Establishes a single WebSocket channel and manages subscription topics.
 * Supports exponential backoff reconnection and endpoint failover.
 */

export type WSEventCallback = (stream: string, data: any) => void;

export class WebSocketMultiplexer {
  private socket: WebSocket | null = null;
  private currentEndpointIdx = 0;
  private endpoints = [
    "wss://stream.binance.com:9443/stream?streams=",
    "wss://stream.binance.com:443/stream?streams=",
    "wss://stream.binance.com/stream?streams="
  ];
  private subscriptions = new Set<string>();
  private callbacks = new Set<WSEventCallback>();
  
  private isConnecting = false;
  private reconnectAttempts = 0;
  private baseDelay = 100; // ms
  private maxDelay = 30000; // ms
  private reconnectTimeoutId: any = null;

  constructor(initialStreams: string[] = []) {
    initialStreams.forEach(stream => this.subscriptions.add(stream));
  }

  public addCallback(cb: WSEventCallback) {
    this.callbacks.add(cb);
  }

  public removeCallback(cb: WSEventCallback) {
    this.callbacks.delete(cb);
  }

  public subscribe(streams: string[]) {
    let changed = false;
    streams.forEach(stream => {
      if (!this.subscriptions.has(stream)) {
        this.subscriptions.add(stream);
        changed = true;
      }
    });

    if (changed && this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Re-connect with the new streams
      this.reconnect();
    } else if (changed && !this.socket && !this.isConnecting) {
      this.connect();
    }
  }

  public unsubscribe(streams: string[]) {
    let changed = false;
    streams.forEach(stream => {
      if (this.subscriptions.has(stream)) {
        this.subscriptions.delete(stream);
        changed = true;
      }
    });

    if (changed && this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.reconnect();
    }
  }

  public connect() {
    if (this.isConnecting || (this.socket && this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    if (this.subscriptions.size === 0) {
      console.log("[WS-Multiplexer] No streams subscribed, delaying connection.");
      return;
    }

    this.isConnecting = true;
    const streamsParam = Array.from(this.subscriptions).join("/");
    const endpoint = `${this.endpoints[this.currentEndpointIdx]}${streamsParam}`;
    
    console.log(`[WS-Multiplexer] Connecting to endpoint: ${endpoint}`);

    try {
      this.socket = new WebSocket(endpoint);
      
      this.socket.onopen = () => {
        console.log(`[WS-Multiplexer] Successfully connected to ${this.endpoints[this.currentEndpointIdx]}`);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message && message.stream && message.data) {
            this.callbacks.forEach(cb => cb(message.stream, message.data));
          }
        } catch (e) {
          console.error("[WS-Multiplexer] Error parsing frame:", e);
        }
      };

      this.socket.onerror = (err) => {
        console.error(`[WS-Multiplexer] Socket error on endpoint ${this.endpoints[this.currentEndpointIdx]}:`, err);
      };

      this.socket.onclose = () => {
        console.warn("[WS-Multiplexer] Socket connection closed. Scheduling reconnect.");
        this.isConnecting = false;
        this.socket = null;
        this.handleDisconnect();
      };

    } catch (e) {
      console.error("[WS-Multiplexer] Error establishing connection:", e);
      this.isConnecting = false;
      this.handleDisconnect();
    }
  }

  private handleDisconnect() {
    // Failover: rotate to alternative endpoint
    this.currentEndpointIdx = (this.currentEndpointIdx + 1) % this.endpoints.length;
    
    // Exponential backoff
    const delay = Math.min(this.maxDelay, this.baseDelay * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;

    console.log(`[WS-Multiplexer] Attempting reconnect in ${delay}ms (Attempt #${this.reconnectAttempts})`);

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public reconnect() {
    console.log("[WS-Multiplexer] Forcing reconnection...");
    this.disconnect();
    this.connect();
  }

  public disconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.socket) {
      this.socket.onclose = null; // Prevent handling disconnect callbacks
      this.socket.close();
      this.socket = null;
    }
    this.isConnecting = false;
  }
}

// Global shared instance (optional, for convenience)
export const globalWsMultiplexer = typeof window !== "undefined" ? new WebSocketMultiplexer() : null;
