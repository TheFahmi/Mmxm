import type { Candle, Fvg, OrderBlock } from '@mmxm/types';
import { isBullish, isBearish, range } from './measure.js';

/**
 * Fair Value Gap: 3-candle imbalance. Bullish FVG at i if
 * low[i+1] > high[i-1] (gap between candle i-1 high and candle i+1 low).
 * Minimum size = minimumFvgAtr * atr. Only closed candles.
 */
export function detectFvgs(candles: Candle[], minimumFvgAtr: number, atrValue: number): Fvg[] {
  const out: Fvg[] = [];
  const minSize = minimumFvgAtr * atrValue;
  for (let i = 1; i < candles.length - 1; i++) {
    const a = candles[i - 1]!, b = candles[i]!, c = candles[i + 1]!;
    if (!a.isClosed || !b.isClosed || !c.isClosed) continue;
    if (c.low > a.high && c.low - a.high >= minSize) {
      out.push({
        direction: 'BULLISH', low: a.high, high: c.low,
        formedAtIndex: i, mitigated: false,
        evidenceCandleIds: [a.openTime, b.openTime, c.openTime],
      });
    }
    if (c.high < a.low && a.low - c.high >= minSize) {
      out.push({
        direction: 'BEARISH', low: c.high, high: a.low,
        formedAtIndex: i, mitigated: false,
        evidenceCandleIds: [a.openTime, b.openTime, c.openTime],
      });
    }
  }
  // mitigation: later closed price trades back through the gap
  for (const f of out) {
    for (let k = f.formedAtIndex + 2; k < candles.length; k++) {
      const c = candles[k]!;
      if (!c.isClosed) continue;
      if (f.direction === 'BULLISH' && c.low <= f.high) { f.mitigated = true; break; }
      if (f.direction === 'BEARISH' && c.high >= f.low) { f.mitigated = true; break; }
    }
  }
  return out;
}

/**
 * Order Block: final opposite-direction candle before a displacement leg.
 * Bullish OB = last bearish candle before bullish displacement.
 */
export function detectOrderBlocks(
  candles: Candle[],
  displacementIndices: number[],
): OrderBlock[] {
  const out: OrderBlock[] = [];
  for (const di of displacementIndices) {
    const d = candles[di]!;
    if (!d.isClosed) continue;
    const bullish = isBullish(d);
    // walk back up to 3 candles for last opposite candle
    for (let j = di - 1; j >= Math.max(0, di - 3); j--) {
      const c = candles[j]!;
      if (!c.isClosed) continue;
      if (bullish && isBearish(c)) {
        out.push({
          direction: 'BULLISH', low: c.low, high: c.high,
          formedAtIndex: j, mitigated: false, evidenceCandleIds: [c.openTime],
        });
        break;
      }
      if (!bullish && isBullish(c)) {
        out.push({
          direction: 'BEARISH', low: c.low, high: c.high,
          formedAtIndex: j, mitigated: false, evidenceCandleIds: [c.openTime],
        });
        break;
      }
    }
  }
  return out;
}

export function fvgContains(f: Fvg, price: number): boolean {
  return price >= f.low && price <= f.high;
}

export function obContains(o: OrderBlock, price: number): boolean {
  return price >= o.low && price <= o.high;
}

export function largestRange(candles: Candle[]): number {
  return candles.reduce((m, c) => Math.max(m, range(c)), 0);
}
