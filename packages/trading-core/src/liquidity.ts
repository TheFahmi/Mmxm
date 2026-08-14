import type { Candle, LiquidityLevel, LiquidityType, Pivot } from '@mmxm/types';
import { findEqualLevels } from './pivots.js';

/** Session windows in UTC hours (DST-safe: computed on real UTC clock). */
const SESSIONS: Array<{ type: LiquidityType[]; startUtcHour: number; endUtcHour: number }> = [
  { type: ['ASIA_HIGH', 'ASIA_LOW'], startUtcHour: 0, endUtcHour: 7 },
  { type: ['LONDON_HIGH', 'LONDON_LOW'], startUtcHour: 7, endUtcHour: 12 },
  { type: ['NEW_YORK_HIGH', 'NEW_YORK_LOW'], startUtcHour: 12, endUtcHour: 21 },
];

export function detectSessionLevels(
  candles: Candle[], timeframe: string, now: Date,
): LiquidityLevel[] {
  const out: LiquidityLevel[] = [];
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const s of SESSIONS) {
    const winStart = dayStart + s.startUtcHour * 3_600_000;
    const winEnd = dayStart + s.endUtcHour * 3_600_000;
    const inWin = candles.filter(c => {
      const t = new Date(c.openTime).getTime();
      return t >= winStart && t < winEnd && c.isClosed;
    });
    if (inWin.length < 2) continue;
    let hi = -Infinity, lo = Infinity;
    for (const c of inWin) { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); }
    const base = {
      symbol: 'XAUUSD' as const, timeframe, state: 'FRESH' as const,
      sweptAt: null, invalidatedAt: null,
    };
    out.push({ ...base, id: `${s.type[0]}-${dayStart}`, type: s.type[0]!, price: hi, detectedAt: new Date(winEnd).toISOString() });
    out.push({ ...base, id: `${s.type[1]}-${dayStart}`, type: s.type[1]!, price: lo, detectedAt: new Date(winEnd).toISOString() });
  }
  return out;
}

export function detectPrevDayWeekLevels(
  candles: Candle[], timeframe: string, now: Date,
): LiquidityLevel[] {
  const out: LiquidityLevel[] = [];
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const prevDayStart = dayStart - 86_400_000;
  const prevDay = candles.filter(c => {
    const t = new Date(c.openTime).getTime();
    return t >= prevDayStart && t < dayStart && c.isClosed;
  });
  if (prevDay.length) {
    let hi = -Infinity, lo = Infinity;
    for (const c of prevDay) { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); }
    const base = { symbol: 'XAUUSD' as const, timeframe, state: 'FRESH' as const, sweptAt: null, invalidatedAt: null };
    out.push({ ...base, id: `PDH-${prevDayStart}`, type: 'PDH', price: hi, detectedAt: new Date(dayStart).toISOString() });
    out.push({ ...base, id: `PDL-${prevDayStart}`, type: 'PDL', price: lo, detectedAt: new Date(dayStart).toISOString() });
  }
  // previous week (Mon 00:00 UTC boundary)
  const dow = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const thisWeekStart = dayStart - (dow - 1) * 86_400_000;
  const prevWeekStart = thisWeekStart - 7 * 86_400_000;
  const prevWeek = candles.filter(c => {
    const t = new Date(c.openTime).getTime();
    return t >= prevWeekStart && t < thisWeekStart && c.isClosed;
  });
  if (prevWeek.length) {
    let hi = -Infinity, lo = Infinity;
    for (const c of prevWeek) { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); }
    const base = { symbol: 'XAUUSD' as const, timeframe, state: 'FRESH' as const, sweptAt: null, invalidatedAt: null };
    out.push({ ...base, id: `PWH-${prevWeekStart}`, type: 'PWH', price: hi, detectedAt: new Date(thisWeekStart).toISOString() });
    out.push({ ...base, id: `PWL-${prevWeekStart}`, type: 'PWL', price: lo, detectedAt: new Date(thisWeekStart).toISOString() });
  }
  return out;
}

export function pivotsToLiquidity(
  pivots: Pivot[], timeframe: string, toleranceAtr: number, atrValue: number,
): LiquidityLevel[] {
  const out: LiquidityLevel[] = [];
  for (const p of pivots) {
    out.push({
      id: `${p.kind === 'HIGH' ? 'SWING_HIGH' : 'SWING_LOW'}-${p.index}`,
      symbol: 'XAUUSD', timeframe,
      type: p.kind === 'HIGH' ? 'SWING_HIGH' : 'SWING_LOW',
      price: p.price, state: 'FRESH',
      detectedAt: p.time, sweptAt: null, invalidatedAt: null,
    });
  }
  const tol = toleranceAtr * atrValue;
  for (const g of findEqualLevels(pivots, 'HIGH', tol)) {
    out.push({
      id: `EQUAL_HIGH-${g.indices[0]}`, symbol: 'XAUUSD', timeframe,
      type: 'EQUAL_HIGH', price: g.price, state: 'FRESH',
      detectedAt: new Date().toISOString(), sweptAt: null, invalidatedAt: null,
    });
  }
  for (const g of findEqualLevels(pivots, 'LOW', tol)) {
    out.push({
      id: `EQUAL_LOW-${g.indices[0]}`, symbol: 'XAUUSD', timeframe,
      type: 'EQUAL_LOW', price: g.price, state: 'FRESH',
      detectedAt: new Date().toISOString(), sweptAt: null, invalidatedAt: null,
    });
  }
  return out;
}

/**
 * Sweep: wick penetrates level by >= sweepPenetrationAtr*ATR but closes back
 * on the original side. BROKEN if close beyond level.
 */
export function classifyLevelInteraction(
  level: LiquidityLevel, candles: Candle[], sweepPenetrationAtr: number, atrValue: number,
): { state: LiquidityLevel['state']; at: string | null } {
  const isHighSide = level.type.endsWith('HIGH') || level.type === 'PDH' || level.type === 'PWH';
  const isDerived = level.type.startsWith('SWING') || level.type.startsWith('EQUAL');
  const pen = sweepPenetrationAtr * atrValue;
  let touchedAt: string | null = null;
  for (const c of candles) {
    if (!c.isClosed) continue;
    // derived levels (swing/equal) existed at their pivot time even though the
    // pivot is only *confirmed* later — scan from level time. Time/session
    // levels (PDH/ASIA_HIGH/...) only exist after their window closes.
    if (!isDerived && new Date(c.openTime) <= new Date(level.detectedAt)) continue;
    if (isHighSide) {
      if (c.high > level.price + pen && c.close < level.price) return { state: 'SWEPT', at: c.openTime };
      if (c.close > level.price) return { state: 'BROKEN', at: c.openTime };
      if (c.high >= level.price && !touchedAt) touchedAt = c.openTime;
    } else {
      if (c.low < level.price - pen && c.close > level.price) return { state: 'SWEPT', at: c.openTime };
      if (c.close < level.price) return { state: 'BROKEN', at: c.openTime };
      if (c.low <= level.price && !touchedAt) touchedAt = c.openTime;
    }
  }
  if (touchedAt) return { state: 'TOUCHED', at: touchedAt };
  return { state: level.state, at: null };
}
