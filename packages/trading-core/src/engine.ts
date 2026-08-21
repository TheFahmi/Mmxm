import type { Candle, DealingRange, MmxmAnalysisInput, MmxmModel, XauusdSignal, SignalReason, InvalidationRule } from '@mmxm/types';
import { atr, body, range, closedOnly, isBullish } from './measure.js';
import { findPivots } from './pivots.js';
import { detectStructure } from './structure.js';
import { detectFvgs, detectOrderBlocks, fvgContains, obContains } from './zones.js';
import { pivotsToLiquidity, classifyLevelInteraction, detectPrevDayWeekLevels, detectSessionLevels } from './liquidity.js';

export interface EngineOutput {
  signal: XauusdSignal | null;
  reasons: SignalReason[];
  debug: Record<string, unknown>;
}

export function dealingRange(candles: Candle[]): DealingRange | null {
  const closed = closedOnly(candles);
  if (closed.length < 10) return null;
  let hi = -Infinity, lo = Infinity;
  for (const c of closed) { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); }
  const eq = (hi + lo) / 2;
  return {
    low: lo, high: hi, equilibrium: eq,
    premiumAbove: eq + (hi - lo) * 0.0, // > equilibrium = premium
    discountBelow: eq,
  };
}

export function htfBias(h4: Candle[], h1: Candle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const biasOf = (cs: Candle[]): number => {
    const closed = closedOnly(cs).slice(-20);
    if (closed.length < 5) return 0;
    const first = closed[0]!.close, last = closed[closed.length - 1]!.close;
    const pct = (last - first) / first;
    return pct > 0.001 ? 1 : pct < -0.001 ? -1 : 0;
  };
  const a = biasOf(h4), b = biasOf(h1);
  if (a > 0 && b >= 0) return 'BULLISH';
  if (a < 0 && b <= 0) return 'BEARISH';
  if (a === 0 && b !== 0) return b > 0 ? 'BULLISH' : 'BEARISH';
  return 'NEUTRAL';
}

/** Displacement: body >= minBodyAtr*ATR and range >= minRangeAtr*ATR */
export function displacementIndices(
  candles: Candle[], atrArr: (number | null)[], minBodyAtr: number, minRangeAtr: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!, a = atrArr[i];
    if (!c.isClosed || a == null) continue;
    if (body(c) >= minBodyAtr * a && range(c) >= minRangeAtr * a) out.push(i);
  }
  return out;
}

