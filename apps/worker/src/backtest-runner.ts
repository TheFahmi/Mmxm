import { PrismaClient } from '@mmxm/database';
import { analyze } from '@mmxm/trading-core';
import { DEFAULT_STRATEGY_CONFIG, type MmxmStrategyConfig, type Timeframe, type Candle } from '@mmxm/types';
import { loadCandleRange } from './candles.js';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Replay historical candles through the engine — walk-forward, no lookahead:
 * at each M15 close, the engine only sees candles closed at or before that time.
 */
export async function runBacktest(prisma: PrismaClient, data: { backtestId: string }): Promise<void> {
  const bt = await prisma.backtest.findUnique({
    where: { id: data.backtestId },
    include: { strategyVersion: true },
  });
  if (!bt) throw new Error(`backtest ${data.backtestId} not found`);

  await prisma.backtest.update({ where: { id: bt.id }, data: { status: 'RUNNING' } });

  try {
    const config: MmxmStrategyConfig = {
      ...DEFAULT_STRATEGY_CONFIG,
      ...((bt.strategyVersion?.config as Partial<MmxmStrategyConfig> | null) ?? {}),
    };

    // load full ranges once (index access — engine sees slices only)
    const [m15, m5, h1, h4, d1, m1] = await Promise.all([
      loadCandleRange(prisma, 'M15', bt.fromTs, bt.toTs),
      loadCandleRange(prisma, 'M5', bt.fromTs, bt.toTs),
      loadCandleRange(prisma, 'H1', new Date(bt.fromTs.getTime() - 30 * 86_400_000), bt.toTs),
      loadCandleRange(prisma, 'H4', new Date(bt.fromTs.getTime() - 60 * 86_400_000), bt.toTs),
      loadCandleRange(prisma, 'D1', new Date(bt.fromTs.getTime() - 120 * 86_400_000), bt.toTs),
      loadCandleRange(prisma, 'M1', bt.fromTs, bt.toTs),
    ]);

    if (m15.length < 50) throw new Error('insufficient M15 history for backtest range');

    const signals: { time: string; direction: string; entry: number; sl: number; tps: { price: number }[]; outcome?: string; rr?: number }[] = [];
    const seen = new Set<string>();

    // walk forward over M15 closes
    for (let i = 60; i < m15.length; i++) {
      const cut = m15[i]!.openTime;
      const cutMs = new Date(cut).getTime();
      const slice = (cs: Candle[]) => cs.filter(c => new Date(c.openTime).getTime() <= cutMs);

      const out = analyze({
        symbol: 'XAUUSD',
        candles: {
          M1: slice(m1).slice(-100),
          M5: slice(m5).slice(-200),
          M15: m15.slice(0, i + 1),
          H1: slice(h1).slice(-120),
          H4: slice(h4).slice(-90),
          D1: slice(d1).slice(-60),
        } as Record<Timeframe, Candle[]>,
        config,
      }, env.ENGINE_VERSION);

      if (!out.signal) continue;
      const key = `${out.signal.direction}|${out.signal.preferredEntry.toFixed(1)}|${out.signal.stopLoss.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // resolve outcome: scan forward M5 for TP1 hit vs SL hit (simplified — TP1 or SL, first touch wins)
      const entry = out.signal.preferredEntry;
      const sl = out.signal.stopLoss;
      const tp1 = out.signal.takeProfits[0]?.price;
      const future = slice(m5).filter(c => new Date(c.openTime).getTime() > cutMs);
      let outcome: string | undefined;
      let rr: number | undefined;
      if (tp1 != null) {
        const long = out.signal.direction === 'LONG';
        for (const c of future) {
          const slHit = long ? c.low <= sl : c.high >= sl;
          const tpHit = long ? c.high >= tp1 : c.low <= tp1;
          // conservative: if both in same candle, assume SL first
          if (slHit) { outcome = 'LOSS'; rr = -1; break; }
          if (tpHit) { outcome = 'WIN'; rr = Math.abs(tp1 - entry) / Math.abs(entry - sl); break; }
        }
      }
      signals.push({
        time: cut,
        direction: out.signal.direction,
        entry, sl,
        tps: out.signal.takeProfits.map(t => ({ price: t.price })),
        ...(outcome ? { outcome } : {}),
        ...(rr != null ? { rr } : {}),
      });
    }

    const resolved = signals.filter(s => s.outcome);
    const wins = resolved.filter(s => s.outcome === 'WIN').length;
    const summary = {
      totalSignals: signals.length,
      resolved: resolved.length,
      winRate: resolved.length ? wins / resolved.length : null,
      avgRR: resolved.length && resolved.some(s => s.rr != null)
        ? resolved.reduce((a, s) => a + (s.rr ?? 0), 0) / resolved.length
        : null,
      engineVersion: env.ENGINE_VERSION,
    };

    await prisma.backtest.update({
      where: { id: bt.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        summary: summary as never,
        trades: {
          create: signals.map(s => ({
            direction: s.direction as 'LONG' | 'SHORT',
            entryPrice: s.entry,
            exitPrice: s.outcome ? (s.outcome === 'WIN' ? s.tps[0]?.price ?? null : s.sl) : null,
            pnl: s.rr != null ? s.rr : null,
            exitReason: s.outcome ?? null,
            enteredAt: new Date(s.time),
          })),
        },
      },
    });
    logger.info({ id: bt.id, ...summary }, 'backtest completed');
  } catch (err) {
    await prisma.backtest.update({
      where: { id: bt.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}
