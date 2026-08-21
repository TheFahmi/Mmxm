import { PrismaClient } from '@mmxm/database';
import { analyze } from '@mmxm/trading-core';
import { DEFAULT_STRATEGY_CONFIG, type MmxmStrategyConfig, type XauusdSignal, type Direction, type MmxmModel, type Bias } from '@mmxm/types';
import { createHash } from 'node:crypto';
import { env } from './env.js';
import { loadCandles } from './candles.js';
import { logger } from './logger.js';
import { notifySignal, notifyEvent, notifyInsight, tgBroadcast, tgSendToChat, formatSignalText } from './notify.js';
import { listSubscribers } from './telegram-bot.js';
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
  // Nugget: XAUUSD tutup Jumat 22:00 UTC — Sabtu/Minggu market libur, jangan halusinasi sinyal dari candle stale
  {
    const lastM15 = m15[m15.length - 1];
    const ageMs = lastM15 ? Date.now() - new Date(lastM15.openTime as unknown as string).getTime() : Infinity;
    const ageMin = Math.round(ageMs / 60000);
    const STALE_MIN = 60; // candle terakhir >60 menit = market tutup
    if (!lastM15 || ageMs > STALE_MIN * 60_000) {
      logger.info({ ageMin, lastOpen: lastM15?.openTime }, 'market closed (stale candles), skipping analysis');
      if (llmStore) {
        await llmStore.setLastVerdict({
          at: new Date().toISOString(),
          direction: 'NONE',
          summary: 'Market tutup — XAUUSD libur Sabtu-Minggu. Analisa lanjut Senin 05:00 WIB saat market buka.',
          reasons: [{ code: 'MARKET_CLOSED', description: `Candle terakhir ${lastM15 ? new Date(lastM15.openTime as unknown as string).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : 'tidak ada'} — sudah ${ageMin} menit lalu. Tunggu market buka.` }],
          entry: null,
          stopLoss: null,
        });
      }
      return null;
    }
  }
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
    // LLM-first fallback: DeepSeek detects setup same candles.
    // currentPrice WAJIB real-time (tick terbaru), bukan close candle — candle M15 bisa basi 15 menit
    const latestTick = await prisma.tick.findFirst({
      where: { canonicalSymbol: 'XAUUSD' },
      orderBy: { brokerTsMs: 'desc' },
    });
    const livePrice = latestTick
      ? (Number(latestTick.last) > 0 ? Number(latestTick.last) : Number(latestTick.bid))
      : m15[m15.length - 1]?.close ?? 0;
    const llmSig = await detectSignalWithLlm(
      m15.slice(-12).map(c => ({ // reduce from 20 to 12 candles (3h vs 5h)
        openTime: c.openTime,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })),
      livePrice,
    );
    if (!llmSig || llmSig.direction === 'NONE') {
      logger.debug('no signal (llm)');
      if (llmSig && llmStore) {
        await llmStore.setLastVerdict({
          at: new Date().toISOString(),
          direction: 'NONE',
          summary: llmSig.summary ?? 'No valid setup',
          reasons: (llmSig.reasons ?? []).map(r => ({ code: r.code, description: r.description })),
          entry: llmSig.entry && llmSig.entry > 0 ? llmSig.entry : null,
          stopLoss: llmSig.stopLoss && llmSig.stopLoss > 0 ? llmSig.stopLoss : null,
        });
      }
      return null;
    }
    logger.info({ dir: llmSig.direction, entry: llmSig.entry, conf: llmSig.confidence }, 'llm signal detected');
    const entry = llmSig.entry ?? 0;
    const sl = llmSig.stopLoss ?? 0;
    const risk = Math.abs(entry - sl);
    // Sanity check real-time: entry harus reachable dari harga live.
    // Sinyal dengan entry > 1.5xATR15 dari harga sekarang = stale (harga sudah lari) -> buang.
    // Tanpa ini: sinyal lahir saat harga jauh di luar zone -> instan ACTIVE + TP palsu (kasus 2ff8dc88).
    const atr15 = (() => {
      const c = m15.slice(-15);
      if (c.length < 2) return 5;
      let sum = 0;
      for (let i = 1; i < c.length; i++) {
        const cur = c[i]!;
        const prevClose = Number(c[i - 1]!.close);
        sum += Math.max(Number(cur.high) - Number(cur.low), Math.abs(Number(cur.high) - prevClose), Math.abs(Number(cur.low) - prevClose));
      }
      return sum / (c.length - 1) || 5;
    })();
    if (livePrice > 0 && risk > 0 && Math.abs(entry - livePrice) > 1.5 * atr15) {
      logger.info({ entry, livePrice, dist: Math.abs(entry - livePrice), atr15 }, 'llm signal rejected: stale entry (too far from live price)');
      return null;
    }
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
        // % POSISI YANG DI-CLOSE di level ini: TP1=25%, TP2=25%, TP3=sisa 50%
        allocationPercentage: i === 0 ? 25 : i === 1 ? 25 : 50,
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
    const cooldownMs = 30 * 60 * 1000; // 30 menit
    const isHighConf = sig.confidenceScore >= 90;
    const isClosed = ['STOPPED', 'COMPLETED', 'INVALIDATED', 'EXPIRED'].includes(lastSameDir.status);
    // closed signal → next one allowed immediately (no cooldown block)
    if (!isClosed && ageMs < cooldownMs && !isHighConf) {
      logger.info(
        { ageMins: Math.round(ageMs / 60000), lastId: lastSameDir.id, lastConf: lastSameDir.confidence, newConf: sig.confidenceScore },
        'signal throttled (same direction cooldown 90m, conf <90)',
      );
      return null;
    }
  }

  // Hanya satu posisi open pada satu waktu: kalau ada signal arah LAWAN yang masih open,
  // tapi jika confidence baru > confidence lawan → biarkan (conviction lebih kuat).
  // TPx_HIT sudah closed (partial profit) — jangan dianggap open/antri
  const openSameDir = await prisma.signal.findFirst({
    where: {
      canonicalSymbol: 'XAUUSD',
      direction: sig.direction,
      status: { in: ['WATCHING', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE'] },
    },
    orderBy: { detectedAt: 'desc' },
  });
  if (openSameDir) {
    logger.info(
      { openId: openSameDir.id, openDir: openSameDir.direction, openConf: openSameDir.confidence, newConf: sig.confidenceScore },
      'same-direction position open, skipping (anti-duplicate)',
    );
    return null;
  }

  const openOpposite = await prisma.signal.findFirst({
    where: {
      canonicalSymbol: 'XAUUSD',
      direction: sig.direction === 'LONG' ? 'SHORT' : 'LONG',
      status: { in: ['WATCHING', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE'] },
    },
    orderBy: { detectedAt: 'desc' },
  });
  if (openOpposite) {
    const oppositeConf = openOpposite.confidence ?? 0;
    if (sig.confidenceScore <= oppositeConf) {
      logger.info({ openId: openOpposite.id, openDir: openOpposite.direction, openConf: oppositeConf, newDir: sig.direction, newConf: sig.confidenceScore }, 'opposite position open, skipping (anti-hedge: new conf not higher)');
      return null;
    }
    logger.info({ openId: openOpposite.id, openDir: openOpposite.direction, openConf: oppositeConf, newDir: sig.direction, newConf: sig.confidenceScore }, 'opposite position overridden (new conf higher)');
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
  // Broadcast ke semua subscriber (filter confidence sudah di dalam notifySignal)
  void (async () => {
    try {
      const subs = await listSubscribers(prisma);
      if (subs.length) await tgBroadcast(formatSignalText(sig), subs);
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'telegram broadcast failed');
    }
  })();

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
        // AI Insight ke Telegram (ikut aturan min confidence sinyal)
        void notifyInsight(sig, insight.verdict, insight.summary, insight.suggestion);
      }
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'llm verify post-signal error');
    }
  })();

  logger.info({ id: created.id, dir: sig.direction, entry: sig.preferredEntry, conf: sig.confidenceScore }, 'signal created');
  return created;
}
