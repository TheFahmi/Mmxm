import type { Candle } from '@mmxm/types';

/** Wilder ATR. Returns array aligned with candles (nulls until period-1). */
export function atr(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRange(candles[i]!, candles[i - 1]!);
  }
  out[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    out[i] = (out[i - 1]! * (period - 1) + trueRange(candles[i]!, candles[i - 1]!)) / period;
  }
  return out;
}

export function trueRange(cur: Candle, prev: Candle): number {
  return Math.max(
    cur.high - cur.low,
    Math.abs(cur.high - prev.close),
    Math.abs(cur.low - prev.close),
  );
}

export function body(c: Candle): number {
  return Math.abs(c.close - c.open);
}

export function range(c: Candle): number {
  return c.high - c.low;
}

export function isBullish(c: Candle): boolean { return c.close > c.open; }
export function isBearish(c: Candle): boolean { return c.close < c.open; }

/** closed-only slice: engine rule — confirmation never uses live candles */
export function closedOnly(candles: Candle[]): Candle[] {
  return candles.filter(c => c.isClosed);
}
