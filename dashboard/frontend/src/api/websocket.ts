import { useEffect, useRef, useCallback } from 'react';

const WS_BASE = `ws://${window.location.host}`;

export function useWebSocket<T = any>(
  path: string,
  onMessage: (data: T) => void,
  enabled: boolean = true
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(`${WS_BASE}${path}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // Non-JSON message, ignore
      }
    };

    ws.onerror = () => {
      // Will auto-reconnect on close
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [path, enabled]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}

export function useBinaryWebSocket(
  path: string,
  onFrame: (data: Blob) => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(`${WS_BASE}${path}`);
    ws.binaryType = 'blob';

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        onFrame(event.data);
      }
    };

    return () => {
      ws.close();
    };
  }, [path, enabled]);
}

export function useBinaryWebSocketWithControl(
  path: string,
  onMessage: (data: ArrayBuffer | string) => void,
  enabled: boolean = true
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}${path}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          onMessageRef.current(event.data);
        } else if (typeof event.data === 'string') {
          onMessageRef.current(event.data);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 1000) as any;
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [path, enabled]);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { sendBinary };
}
