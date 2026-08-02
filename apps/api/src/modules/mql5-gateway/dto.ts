import { z } from 'zod';

const tfEnum = z.enum(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']);

export const handshakeSchema = z.object({
  terminalId: z.string().min(8),
  terminalName: z.string(),
  terminalBuild: z.number().int(),
  brokerName: z.string(),
  serverName: z.string(),
  accountIdHash: z.string(),
  accountCurrency: z.string(),
  canonicalSymbol: z.literal('XAUUSD'),
  brokerSymbol: z.string().min(1),
  digits: z.number().int(),
  point: z.number(),
  tickSize: z.number(),
  tickValue: z.number().nullable(),
  contractSize: z.number().nullable(),
  minimumVolume: z.number().nullable(),
  maximumVolume: z.number().nullable(),
  volumeStep: z.number().nullable(),
  serverTime: z.string(),
  localTime: z.string(),
});
export type HandshakeDto = z.infer<typeof handshakeSchema>;

export const tickSchema = z.object({
  eventId: z.string().min(8),
  terminalId: z.string(),
  accountIdHash: z.string().optional(),
  canonicalSymbol: z.literal('XAUUSD'),
  brokerSymbol: z.string(),
  brokerTimestampMs: z.number().int().nonnegative(),
  receivedTimestampMs: z.number().int().optional(),
  bid: z.number(),
  ask: z.number(),
  last: z.number().nullable(),
  volume: z.number().nullable(),
  volumeReal: z.number().nullable(),
  flags: z.number().int(),
  spreadPoints: z.number().int(),
  sequence: z.number().int(),
});
export type TickDto = z.infer<typeof tickSchema>;

export const tickBatchSchema = z.object({ ticks: z.array(tickSchema).max(1000) });

export const candleSchema = z.object({
  eventId: z.string().min(8),
  terminalId: z.string(),
  canonicalSymbol: z.literal('XAUUSD'),
  brokerSymbol: z.string(),
  timeframe: tfEnum,
  openTime: z.string(),
  closeTime: z.string(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  tickVolume: z.number().int().nonnegative(),
  realVolume: z.number().nullable(),
  spread: z.number().int().nonnegative(),
  isClosed: z.boolean(),
  revision: z.number().int().nonnegative(),
  source: z.literal('MQL5'),
}).refine(c => c.high >= c.low && c.high >= c.open && c.high >= c.close && c.low <= c.open && c.low <= c.close, {
  message: 'invalid OHLC',
});
export type CandleDto = z.infer<typeof candleSchema>;

export const heartbeatSchema = z.object({
  terminalId: z.string(),
  canonicalSymbol: z.literal('XAUUSD'),
  brokerSymbol: z.string(),
  terminalConnected: z.boolean(),
  tradeServerConnected: z.boolean(),
  lastTickTimestamp: z.string().nullable().optional(),
  lastSuccessfulRequestTimestamp: z.string().nullable().optional(),
  pendingTickCount: z.number().int().nonnegative(),
  pendingCandleCount: z.number().int().nonnegative(),
  pendingSpoolCount: z.number().int().nonnegative(),
  terminalMemoryUsedMb: z.number().int().nonnegative(),
  serverTimestamp: z.string().optional(),
});
export type HeartbeatDto = z.infer<typeof heartbeatSchema>;

export const historyStartSchema = z.object({
  terminalId: z.string(),
  canonicalSymbol: z.literal('XAUUSD'),
  brokerSymbol: z.string(),
  timeframe: tfEnum,
  from: z.string(),
  to: z.string(),
  expectedBars: z.number().int().positive(),
});
export type HistoryStartDto = z.infer<typeof historyStartSchema>;

export const historyBatchSchema = z.object({
  terminalId: z.string(),
  batchId: z.string(),
  sequence: z.number().int().nonnegative(),
  timeframe: tfEnum,
  candles: z.array(candleSchema).max(1000),
  isLast: z.boolean(),
});
export type HistoryBatchDto = z.infer<typeof historyBatchSchema>;

export const historyCompleteSchema = z.object({
  terminalId: z.string(),
  batchId: z.string(),
  timeframe: tfEnum,
  sentBars: z.number().int().nonnegative(),
});
export type HistoryCompleteDto = z.infer<typeof historyCompleteSchema>;
