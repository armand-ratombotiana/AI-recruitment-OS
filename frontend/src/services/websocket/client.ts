import type {
  WSState,
  WSMessage,
  WSStateInfo,
  WSMessageListener,
  WSStateListener,
  WebSocketClientConfig,
  WSEventName,
} from './types';

const TOKEN_STORAGE_KEY = 'airos_token';
const DEFAULT_URL = 'ws://localhost:8000/api/v1/ws/dashboard';

type ListenerSet<T> = Set<WSMessageListener<T>>;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private state: WSState = 'idle';
  private stateInfo: WSStateInfo = {};
  private listenersByEvent = new Map<WSEventName, ListenerSet<unknown>>();
  private allListeners = new Set<WSMessageListener<unknown>>();
  private stateListeners = new Set<WSStateListener>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;
  private currentToken: string | null = null;
  private mountedRefCount = 0;
  private config: Required<WebSocketClientConfig>;

  constructor(config: WebSocketClientConfig = {}) {
    this.config = {
      url: config.url || DEFAULT_URL,
      baseReconnectDelay: config.baseReconnectDelay ?? 1_000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30_000,
      pingInterval: config.pingInterval ?? 25_000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 20,
    };
  }

  configure(config: WebSocketClientConfig = {}): void {
    if (config.url !== undefined) this.config.url = config.url;
    if (config.baseReconnectDelay !== undefined) this.config.baseReconnectDelay = config.baseReconnectDelay;
    if (config.maxReconnectDelay !== undefined) this.config.maxReconnectDelay = config.maxReconnectDelay;
    if (config.pingInterval !== undefined) {
      this.config.pingInterval = config.pingInterval;
      if (this.state === 'open') this.startPing();
    }
    if (config.maxReconnectAttempts !== undefined) this.config.maxReconnectAttempts = config.maxReconnectAttempts;
  }

  getState(): WSState {
    return this.state;
  }

  getStateInfo(): WSStateInfo {
    return { ...this.stateInfo };
  }

  getConfig(): WebSocketClientConfig {
    return { ...this.config };
  }

  acquire(): void {
    this.mountedRefCount += 1;
  }

  release(): void {
    this.mountedRefCount = Math.max(0, this.mountedRefCount - 1);
  }

  hasConsumers(): boolean {
    return this.mountedRefCount > 0;
  }

  connect(): void {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.explicitlyClosed = false;
    this.currentToken = this.readToken();
    if (!this.currentToken) {
      this.setState('error', { error: 'Missing authentication token' });
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    this.clearReconnectTimer();
    this.stopPing();
    if (!this.currentToken) {
      this.currentToken = this.readToken();
    }
    if (!this.currentToken) {
      this.setState('error', { error: 'Missing authentication token' });
      return;
    }

    const tokenParam = encodeURIComponent(this.currentToken);
    const sep = this.config.url.includes('?') ? '&' : '?';
    const fullUrl = `${this.config.url}${sep}token=${tokenParam}`;

    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting', {
      reconnectAttempt: this.reconnectAttempts,
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(fullUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create WebSocket';
      this.handleConnectionFailure(message);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.stateInfo = {};
      this.setState('open');
      this.startPing();
    };

    ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    ws.onerror = () => {
      this.setState('error', { error: 'WebSocket connection error', lastErrorAt: Date.now() });
    };

    ws.onclose = (event) => {
      this.stopPing();
      this.ws = null;
      if (this.explicitlyClosed) {
        this.setState('closed');
        return;
      }
      this.setState('closed');
      if (this.mountedRefCount > 0) {
        this.scheduleReconnect();
      } else {
        this.setState('idle');
      }
      void event;
    };
  }

  private handleMessage(raw: unknown): void {
    let msg: WSMessage;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw) as WSMessage;
      } catch {
        return;
      }
    } else if (raw && typeof raw === 'object') {
      msg = raw as WSMessage;
    } else {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const eventName = (msg.type || msg.event || 'message') as WSEventName;
    const data = (msg.data ?? msg.payload ?? msg) as unknown;

    if (eventName === 'pong') {
      this.handlePong();
      return;
    }

    this.allListeners.forEach((fn) => this.safeInvoke(fn, data, msg));
    const eventListeners = this.listenersByEvent.get(eventName);
    if (eventListeners) {
      eventListeners.forEach((fn) => this.safeInvoke(fn, data, msg));
    }
  }

  private safeInvoke<T>(fn: WSMessageListener<T>, data: T, msg: WSMessage): void {
    try {
      fn(data, msg);
    } catch {
      /* noop */
    }
  }

  private handleConnectionFailure(message: string): void {
    this.setState('error', { error: message, lastErrorAt: Date.now() });
    if (!this.explicitlyClosed && this.mountedRefCount > 0) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (this.explicitlyClosed) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState('error', { error: 'Maximum reconnect attempts reached', lastErrorAt: Date.now() });
      return;
    }
    this.reconnectAttempts += 1;
    const exponential = Math.min(
      this.config.maxReconnectDelay,
      this.config.baseReconnectDelay * Math.pow(2, Math.max(0, this.reconnectAttempts - 1)),
    );
    const jitter = Math.floor(Math.random() * 500);
    const delay = exponential + jitter;
    this.setState('reconnecting', {
      reconnectAttempt: this.reconnectAttempts,
      nextRetryMs: delay,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentToken = this.readToken();
      if (!this.currentToken) {
        this.setState('error', { error: 'Missing authentication token', lastErrorAt: Date.now() });
        return;
      }
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: WSState, patch: WSStateInfo = {}): void {
    this.state = state;
    this.stateInfo = { ...this.stateInfo, ...patch };
    this.stateListeners.forEach((fn) => {
      try {
        fn(state, { ...this.stateInfo });
      } catch {
        /* noop */
      }
    });
  }

  private startPing(): void {
    this.stopPing();
    if (this.config.pingInterval <= 0) return;
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
      this.schedulePongTimeout();
    }, this.config.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private schedulePongTimeout(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.close(4000, 'pong-timeout');
        } catch {
          /* noop */
        }
      }
    }, 10_000);
  }

  private handlePong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private readToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  send(payload: unknown): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        this.ws.send(body);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  subscribe<T = unknown>(event: WSEventName, listener: WSMessageListener<T>): () => void {
    if (!this.listenersByEvent.has(event)) {
      this.listenersByEvent.set(event, new Set());
    }
    const set = this.listenersByEvent.get(event)!;
    set.add(listener as WSMessageListener<unknown>);
    return () => {
      set.delete(listener as WSMessageListener<unknown>);
    };
  }

  subscribeAll(listener: WSMessageListener<unknown>): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  onState(listener: WSStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state, { ...this.stateInfo });
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  disconnect(code: number = 1000): void {
    this.explicitlyClosed = true;
    this.clearReconnectTimer();
    this.stopPing();
    if (this.ws) {
      try {
        this.ws.close(code);
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.setState('closed');
  }

  reconnectNow(): void {
    this.clearReconnectTimer();
    this.explicitlyClosed = false;
    this.reconnectAttempts = 0;
    this.currentToken = this.readToken();
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    if (this.currentToken) {
      this.openSocket();
    } else {
      this.setState('error', { error: 'Missing authentication token' });
    }
  }

  setToken(token: string | null): void {
    this.currentToken = token;
  }
}

let singleton: WebSocketClient | null = null;

export function getWebSocketClient(config?: WebSocketClientConfig): WebSocketClient {
  if (!singleton) {
    singleton = new WebSocketClient(config);
  } else if (config) {
    singleton.configure(config);
  }
  return singleton;
}

export type { WebSocketClient };
