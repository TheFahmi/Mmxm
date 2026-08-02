import type { Candle, StructureEvent, Pivot, Timeframe } from '@mmxm/types';

/**
 * Detect BOS / CHoCH / MSS from confirmed pivots + closed candles.
 * - BOS: break of the most recent pivot in the direction of current trend.
 * - CHoCH: first break against the prior trend.
 * - MSS: CHoCH that also breaks the origin swing (stronger shift).
 *
 * Buffer (ATR fraction) required beyond pivot price to avoid fake breaks.
 * Only closed candles count as break evidence.
 */
export function detectStructure(
  candles: Candle[],
  pivots: Pivot[],
  timeframe: Timeframe,
  bufferAtr: number,
  atrValue: number,
): StructureEvent[] {
  const events: StructureEvent[] = [];
  const buffer = bufferAtr * atrValue;
  if (pivots.length < 2) return events;

  let trend: 'UP' | 'DOWN' | null = null;
  const sorted = [...pivots].sort((a, b) => a.index - b.index);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    // trend inference from pivot sequence
    if (prev.kind === 'HIGH' && cur.kind === 'HIGH') {
      trend = cur.price > prev.price ? 'UP' : trend;
    } else if (prev.kind === 'LOW' && cur.kind === 'LOW') {
      trend = cur.price < prev.price ? 'DOWN' : trend;
    }

    // scan candles after the pivot for a break
    for (let k = cur.index + 1; k < candles.length; k++) {
      const c = candles[k]!;
      if (!c.isClosed) continue;
      if (cur.kind === 'HIGH' && c.close > cur.price + buffer) {
        const kind = trend === 'DOWN' ? (breaksOrigin(sorted, i, 'BEARISH') ? 'MSS' : 'CHOCH') : 'BOS';
        events.push({
          kind, direction: 'BULLISH', breakPrice: cur.price,
          pivotIndex: cur.index, breakCandleIndex: k, timeframe, confirmed: true,
        });
        trend = 'UP';
        break;
      }
      if (cur.kind === 'LOW' && c.close < cur.price - buffer) {
        const kind = trend === 'UP' ? (breaksOrigin(sorted, i, 'BULLISH') ? 'MSS' : 'CHOCH') : 'BOS';
        events.push({
          kind, direction: 'BEARISH', breakPrice: cur.price,
          pivotIndex: cur.index, breakCandleIndex: k, timeframe, confirmed: true,
        });
        trend = 'DOWN';
        break;
      }
    }
  }
  return events;
}

function breaksOrigin(sorted: Pivot[], pivotPos: number, against: 'BULLISH' | 'BEARISH'): boolean {
  // MSS heuristic: the pivot broken is the origin of the prior expansion leg
  // i.e. there exists a same-kind pivot earlier within 2 positions.
  const p = sorted[pivotPos]!;
  for (let i = pivotPos - 1; i >= 0 && i >= pivotPos - 2; i--) {
    if (sorted[i]!.kind === p.kind) {
      if (against === 'BULLISH' && sorted[i]!.price > p.price) return true;
      if (against === 'BEARISH' && sorted[i]!.price < p.price) return true;
    }
  }
  return false;
}
