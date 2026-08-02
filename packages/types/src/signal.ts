import type { CanonicalSymbol, Candle, Timeframe } from './core';

export type Direction = 'LONG' | 'SHORT';
export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type SignalStatus =
  | 'WATCHING' | 'PRELIMINARY' | 'CONFIRMED' | 'ACTIVE'
  | 'INVALIDATED' | 'EXPIRED'
  | 'TP1_HIT' | 'TP2_HIT' | 'COMPLETED' | 'STOPPED';

export type MmxmModel = 'MARKET_MAKER_BUY_MODEL' | 'MARKET_MAKER_SELL_MODEL';

export type MmxmStage =
  | 'ORIGINAL_CONSOLIDATION'
  | 'EXPANSION'
  | 'LIQUIDITY_FORMED'
  | 'LIQUIDITY_SWEPT'
  | 'HTF_POI_REACHED'
  | 'DISPLACEMENT'
  | 'MSS_OR_CHOCH'
  | 'FVG_OR_OB_FORMED'
  | 'RETRACEMENT_TO_ENTRY'
  | 'TARGETING_LIQUIDITY';

export interface SignalReason {
  code: string;
  description: string;
  evidenceCandleIds: string[];
  weight: number;
}

export interface InvalidationRule {
  code: string;
  description: string;
  price: number | null;
  condition: 'CLOSE_BELOW' | 'CLOSE_ABOVE' | 'STRUCTURE_BROKEN' | 'TTL';
}

export interface TakeProfit {
  level: 1 | 2 | 3;
  price: number;
  allocationPercentage: number;
  liquidityTarget: string;
}

export interface XauusdSignal {
  id: string;
  symbol: CanonicalSymbol;
  direction: Direction;
  status: SignalStatus;
  mmxmModel: MmxmModel;
  entryMin: number;
  entryMax: number;
  preferredEntry: number;
  stopLoss: number;
  takeProfits: TakeProfit[];
  riskRewardRatio: number;
  confidenceScore: number;
  higherTimeframeBias: Bias;
  setupTimeframe: 'M15';
  confirmationTimeframe: 'M5';
  precisionTimeframe: 'M1';
  reasons: SignalReason[];
  invalidationRules: InvalidationRule[];
  detectedAt: string;
  confirmedAt: string | null;
  expiresAt: string;
  strategyVersion: string;
}

export interface MmxmStrategyConfig {
  symbol: CanonicalSymbol;
  higherTimeframes: ['H4', 'H1'];
  setupTimeframe: 'M15';
  confirmationTimeframe: 'M5';
  precisionTimeframe: 'M1';
  atrPeriod: number;
  pivotLeftBars: number;
  pivotRightBars: number;
  minimumDisplacementBodyAtr: number;
  minimumDisplacementRangeAtr: number;
  minimumFvgAtr: number;
  equalHighLowToleranceAtr: number;
  sweepPenetrationAtr: number;
  structureBreakBufferAtr: number;
  stopLossBufferAtr: number;
  minimumConfidence: number;
  minimumRiskReward: number;
  maximumSpreadPoints: number | null;
  maximumSignalAgeMinutes: number;
  maxSetupAgeCandlesM15: number;
  maxConfirmationAgeCandlesM5: number;
}

export const DEFAULT_STRATEGY_CONFIG: MmxmStrategyConfig = {
  symbol: 'XAUUSD',
  higherTimeframes: ['H4', 'H1'],
  setupTimeframe: 'M15',
  confirmationTimeframe: 'M5',
  precisionTimeframe: 'M1',
  atrPeriod: 14,
  pivotLeftBars: 3,
  pivotRightBars: 3,
  minimumDisplacementBodyAtr: 1.2,
  minimumDisplacementRangeAtr: 1.8,
  minimumFvgAtr: 0.25,
  equalHighLowToleranceAtr: 0.15,
  sweepPenetrationAtr: 0.1,
  structureBreakBufferAtr: 0.05,
  stopLossBufferAtr: 0.5,
  minimumConfidence: 75,
  minimumRiskReward: 2.0,
  maximumSpreadPoints: null,
  maximumSignalAgeMinutes: 240,
  maxSetupAgeCandlesM15: 12,
  maxConfirmationAgeCandlesM5: 24,
};

export interface MmxmAnalysisInput {
  symbol: CanonicalSymbol;
  candles: Record<Timeframe, Candle[]>;
  latestTick?: { bid: number; ask: number; timestamp: number };
  config: MmxmStrategyConfig;
}

export type LiquidityType =
  | 'PDH' | 'PDL' | 'PWH' | 'PWL'
  | 'ASIA_HIGH' | 'ASIA_LOW'
  | 'LONDON_HIGH' | 'LONDON_LOW'
  | 'NEW_YORK_HIGH' | 'NEW_YORK_LOW'
  | 'EQUAL_HIGH' | 'EQUAL_LOW'
  | 'SWING_HIGH' | 'SWING_LOW';

export type LiquidityState = 'FRESH' | 'TOUCHED' | 'RAIDED' | 'SWEPT' | 'BROKEN' | 'INVALIDATED';

export interface LiquidityLevel {
  id: string;
  symbol: CanonicalSymbol;
  timeframe: string;
  type: LiquidityType;
  price: number;
  state: LiquidityState;
  detectedAt: string;
  sweptAt: string | null;
  invalidatedAt: string | null;
}

export interface Pivot {
  index: number;
  time: string;
  price: number;
  kind: 'HIGH' | 'LOW';
  confirmed: boolean;
}

export interface StructureEvent {
  kind: 'BOS' | 'CHOCH' | 'MSS';
  direction: 'BULLISH' | 'BEARISH';
  breakPrice: number;
  pivotIndex: number;
  breakCandleIndex: number;
  timeframe: Timeframe;
  confirmed: boolean;
}

export interface Fvg {
  direction: 'BULLISH' | 'BEARISH';
  low: number;
  high: number;
  formedAtIndex: number;
  mitigated: boolean;
  evidenceCandleIds: string[];
}

export interface OrderBlock {
  direction: 'BULLISH' | 'BEARISH';
  low: number;
  high: number;
  formedAtIndex: number;
  mitigated: boolean;
  evidenceCandleIds: string[];
}

export interface DealingRange {
  low: number;
  high: number;
  equilibrium: number;
  premiumAbove: number; // price above this = premium
  discountBelow: number; // price below this = discount
}
