'use client';

import { create } from 'zustand';

interface MarketState {
  bid: number | null;
  ask: number | null;
  spreadPoints: number | null;
  lastTickAt: string | null;
  terminalStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
  setTick: (t: { bid: number; ask: number; spreadPoints: number; brokerTimestampMs: number }) => void;
  setTerminalStatus: (s: MarketState['terminalStatus']) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  bid: null,
  ask: null,
  spreadPoints: null,
  lastTickAt: null,
  terminalStatus: 'UNKNOWN',
  setTick: (t) => set({
    bid: t.bid,
    ask: t.ask,
    spreadPoints: t.spreadPoints,
    lastTickAt: new Date(t.brokerTimestampMs).toISOString(),
  }),
  setTerminalStatus: (s) => set({ terminalStatus: s }),
}));
