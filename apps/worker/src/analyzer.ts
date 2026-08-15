import { PrismaClient } from '@mmxm/database';
import { analyze } from '@mmxm/trading-core';
import { DEFAULT_STRATEGY_CONFIG, type MmxmStrategyConfig, type XauusdSignal, type Direction, type MmxmModel, type Bias } from '@mmxm/types';
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { loadCandles } from './candles.js';
import { logger } from './logger.js';
import { notifySignal } from './notify.js';
import { verifySignalWithLlm, detectSignalWithLlm } from './deepseek.js';

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
export interface LlmVerdictStore {
  setLastVerdict: (v: { at: string; direction: string; summary: string; reasons: { code: string; description: string }[]; entry: number | null; stopLoss: number | null }) => Promise<void>;
}

export async function runAnalysis(
  prisma: PrismaClient,
  publish: (event: string, data: unknown) => void,
  llmStore?: LlmVerdictStore,
) {
  const { config, versionId } = await loadActiveConfig(prisma);

  const candles = await loadCandles(prisma, {
    M1: 100, M5: env.MIN_CANDLES_M5, M15: env.MIN_CANDLES_M15,
    H1: 120, H4: 90, D1: 60,
  });

  const m15 = candles.M15 ?? [];
  const m5 = candles.M5 ?? [];
  if (m15.length < 30 || m5.length < 50) {
    logger.info({ m15: m15.length, m5: m5.length }, 'insufficient candles, skipping');
    return null;
  }

  const out = analyze(
    { symbol: 'XAUUSD', candles: candles as never, config },
    env.ENGINE_VERSION,
  );

  let sig: XauusdSignal | null = out.signal;
  let llmGenerated = false;

  if (!sig) {
    logger.debug({ why: out.debug.why, failed: out.debug.failed }, 'no signal (rule engine)');
    // LLM-first fallback: DeepSeek detects a setup from the same candles.
    const llmSig = await detectSignalWithLlm(
      m15.slice(-20).map(c => ({
        openTime: c.openTime,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })),
      m15[m15.length - 1]?.close ?? 0,
    );
    if (!llmSig || llmSig.direction === 'NONE') {
      logger.debug('no signal (llm)');
      if (llmSig && llmStore) {
        await llmStore.setLastVerdict({
          at: new Date().toISOString(),
          direction: 'NONE',
          summary: llmSig.summary ?? 'No valid setup',
          reasons: (llmSig.reasons ?? []).map(r => ({ code: r.code, description: r.description })),
          entry: llmSig.entry ?? null,
          stopLoss: llmSig.stopLoss ?? null,
        });
      }
      return null;
    }
    logger.info({ dir: llmSig.direction, entry: llmSig.entry, conf: llmSig.confidence }, 'llm signal detected');
    const entry = llmSig.entry ?? 0;
    const sl = llmSig.stopLoss ?? 0;
    const risk = Math.abs(entry - sl);
    sig = {
      id: `llm-${Date.now()}`,
      symbol: 'XAUUSD',
      direction: llmSig.direction as Direction,
      status: 'CONFIRMED',
      mmxmModel: (llmSig.mmxmModel === 'MARKET_MAKER_SELL_MODEL'
        ? 'MARKET_MAKER_SELL_MODEL'
        : 'MARKET_MAKER_BUY_MODEL') as MmxmModel,
      entryMin: Math.min(entry, sl + risk * 0.5),
      entryMax: Math.max(entry, sl + risk * 0.5),
      preferredEntry: entry,
      stopLoss: sl,
      takeProfits: llmSig.takeProfits.slice(0, 3).map((tp, i) => ({
        level: (i + 1) as 1 | 2 | 3,
        price: tp,
        allocationPercentage: Math.max(10, 100 - i * 25),
        liquidityTarget: 'LLM',
      })),
      riskRewardRatio: risk > 0 && llmSig.takeProfits[0] != null
        ? Math.abs(llmSig.takeProfits[0] - entry) / risk
        : 1,
      confidenceScore: Math.min(100, Math.round(llmSig.confidence)),
      higherTimeframeBias: (llmSig.htfBias === 'BULLISH' || llmSig.htfBias === 'BEARISH'
        ? llmSig.htfBias
        : 'NEUTRAL') as Bias,
      setupTimeframe: 'M15',
      confirmationTimeframe: 'M5',
      precisionTimeframe: 'M1',
      reasons: llmSig.reasons.map(r => {
        const rawW = r.weight ?? 5;
        // LLM may return 0-100 or 0-1 — normalize to 1..99 for Decimal(5,2) (<1000)
        const w = rawW > 1 ? Math.min(99, Math.round(rawW)) : Math.min(99, Math.round(rawW * 100));
        return { code: r.code, description: r.description, evidenceCandleIds: [], weight: w };
      }),
      invalidationRules: [
        { code: 'SL_HIT', description: 'Stop loss hit', price: sl, condition: 'CLOSE_BELOW' },
      ],
      detectedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
      strategyVersion: 'mmai-v1',
    };
    llmGenerated = true;
    if (llmStore) {
      await llmStore.setLastVerdict({
        at: new Date().toISOString(),
        direction: sig.direction,
        summary: llmSig.summary,
        reasons: llmSig.reasons.map(r => ({ code: r.code, description: r.description })),
        entry: llmSig.entry,
        stopLoss: llmSig.stopLoss,
      });
    }
  }

  if (!sig) return null;
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

  // Anti-spam: same direction within cooldown → skip unless confidence >= 90
  // (cek 10 menit, tapi jangan kirim SHORT 73 → SHORT 73 lagi tiap 10m)
  const lastSameDir = await prisma.signal.findFirst({
    where: { canonicalSymbol: 'XAUUSD', direction: sig.direction },
    orderBy: { detectedAt: 'desc' },
  });
  if (lastSameDir) {
    const ageMs = Date.now() - new Date(lastSameDir.detectedAt).getTime();
    const cooldownMs = 90 * 60 * 1000; // 90 menit
    const isHighConf = sig.confidenceScore >= 90;
    if (ageMs < cooldownMs && !isHighConf) {
      logger.info(
        { ageMins: Math.round(ageMs / 60000), lastId: lastSameDir.id, lastConf: lastSameDir.confidence, newConf: sig.confidenceScore },
        'signal throttled (same direction cooldown 90m, conf <90)',
      );
      return null;
    }
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
      aiVerified: llmGenerated,
      aiInsight: llmGenerated
        ? ({ verdict: 'AGREE', summary: 'LLM-generated signal (' + sig.direction + ')', keyLevels: [], risks: [], suggestion: 'LLM detected setup from recent candles' } as never)
        : (null as never),
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
        recentCandles: m15.slice(-20).map(c => ({
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
