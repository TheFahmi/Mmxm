-- CreateEnum
CREATE TYPE "TerminalStatus" AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "Timeframe" AS ENUM ('M1', 'M5', 'M15', 'H1', 'H4', 'D1');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('WATCHING', 'PRELIMINARY', 'CONFIRMED', 'ACTIVE', 'INVALIDATED', 'EXPIRED', 'TP1_HIT', 'TP2_HIT', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "MmxmModel" AS ENUM ('MARKET_MAKER_BUY_MODEL', 'MARKET_MAKER_SELL_MODEL');

-- CreateEnum
CREATE TYPE "LiquidityState" AS ENUM ('FRESH', 'TOUCHED', 'RAIDED', 'SWEPT', 'BROKEN', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'DISCORD', 'EMAIL', 'BROWSER', 'IN_APP', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BacktestStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "mql5_terminals" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "terminalName" TEXT NOT NULL,
    "terminalBuild" INTEGER NOT NULL,
    "brokerName" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "accountIdHash" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "brokerSymbol" TEXT NOT NULL,
    "symbolMetadata" JSONB,
    "status" "TerminalStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mql5_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mql5_connections" (
    "id" TEXT NOT NULL,
    "terminalDbId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "ip" TEXT,

    CONSTRAINT "mql5_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mql5_heartbeats" (
    "id" BIGSERIAL NOT NULL,
    "terminalDbId" TEXT NOT NULL,
    "terminalConnected" BOOLEAN NOT NULL,
    "tradeServerConnected" BOOLEAN NOT NULL,
    "lastTickAt" TIMESTAMP(3),
    "pendingTickCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCandleCount" INTEGER NOT NULL DEFAULT 0,
    "pendingSpoolCount" INTEGER NOT NULL DEFAULT 0,
    "memoryUsedMb" INTEGER NOT NULL DEFAULT 0,
    "serverTs" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mql5_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbol_mappings" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "brokerSymbol" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL,
    "digits" INTEGER NOT NULL,
    "point" DECIMAL(20,10) NOT NULL,
    "tickSize" DECIMAL(20,10) NOT NULL,
    "tickValue" DECIMAL(20,10),
    "contractSize" DECIMAL(20,4),
    "minVolume" DECIMAL(20,8),
    "maxVolume" DECIMAL(20,4),
    "volumeStep" DECIMAL(20,8),

    CONSTRAINT "symbol_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticks" (
    "eventId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "brokerSymbol" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "brokerTsMs" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bid" DECIMAL(20,8) NOT NULL,
    "ask" DECIMAL(20,8) NOT NULL,
    "last" DECIMAL(20,8),
    "volume" BIGINT,
    "volumeReal" DECIMAL(24,4),
    "flags" INTEGER NOT NULL DEFAULT 0,
    "spreadPoints" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticks_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "candles" (
    "id" TEXT NOT NULL,
    "terminalDbId" TEXT NOT NULL,
    "brokerSymbol" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "timeframe" "Timeframe" NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "tickVolume" BIGINT NOT NULL DEFAULT 0,
    "realVolume" DECIMAL(24,4),
    "spread" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MQL5',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candle_revisions" (
    "id" BIGSERIAL NOT NULL,
    "candleId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "oldOhlc" JSONB NOT NULL,
    "newOhlc" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candle_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_gap_events" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "timeframe" "Timeframe" NOT NULL,
    "gapStart" TIMESTAMP(3) NOT NULL,
    "gapEnd" TIMESTAMP(3) NOT NULL,
    "missingBars" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "data_gap_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_events" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT,
    "endpoint" TEXT NOT NULL,
    "terminalDbId" TEXT,
    "status" "IngestionStatus" NOT NULL,
    "rejectReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "strategy_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_versions" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_structures" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "timeframe" "Timeframe" NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "breakPrice" DECIMAL(20,8) NOT NULL,
    "pivotCandleId" TEXT,
    "breakCandleId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidity_levels" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "timeframe" "Timeframe" NOT NULL,
    "type" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "state" "LiquidityState" NOT NULL DEFAULT 'FRESH',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sweptAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "liquidity_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fair_value_gaps" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "timeframe" "Timeframe" NOT NULL,
    "direction" "Direction" NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "mitigated" BOOLEAN NOT NULL DEFAULT false,
    "formedAt" TIMESTAMP(3) NOT NULL,
    "evidenceCandleIds" TEXT[],

    CONSTRAINT "fair_value_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_blocks" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "timeframe" "Timeframe" NOT NULL,
    "direction" "Direction" NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "mitigated" BOOLEAN NOT NULL DEFAULT false,
    "formedAt" TIMESTAMP(3) NOT NULL,
    "evidenceCandleIds" TEXT[],

    CONSTRAINT "order_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mmxm_patterns" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "model" "MmxmModel" NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mmxm_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mmxm_stage_events" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "evidence" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mmxm_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "direction" "Direction" NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'WATCHING',
    "mmxmModel" "MmxmModel" NOT NULL,
    "entryMin" DECIMAL(20,8) NOT NULL,
    "entryMax" DECIMAL(20,8) NOT NULL,
    "preferredEntry" DECIMAL(20,8) NOT NULL,
    "stopLoss" DECIMAL(20,8) NOT NULL,
    "takeProfits" JSONB NOT NULL,
    "riskReward" DECIMAL(10,2) NOT NULL,
    "confidence" INTEGER NOT NULL,
    "htfBias" TEXT NOT NULL,
    "setupTf" TEXT NOT NULL DEFAULT 'M15',
    "confirmationTf" TEXT NOT NULL DEFAULT 'M5',
    "precisionTf" TEXT NOT NULL DEFAULT 'M1',
    "invalidationRules" JSONB NOT NULL,
    "strategyVersionId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_reasons" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceCandleIds" TEXT[],
    "weight" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "signal_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_events" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtests" (
    "id" TEXT NOT NULL,
    "strategyVersionId" TEXT NOT NULL,
    "canonicalSymbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "fromTs" TIMESTAMP(3) NOT NULL,
    "toTs" TIMESTAMP(3) NOT NULL,
    "params" JSONB NOT NULL,
    "summary" JSONB,
    "status" "BacktestStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "backtests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_trades" (
    "id" TEXT NOT NULL,
    "backtestId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "entryPrice" DECIMAL(20,8) NOT NULL,
    "exitPrice" DECIMAL(20,8),
    "pnl" DECIMAL(20,4),
    "exitReason" TEXT,
    "ruleEvidence" JSONB,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),

    CONSTRAINT "backtest_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mql5_terminals_terminalId_key" ON "mql5_terminals"("terminalId");

-- CreateIndex
CREATE INDEX "mql5_heartbeats_terminalDbId_receivedAt_idx" ON "mql5_heartbeats"("terminalDbId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "symbol_mappings_canonicalSymbol_brokerSymbol_brokerName_key" ON "symbol_mappings"("canonicalSymbol", "brokerSymbol", "brokerName");

-- CreateIndex
CREATE INDEX "ticks_terminalId_brokerTsMs_idx" ON "ticks"("terminalId", "brokerTsMs");

-- CreateIndex
CREATE INDEX "candles_canonicalSymbol_timeframe_openTime_idx" ON "candles"("canonicalSymbol", "timeframe", "openTime" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candles_terminalDbId_brokerSymbol_timeframe_openTime_key" ON "candles"("terminalDbId", "brokerSymbol", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "data_gap_events_canonicalSymbol_timeframe_detectedAt_idx" ON "data_gap_events"("canonicalSymbol", "timeframe", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "ingestion_events_eventId_idx" ON "ingestion_events"("eventId");

-- CreateIndex
CREATE INDEX "ingestion_events_receivedAt_idx" ON "ingestion_events"("receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "strategy_definitions_name_key" ON "strategy_definitions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_versions_strategyId_version_key" ON "strategy_versions"("strategyId", "version");

-- CreateIndex
CREATE INDEX "market_structures_canonicalSymbol_timeframe_detectedAt_idx" ON "market_structures"("canonicalSymbol", "timeframe", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "liquidity_levels_canonicalSymbol_timeframe_type_detectedAt_idx" ON "liquidity_levels"("canonicalSymbol", "timeframe", "type", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "fair_value_gaps_canonicalSymbol_timeframe_formedAt_idx" ON "fair_value_gaps"("canonicalSymbol", "timeframe", "formedAt" DESC);

-- CreateIndex
CREATE INDEX "order_blocks_canonicalSymbol_timeframe_formedAt_idx" ON "order_blocks"("canonicalSymbol", "timeframe", "formedAt" DESC);

-- CreateIndex
CREATE INDEX "mmxm_stage_events_patternId_detectedAt_idx" ON "mmxm_stage_events"("patternId", "detectedAt");

-- CreateIndex
CREATE INDEX "signals_canonicalSymbol_status_detectedAt_idx" ON "signals"("canonicalSymbol", "status", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "signal_reasons_signalId_idx" ON "signal_reasons"("signalId");

-- CreateIndex
CREATE INDEX "signal_events_signalId_createdAt_idx" ON "signal_events"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "backtest_trades_backtestId_enteredAt_idx" ON "backtest_trades"("backtestId", "enteredAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "mql5_connections" ADD CONSTRAINT "mql5_connections_terminalDbId_fkey" FOREIGN KEY ("terminalDbId") REFERENCES "mql5_terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mql5_heartbeats" ADD CONSTRAINT "mql5_heartbeats_terminalDbId_fkey" FOREIGN KEY ("terminalDbId") REFERENCES "mql5_terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_terminalDbId_fkey" FOREIGN KEY ("terminalDbId") REFERENCES "mql5_terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candle_revisions" ADD CONSTRAINT "candle_revisions_candleId_fkey" FOREIGN KEY ("candleId") REFERENCES "candles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_terminalDbId_fkey" FOREIGN KEY ("terminalDbId") REFERENCES "mql5_terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategy_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mmxm_stage_events" ADD CONSTRAINT "mmxm_stage_events_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "mmxm_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "strategy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_reasons" ADD CONSTRAINT "signal_reasons_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtests" ADD CONSTRAINT "backtests_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "strategy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_backtestId_fkey" FOREIGN KEY ("backtestId") REFERENCES "backtests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
