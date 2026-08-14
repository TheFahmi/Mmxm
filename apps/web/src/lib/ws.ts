'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const WS = process.env.NEXT_PUBLIC_WS_URL ?? 'https://trade.mfah.me';

/** Subscribe to a WS event; auto-reconnect with REST fallback flag. */
export function useWsEvent<T>(event: string, onMessage: (data: T) => void) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    const socket: Socket = io(WS, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(event, (data: T) => cbRef.current(data));
    return () => { socket.disconnect(); };
  }, [event]);

  return connected;
}
