'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWebSocketClient } from '@/services/websocket/client';
import type {
  WSMessage,
  WSState,
  WSStateInfo,
  WSEventName,
  WSMessageListener,
} from '@/services/websocket/types';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnectionLost?: (info: WSStateInfo) => void;
  onReconnect?: (attempt: number) => void;
  onOpen?: () => void;
}

export interface UseWebSocketReturn<T = unknown> {
  state: WSState;
  stateInfo: WSStateInfo;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  subscribe: (event: WSEventName, listener: WSMessageListener<T>) => () => void;
  subscribeAll: (listener: WSMessageListener<T>) => () => void;
  send: (payload: unknown) => boolean;
  reconnect: () => void;
  disconnect: () => void;
}

export function useWebSocket<T = unknown>(options: UseWebSocketOptions = {}): UseWebSocketReturn<T> {
  const { autoConnect = true, onConnectionLost, onReconnect, onOpen } = options;
  const client = useMemo(() => getWebSocketClient(), []);
  const [state, setState] = useState<WSState>(() => client.getState());
  const [stateInfo, setStateInfo] = useState<WSStateInfo>(() => client.getStateInfo());
  const previousStateRef = useRef<WSState>(client.getState());
  const lostNotifiedRef = useRef(false);
  const reconnectNotifiedRef = useRef<number | null>(null);
  const onConnectionLostRef = useRef(onConnectionLost);
  const onReconnectRef = useRef(onReconnect);
  const onOpenRef = useRef(onOpen);

  onConnectionLostRef.current = onConnectionLost;
  onReconnectRef.current = onReconnect;
  onOpenRef.current = onOpen;

  useEffect(() => {
    const unsubState = client.onState((nextState, info) => {
      setState(nextState);
      setStateInfo(info);
      const prev = previousStateRef.current;
      previousStateRef.current = nextState;

      if (nextState === 'open') {
        if (lostNotifiedRef.current) {
          lostNotifiedRef.current = false;
        }
        const pending = reconnectNotifiedRef.current;
        if (pending !== null) {
          reconnectNotifiedRef.current = null;
          onReconnectRef.current?.(pending);
        }
        onOpenRef.current?.();
      } else if (nextState === 'reconnecting') {
        if (!lostNotifiedRef.current) {
          lostNotifiedRef.current = true;
        }
        if (info.reconnectAttempt !== undefined) {
          reconnectNotifiedRef.current = info.reconnectAttempt;
        }
      } else if (nextState === 'closed' || nextState === 'error') {
        if (prev === 'open' || prev === 'connecting' || prev === 'reconnecting') {
          if (!lostNotifiedRef.current) {
            lostNotifiedRef.current = true;
            onConnectionLostRef.current?.(info);
          }
        }
      }
    });

    return () => {
      unsubState();
    };
  }, [client]);

  useEffect(() => {
    if (!autoConnect) return;
    client.acquire();
    if (client.getState() === 'idle' || client.getState() === 'closed' || client.getState() === 'error') {
      client.connect();
    }
    return () => {
      client.release();
      if (!client.hasConsumers()) {
        client.disconnect();
      }
    };
  }, [autoConnect, client]);

  const subscribe = useCallback(
    (event: WSEventName, listener: WSMessageListener<T>) => client.subscribe<T>(event, listener),
    [client],
  );

  const subscribeAll = useCallback(
    (listener: WSMessageListener<T>) => client.subscribeAll(listener as WSMessageListener<unknown>),
    [client],
  );

  const send = useCallback((payload: unknown) => client.send(payload), [client]);
  const reconnect = useCallback(() => client.reconnectNow(), [client]);
  const disconnect = useCallback(() => client.disconnect(), [client]);

  return {
    state,
    stateInfo,
    isConnected: state === 'open',
    isConnecting: state === 'connecting' || state === 'reconnecting',
    isReconnecting: state === 'reconnecting',
    subscribe,
    subscribeAll,
    send,
    reconnect,
    disconnect,
  };
}

export type { WSMessage, WSState, WSStateInfo, WSEventName, WSMessageListener };
