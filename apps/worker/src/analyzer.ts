import { PrismaClient } from '@mmxm/database';
import { analyze } from '@mmxm/trading-core';
import { DEFAULT_STRATEGY_CONFIG, type MmxmStrategyConfig, type XauusdSignal } from '@mmxm/types';
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { loadCandles } from './candles.js';
import { logger } from './logger.js';
import { notifySignal } from './notify.js';
import { verifySignalWithLlm } from './deepseek.js';

/** Load active strategy config (falls back to defaults). */
async function loadActiveConfig(prisma: PrismaClient) {
  const v = await prisma.strategyVersion.findFirst({
    where: { isActive: true },
    include: { strategy: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!v) return { config: DEFAULT_STRATEGY_CONFIG, versionId: null as string | null };
  return {
    config: { ...DEFAULT_STRATEGY_CONFIG, ...(v.config as Partial<MmxmStrategyConfig>) },
    versionId: v.id,
  };
}

export function signalHash(s: Pick<XauusdSignal, 'direction' | 'preferredEntry' | 'stopLoss' | 'mmxmModel'>): string {
  return createHash('sha256')
    .update(`${s.direction}|${s.mmxmModel}|${s.preferredEntry.toFixed(2)}|${s.stopLoss.toFixed(2)}`)
    .digest('hex')
    .slice(0, 32);
}

/** Run one analysis pass over current market state. */
export async function runAnalysis(prisma: PrismaClient, publish: (event: string, data: unknown) => void) {
  const { config, versionId } = await loadActiveConfig(prisma);

  const candles = await loadCandles(prisma, {
    M1: 100, M5: env.MIN_CANDLES_M5, M15: env.MIN_CANDLES_M15,
    H1: 120, H4: 90, D1: 60,
  });

  const m15 = candles.M15 ?? [];
  const m5 = candles.M5 ?? [];
  if (m15.length < 60 || m5.length < 100) {
    logger.info({ m15: m15.length, m5: m5.length }, 'insufficient candles, skipping');
    return null;
  }

  const out = analyze(
    { symbol: 'XAUUSD', candles: candles as never, config },
    env.ENGINE_VERSION,
  );

  if (!out.signal) {
    logger.debug({ why: out.debug.why, failed: out.debug.failed }, 'no signal');
    return null;
  }

  const sig = out.signal;
  const hash = signalHash(sig);

  // dedupe: identical active signal already exists?
  const existing = await prisma.signal.findFirst({
    where: {
      canonicalSymbol: 'XAUUSD',
      direction: sig.direction,
      status: { in: ['WATCHING', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE'] },
      preferredEntry: { gte: sig.preferredEntry - 0.5, lte: sig.preferredEntry + 0.5 },
      stopLoss: { gte: sig.stopLoss - 0.5, lte: sig.stopLoss + 0.5 },
    },
  });
  if (existing) {
    logger.info({ id: existing.id }, 'duplicate signal, skipping');
    return null;
  }

  if (!versionId) {
    logger.warn('no active strategy version — signal not persisted');
    return null;
  }

  const expiresAt = new Date(sig.expiresAt);

  const created = await prisma.signal.create({
    data: {
      canonicalSymbol: 'XAUUSD',
      direction: sig.direction,
      status: 'CONFIRMED',
      mmxmModel: sig.mmxmModel,
      entryMin: sig.entryMin,
      entryMax: sig.entryMax,
      preferredEntry: sig.preferredEntry,
      stopLoss: sig.stopLoss,
      takeProfits: sig.takeProfits as never,
      riskReward: sig.riskRewardRatio,
      confidence: sig.confidenceScore,
      htfBias: sig.higherTimeframeBias,
      setupTf: 'M15',
      confirmationTf: sig.confirmationTimeframe,
      precisionTf: 'M1',
      invalidationRules: sig.invalidationRules as never,
      strategyVersionId: versionId,
      confirmedAt: new Date(),
      expiresAt,
      reasons: {
        create: sig.reasons.map(r => ({
          code: r.code,
          description: r.description,
          evidenceCandleIds: [],
          weight: r.weight,
        })),
      },
      events: {
        create: [
          { fromStatus: 'NONE', toStatus: 'PRELIMINARY', payload: { hash } as never },
          { fromStatus: 'PRELIMINARY', toStatus: 'CONFIRMED', payload: { confidence: sig.confidenceScore } as never },
        ],
      },
    },
    include: { reasons: true },
  });

  publish('xauusd.signal.created', { id: created.id, direction: sig.direction, entry: sig.preferredEntry, confidence: sig.confidenceScore });
  void notifySignal(created.id, sig);

  // DeepSeek verification (non-blocking; failure keeps the signal)
  void (async () => {
    try {
      const insight = await verifySignalWithLlm({
        direction: sig.direction,
        entry: sig.preferredEntry,
        stopLoss: sig.stopLoss,
        takeProfits: (sig.takeProfits as { price: number }[]).map(tp => tp.price),
        confidence: sig.confidenceScore,
        htfBias: sig.higherTimeframeBias,
        reasons: sig.reasons.map(r => r.description),
        recentCandles: m15.slice(-40).map(c => ({
          openTime: c.openTime,
          open: c.open, high: c.high, low: c.low, close: c.close,
        })),
      });
      if (insight) {
        await prisma.signal.update({
          where: { id: created.id },
          data: {
            aiInsight: insight as never,
            aiVerified: insight.verdict === 'AGREE',
          },
        });
        logger.info({ id: created.id, verdict: insight.verdict }, 'llm verified signal');
      }
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'llm verify post-signal error');
    }
  })();

  logger.info({ id: created.id, dir: sig.direction, entry: sig.preferredEntry, conf: sig.confidenceScore }, 'signal created');
  return created;
}
