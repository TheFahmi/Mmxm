import type { CanonicalSymbol, Timeframe } from './core';

// ---- Auth headers (every ingestion endpoint) ----
// X-MMXM-API-KEY, X-MMXM-TIMESTAMP, X-MMXM-NONCE, X-MMXM-SIGNATURE, X-MMXM-TERMINAL-ID
// signature = HMAC-SHA256(apiSecret, `${timestamp}.${nonce}.${rawBody}`)

export interface Mql5TickPayload {
  eventId: string; // terminalId + brokerSymbol + brokerTimestampMs + sequence
  terminalId: string;
  accountIdHash: string;
  canonicalSymbol: CanonicalSymbol;
  brokerSymbol: string;
  brokerTimestampMs: number;
  receivedTimestampMs?: number;
  bid: number;
  ask: number;
  last: number | null;
  volume: number | null;
  volumeReal: number | null;
  flags: number;
  spreadPoints: number;
  sequence: number;
}

export interface Mql5CandlePayload {
  eventId: string;
  terminalId: string;
  canonicalSymbol: CanonicalSymbol;
  brokerSymbol: string;
  timeframe: Timeframe;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  realVolume: number | null;
  spread: number;
  isClosed: boolean;
  revision: number;
  source: 'MQL5';
}

export interface Mql5HandshakeRequest {
  terminalId: string;
  terminalName: string;
  terminalBuild: number;
  brokerName: string;
  serverName: string;
  accountIdHash: string;
  accountCurrency: string;
  canonicalSymbol: CanonicalSymbol;
  brokerSymbol: string;
  digits: number;
  point: number;
  tickSize: number;
  tickValue: number | null;
  contractSize: number | null;
  minimumVolume: number | null;
  maximumVolume: number | null;
  volumeStep: number | null;
  serverTime: string;
  localTime: string;
}

export interface Mql5HandshakeResponse {
  success: boolean;
  data: {
    connectionId: string;
    acceptedSymbol: CanonicalSymbol;
    flushIntervalMs: number;
    heartbeatIntervalSeconds: number;
    sendTicks: boolean;
    sendCurrentCandles: boolean;
    sendClosedCandles: boolean;
    requiredTimeframes: Timeframe[];
    serverTimestamp: string;
  };
}

export interface Mql5HeartbeatPayload {
  terminalId: string;
  canonicalSymbol: CanonicalSymbol;
  brokerSymbol: string;
  terminalConnected: boolean;
  tradeServerConnected: boolean;
  lastTickTimestamp: string | null;
  lastSuccessfulRequestTimestamp: string | null;
  pendingTickCount: number;
  pendingCandleCount: number;
  pendingSpoolCount: number;
  terminalMemoryUsedMb: number;
  serverTimestamp: string;
}

export interface HistoryStartPayload {
  terminalId: string;
  canonicalSymbol: CanonicalSymbol;
  brokerSymbol: string;
  timeframe: Timeframe;
  from: string;
  to: string;
  expectedBars: number;
}

export interface HistoryBatchPayload {
  terminalId: string;
  batchId: string;
  sequence: number;
  timeframe: Timeframe;
  candles: Mql5CandlePayload[];
  isLast: boolean;
}

export interface HistoryCompletePayload {
  terminalId: string;
  batchId: string;
  timeframe: Timeframe;
  sentBars: number;
}
