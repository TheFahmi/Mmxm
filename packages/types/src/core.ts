export type CanonicalSymbol = 'XAUUSD';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';
export const TIMEFRAMES: readonly Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'] as const;
export const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400,
};

export interface SymbolMapping {
  canonicalSymbol: CanonicalSymbol;
  brokerSymbol: string;
  brokerName: string;
  digits: number;
  point: number;
  tickSize: number;
  tickValue: number | null;
  contractSize: number | null;
  minimumVolume: number | null;
  maximumVolume: number | null;
  volumeStep: number | null;
}

export interface Candle {
  openTime: string;   // ISO UTC
  closeTime: string;  // ISO UTC
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  realVolume: number | null;
  spread: number;
  isClosed: boolean;
  revision: number;
}