export function analyze(input: MmxmAnalysisInput, strategyVersion: string): EngineOutput {
  const cfg = input.config;
  const m15 = closedOnly(input.candles.M15);
  const m5 = closedOnly(input.candles.M5);
  const reasons: SignalReason[] = [];
  const debug: Record<string, unknown> = {};

  if (m15.length < 30 || m5.length < 50) {
    return { signal: null, reasons, debug: { why: 'insufficient_candles' } };
  }

  const atrM15 = atr(m15, cfg.atrPeriod);
  const atrM5 = atr(m5, cfg.atrPeriod);
  const atrNow15 = atrM15[atrM15.length - 1];
  const atrNow5 = atrM5[atrM5.length - 1];
  if (atrNow15 == null || atrNow5 == null) return { signal: null, reasons, debug: { why: 'atr_not_ready' } };

  const bias = htfBias(input.candles.H4, input.candles.H1);
  const dr = dealingRange(m15.slice(-cfg.maxSetupAgeCandlesM15 * 4))!; // ~4x setup window context
  const price = m15[m15.length - 1]!.close;
  const inDiscount = price < dr.equilibrium;
  const inPremium = price > dr.equilibrium;
  debug.bias = bias; debug.dr = dr; debug.price = price;

  // M15 pivots + liquidity
  const pivots15 = findPivots(m15, cfg.pivotLeftBars, cfg.pivotRightBars);
  const liq = [
    ...pivotsToLiquidity(pivots15, 'M15', cfg.equalHighLowToleranceAtr, atrNow15),
    ...detectPrevDayWeekLevels(m15, 'M15', new Date()),
    ...detectSessionLevels(m15, 'M15', new Date()),
  ];

  // classify sweeps
  const sweptLevels = [];
  for (const level of liq) {
    const r = classifyLevelInteraction(level, m15, cfg.sweepPenetrationAtr, atrNow15);
    if (r.state === 'SWEPT') sweptLevels.push({ ...level, sweptAt: r.at });
  }
  debug.liqCount = liq.length;
  debug.swingLows = liq.filter(l => l.type === 'SWING_LOW').map(l => l.price);
  debug.atrNow15 = atrNow15;
  debug.sweptLevels = sweptLevels.map(s => ({ t: s.type, p: s.price }));

  // M5 structure
  const pivots5 = findPivots(m5, cfg.pivotLeftBars, cfg.pivotRightBars);
  const struct5 = detectStructure(m5, pivots5, 'M5', cfg.structureBreakBufferAtr, atrNow5);
  const lastStruct = struct5[struct5.length - 1];
  debug.lastStruct = lastStruct;

  // displacement on M15
  const dispIdx = displacementIndices(m15, atrM15, cfg.minimumDisplacementBodyAtr, cfg.minimumDisplacementRangeAtr);
  const lastDisp = dispIdx[dispIdx.length - 1];
  debug.lastDispIndex = lastDisp;

  // FVG + OB
  const fvgs = detectFvgs(m5, cfg.minimumFvgAtr, atrNow5);
  const obs = detectOrderBlocks(m15, dispIdx);
  const freshFvgs = fvgs.filter(f => !f.mitigated);
  const freshObs = obs.filter(o => !o.mitigated);

  // determine model
  const sweptLow = sweptLevels.some(s => s.type.endsWith('LOW') || s.type === 'PDL' || s.type === 'PWL');
  const sweptHigh = sweptLevels.some(s => s.type.endsWith('HIGH') || s.type === 'PDH' || s.type === 'PWH');
  const model: MmxmModel | null =
    bias === 'BULLISH' && sweptLow
      ? 'MARKET_MAKER_BUY_MODEL'
      : bias === 'BEARISH' && sweptHigh
        ? 'MARKET_MAKER_SELL_MODEL'
        : bias === 'BULLISH' && sweptHigh
          ? 'MARKET_MAKER_BUY_MODEL' // continuation
          : bias === 'BEARISH' && sweptLow
            ? 'MARKET_MAKER_SELL_MODEL' // continuation
            : null;

  if (!model) return { signal: null, reasons, debug: { ...debug, why: 'no_model' } };
  const direction = model === 'MARKET_MAKER_BUY_MODEL' ? 'LONG' : 'SHORT';

  // minimum condition checks
  const checks: Array<{ ok: boolean; code: string; desc: string; weight: number; evidence: string[] }> = [];
  checks.push({
    ok: direction === 'LONG' ? (bias === 'BULLISH' || inDiscount) : (bias === 'BEARISH' || inPremium),
    code: 'HTF_BIAS_OR_ZONE', desc: direction === 'LONG' ? 'HTF bullish or discount' : 'HTF bearish or premium',
    weight: 20, evidence: [],
  });
  // model gate sudah menentukan arah dari pasangan bias+sweep; di sini cukup pastikan
  // ADA bukti liquidity sweep (reversal: sisi berlawanan; continuation: sisi searah)
  const sweptOk = sweptLow || sweptHigh;
  checks.push({
    ok: sweptOk, code: 'LIQUIDITY_SWEPT',
    desc: direction === 'LONG' ? 'sell-side liquidity swept' : 'buy-side liquidity swept',
    weight: 20, evidence: sweptLevels.map(s => s.id),
  });
  const dispOk = lastDisp != null && (m15.length - 1 - lastDisp) <= cfg.maxSetupAgeCandlesM15
    && (direction === 'LONG' ? isBullish(m15[lastDisp]!) : !isBullish(m15[lastDisp]!));
  checks.push({
    ok: !!dispOk, code: 'DISPLACEMENT',
    desc: direction === 'LONG' ? 'bullish displacement after sweep' : 'bearish displacement after sweep',
    weight: 15, evidence: lastDisp != null ? [m15[lastDisp]!.openTime] : [],
  });
  const structOk = lastStruct && (lastStruct.kind === 'MSS' || lastStruct.kind === 'CHOCH')
    && ((direction === 'LONG' && lastStruct.direction === 'BULLISH')
      || (direction === 'SHORT' && lastStruct.direction === 'BEARISH'))
    && (m5.length - 1 - lastStruct.breakCandleIndex) <= cfg.maxConfirmationAgeCandlesM5;
  checks.push({
    ok: !!structOk, code: 'MSS_CHOCH',
    desc: `M5 ${lastStruct?.kind ?? 'none'} ${lastStruct?.direction ?? ''}`.trim(),
    weight: 20, evidence: lastStruct ? [m5[lastStruct.breakCandleIndex]!.openTime] : [],
  });
  const zoneOk = freshFvgs.some(f => (direction === 'LONG' ? f.direction === 'BULLISH' : f.direction === 'BEARISH'))
    || freshObs.some(o => (direction === 'LONG' ? o.direction === 'BULLISH' : o.direction === 'BEARISH'));
  checks.push({
    ok: zoneOk, code: 'FVG_OR_OB',
    desc: direction === 'LONG' ? 'bullish FVG/OB present' : 'bearish FVG/OB present',
    weight: 15, evidence: [],
  });
  const zoneSideOk = direction === 'LONG' ? inDiscount : inPremium;
  checks.push({
    ok: true, code: 'PREMIUM_DISCOUNT', // ponytail: non-blocking (info only) — blocking PD membuat engine diam saat trend kuat; kembalikan ke zoneSideOk jika mau ketat
    desc: `${direction === 'LONG' ? 'entry in discount' : 'entry in premium'} (${zoneSideOk ? 'yes' : 'no'})`,
    weight: zoneSideOk ? 10 : 0, evidence: [],
  });

  for (const c of checks) {
    if (c.ok) reasons.push({ code: c.code, description: c.desc, evidenceCandleIds: c.evidence, weight: c.weight });
  }
  const failed = checks.filter(c => !c.ok);
  if (failed.length) {
    return { signal: null, reasons, debug: { ...debug, why: 'failed_checks', failed: failed.map(f => f.code) } };
  }

  // entry zone from freshest matching FVG/OB
  let entryMin: number, entryMax: number;
  const f = freshFvgs.find(x => (direction === 'LONG' ? x.direction === 'BULLISH' : x.direction === 'BEARISH'));
  const o = freshObs.find(x => (direction === 'LONG' ? x.direction === 'BULLISH' : x.direction === 'BEARISH'));
  if (f) { entryMin = f.low; entryMax = f.high; }
  else if (o) { entryMin = o.low; entryMax = o.high; }
  else return { signal: null, reasons, debug: { ...debug, why: 'no_entry_zone' } };

  // Entry-zone freshness: zone must be reachable from current price, else it's stale
  // (price already traded through/away from the gap — waiting for a touch is pointless).
  const zoneDist = direction === 'LONG'
    ? Math.max(entryMin - price, price - entryMax, 0) // distance from price to zone (0 if inside)
    : Math.max(price - entryMax, entryMin - price, 0);
  const maxZoneDist = cfg.atrPeriod > 0 ? atrNow15 * 5.0 : 0; // ponytail: 3×ATR(M15) ceiling — tune after backtest
  if (zoneDist > maxZoneDist) {
    return { signal: null, reasons, debug: { ...debug, why: 'stale_entry_zone', zoneDist, maxZoneDist } };
  }

  const preferredEntry = (entryMin + entryMax) / 2;
  const slBuffer = cfg.stopLossBufferAtr * atrNow5;
  const stopLoss = direction === 'LONG' ? entryMin - slBuffer : entryMax + slBuffer;
  const risk = Math.abs(preferredEntry - stopLoss);
  if (risk <= 0) return { signal: null, reasons, debug: { ...debug, why: 'zero_risk' } };

  // targets: opposing liquidity — must be beyond CURRENT price, not just the entry
  // (a SHORT whose TP1 is already below current price = move already spent → stale)
  const opposing = liq.filter(l => direction === 'LONG'
    ? (l.type.endsWith('HIGH') || l.type === 'PDH' || l.type === 'PWH') && l.price > preferredEntry && l.price > price
    : (l.type.endsWith('LOW') || l.type === 'PDL' || l.type === 'PWL') && l.price < preferredEntry && l.price < price,
  ).sort((a, b) => direction === 'LONG' ? a.price - b.price : b.price - a.price);

  const tps = opposing.slice(0, 3).map((l, i) => ({
    level: (i + 1) as 1 | 2 | 3,
    price: l.price,
    allocationPercentage: i === 0 ? 50 : i === 1 ? 30 : 20,
    liquidityTarget: l.type,
  }));
  if (!tps.length) {
    const ext = direction === 'LONG' ? dr.high : dr.low;
    tps.push({ level: 1, price: ext, allocationPercentage: 100, liquidityTarget: 'SWING_HIGH' });
  }
  const rr = Math.abs(tps[0]!.price - preferredEntry) / risk;
  if (rr < cfg.minimumRiskReward) {
    return { signal: null, reasons, debug: { ...debug, why: 'rr_too_low', rr } };
  }

  const confidence = Math.min(100, checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0)
    + (lastStruct?.kind === 'MSS' ? 10 : 0));
  if (confidence < cfg.minimumConfidence) {
    return { signal: null, reasons, debug: { ...debug, why: 'confidence_low', confidence } };
  }

  const invalidationRules: InvalidationRule[] = [
    direction === 'LONG'
      ? { code: 'SL', description: `M5 close below ${stopLoss}`, price: stopLoss, condition: 'CLOSE_BELOW' }
      : { code: 'SL', description: `M5 close above ${stopLoss}`, price: stopLoss, condition: 'CLOSE_ABOVE' },
    { code: 'TTL', description: 'signal TTL', price: null, condition: 'TTL' },
  ];

  const now = new Date();
  const signal: XauusdSignal = {
    id: crypto.randomUUID(),
    symbol: 'XAUUSD',
    direction,
    status: 'CONFIRMED',
    mmxmModel: model,
    entryMin, entryMax, preferredEntry, stopLoss,
    takeProfits: tps,
    riskRewardRatio: Math.round(rr * 100) / 100,
    confidenceScore: confidence,
    higherTimeframeBias: bias,
    setupTimeframe: 'M15',
    confirmationTimeframe: 'M5',
    precisionTimeframe: 'M1',
    reasons,
    invalidationRules,
    detectedAt: now.toISOString(),
    confirmedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + cfg.maximumSignalAgeMinutes * 60_000).toISOString(),
    strategyVersion,
  };
  return { signal, reasons, debug };
}
