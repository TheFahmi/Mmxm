import { PrismaClient, type Candle as DbCandle, type Timeframe as DbTimeframe } from '@mmxm/database';
import type { Candle, Timeframe } from '@mmxm/types';
import { TIMEFRAMES } from '@mmxm/types';

const TF_ORDER: Timeframe[] = [...TIMEFRAMES];

// Server-side lookback — prevents ancient data from polluting dealing range / ATR
const LOOKBACK_DAYS: Partial<Record<Timeframe, number>> = { M15: 30, M5: 7, M1: 2, H1: 30, H4: 90, D1: 180 };

/** Load recent candles per timeframe, mapped to engine Candle shape. */
export async function loadCandles(
  prisma: PrismaClient,
  limits: Partial<Record<Timeframe, number>>,
): Promise<Partial<Record<Timeframe, Candle[]>>> {
  const out: Partial<Record<Timeframe, Candle[]>> = {};
  for (const tf of TF_ORDER) {
    const limit = limits[tf];
    if (!limit) continue;
    const lookback = LOOKBACK_DAYS[tf] ?? 30;
    const where: Record<string, unknown> = {
      canonicalSymbol: 'XAUUSD',
      timeframe: tf as DbTimeframe,
      openTime: { gte: new Date(Date.now() - lookback * 86400_000) },
    };
    const rows: DbCandle[] = await prisma.candle.findMany({
      where,
      orderBy: { openTime: 'desc' },
      take: limit,
    });
    // keep latest revision per openTime, then sort ascending
    const byTime = new Map<string, DbCandle>();
    for (const r of rows) {
      const k = r.openTime.toISOString();
      const existing = byTime.get(k);
      if (!existing || r.revision > existing.revision) byTime.set(k, r);
    }
    out[tf] = [...byTime.values()]
      .sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
      .map(r => ({
        openTime: r.openTime.toISOString(),
        closeTime: r.closeTime.toISOString(),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        tickVolume: Number(r.tickVolume),
        realVolume: r.realVolume != null ? Number(r.realVolume) : null,
        spread: r.spread,
        isClosed: r.isClosed,
        revision: r.revision,
      }));
  }
  return out;
}

/** Load candles in a time range (for backtest). Closed only. */
export async function loadCandleRange(
  prisma: PrismaClient,
  tf: Timeframe,
  start: Date,
  end: Date,
): Promise<Candle[]> {
  const rows = await prisma.candle.findMany({
    where: {
      canonicalSymbol: 'XAUUSD',
      timeframe: tf as DbTimeframe,
      openTime: { gte: start, lte: end },
      isClosed: true,
    },
    orderBy: { openTime: 'asc' },
  });
  const byTime = new Map<string, DbCandle>();
  for (const r of rows) {
    const k = r.openTime.toISOString();
    const existing = byTime.get(k);
    if (!existing || r.revision > existing.revision) byTime.set(k, r);
  }
  return [...byTime.values()]
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
    .map(r => ({
      openTime: r.openTime.toISOString(),
      closeTime: r.closeTime.toISOString(),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      tickVolume: Number(r.tickVolume), realVolume: r.realVolume != null ? Number(r.realVolume) : null,
      spread: r.spread, isClosed: true, revision: r.revision,
    }));
}
