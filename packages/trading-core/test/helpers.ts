import type { Candle } from '@mmxm/types';

/** Build a candle; defaults bullish, closed. */
export function candle(
  openTimeMs: number, o: number, h: number, l: number, c: number, isClosed = true,
): Candle {
  return {
    openTime: new Date(openTimeMs).toISOString(),
    closeTime: new Date(openTimeMs + 299_000).toISOString(),
    open: o, high: h, low: l, close: c,
    tickVolume: 100, realVolume: null, spread: 30, isClosed, revision: 0,
  };
}

/** Flat drifting series. */
export function flatSeries(startMs: number, n: number, base: number, stepMs = 300_000): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push(candle(startMs + i * stepMs, base, base + 0.5, base - 0.5, base + 0.1));
  }
  return out;
}

export const T0 = Date.UTC(2026, 6, 1, 0, 0, 0);
export const M5_MS = 300_000;
export const M15_MS = 900_000;
export const H1_MS = 3_600_000;
export const H4_MS = 14_400_000;
export const D1_MS = 86_400_000;
