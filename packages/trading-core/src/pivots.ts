import type { Candle, Pivot } from '@mmxm/types';

/**
 * Confirmed pivots only: a pivot at index i is locked only after
 * `rightBars` closed candles to its right. No repaint.
 */
export function findPivots(candles: Candle[], leftBars: number, rightBars: number): Pivot[] {
  const out: Pivot[] = [];
  const n = candles.length;
  for (let i = leftBars; i < n - rightBars; i++) {
    const c = candles[i]!;
    let isHigh = true, isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      const o = candles[j]!;
      if (o.high >= c.high) isHigh = false;
      if (o.low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ index: i, time: c.openTime, price: c.high, kind: 'HIGH', confirmed: true });
    if (isLow) out.push({ index: i, time: c.openTime, price: c.low, kind: 'LOW', confirmed: true });
  }
  return out;
}

/** Equal highs/lows within tolerance (ATR-based). */
export function findEqualLevels(
  pivots: Pivot[], kind: 'HIGH' | 'LOW', tolerance: number,
): Array<{ price: number; indices: number[] }> {
  const same = pivots.filter(p => p.kind === kind);
  const groups: Array<{ price: number; indices: number[] }> = [];
  const used = new Set<number>();
  for (let i = 0; i < same.length; i++) {
    if (used.has(i)) continue;
    const g = [same[i]!.index];
    let sum = same[i]!.price;
    for (let j = i + 1; j < same.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(same[j]!.price - same[i]!.price) <= tolerance) {
        g.push(same[j]!.index);
        sum += same[j]!.price;
        used.add(j);
      }
    }
    if (g.length >= 2) {
      used.add(i);
      groups.push({ price: sum / g.length, indices: g });
    }
  }
  return groups;
}
