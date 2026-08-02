# MMXM XAUUSD Signal System — Architecture

Signal-only system. Never sends trade orders.
Defaults: `TRADING_EXECUTION_ENABLED=false`, `SIGNAL_ONLY_MODE=true`.

## System Diagram

```mermaid
flowchart TB
    MT5[MetaTrader 5<br/>MMXMBridgeEA.mq5]
    subgraph EA_DUTIES[EA duties]
        H1[Historical candle sync]
        H2[Real-time tick capture]
        H3[Current candle updates]
        H4[Closed candle notify]
        H5[Terminal heartbeat]
    end
    MT5 --> EA_DUTIES
    EA_DUTIES -->|HTTPS + HMAC-SHA256| ING[NestJS MQL5 Ingestion API<br/>Fastify]
    subgraph ING_STEPS[Ingestion pipeline]
        A1[Auth] --> A2[Signature validation] --> A3[Deduplication]
        A3 --> A4[Timestamp validation] --> A5[Symbol normalization]
        A5 --> A6[Integrity validation]
    end
    ING --> ING_STEPS
    ING_STEPS --> RQ[(Redis Stream / BullMQ)]
    RQ --> W1[Candle aggregation]
    RQ --> W2[Gap detection]
    RQ --> W3[Market structure calc]
    RQ --> W4[MMXM scanner]
    W1 & W2 & W3 & W4 --> PG[(PostgreSQL<br/>ticks, candles, liquidity,<br/>structures, patterns, signals)]
    PG --> WS[WebSocket Gateway]
    WS --> WEB[Next.js Dashboard]
    PG --> WEB
```

## Component Responsibilities

| Component | Tech | Responsibility |
|---|---|---|
| MMXMBridgeEA | MQL5 | Data extraction only. No trading. Spool + retry. |
| apps/api | NestJS 11 + Fastify + Prisma + Zod | Ingestion, REST, WS gateway, Swagger |
| apps/worker | BullMQ consumer | Aggregation, gap detection, MMXM scan, signal lifecycle |
| apps/web | Next.js 15 App Router | Dashboard, chart, admin, backtests |
| packages/trading-core | Pure TS, zero deps on infra | MMXM engine (testable, deterministic) |
| packages/database | Prisma schema + client | Single source of DB truth |
| packages/types | Shared TS contracts | Payload + domain types (MQL5 <-> API <-> Web) |
| packages/market-data | TS | Candle store, session calendars, symbol mapping |
| packages/notification | TS | Telegram, Discord, Email, Webhook, in-app |

## Data Flow (signal path)

```mermaid
sequenceDiagram
    participant EA as MMXMBridgeEA
    participant API as Ingestion API
    participant Q as Redis Stream
    participant WK as Worker (trading-core)
    participant DB as PostgreSQL
    participant WS as WS Gateway
    participant TG as Telegram

    EA->>API: POST /mql5/candles/closed (HMAC)
    API->>API: verify key+sig+nonce+ts, dedupe eventId
    API->>DB: upsert candle (isClosed=true)
    API->>Q: xadd candle.closed
    Q->>WK: consume
    WK->>WK: pivots -> structure -> liquidity -> sweep -> displacement -> FVG/OB -> MMXM state machine
    alt setup confirmed (closed candles only)
        WK->>DB: insert signal + reasons + events
        WK->>WS: xauusd.signal.confirmed
        WK->>TG: formatted signal card
    else preliminary (active candle evidence)
        WK->>WS: xauusd.signal.preliminary
    end
```

## Anti-Repaint Rules (enforced in worker + engine)

- `CONFIRMED` requires all evidence candles `isClosed = true`.
- MQL5 shift-0 candle never used as confirmation.
- Active candles only allowed for `WATCHING` / `PRELIMINARY`.
- Confirmed signal: `reasons` + initial levels immutable; status changes are new `signal_events` rows.
- Pivots locked only after `pivotRightBars` closed.
- Every rule verdict stores evidence candle IDs.

## Terminal Health

| Status | Rule |
|---|---|
| ONLINE | heartbeat < 15s |
| DEGRADED | 15-30s, or backlog high |
| OFFLINE | no heartbeat > 30s |

## Security

- Ingestion: `X-MMXM-API-KEY`, `X-MMXM-TIMESTAMP`, `X-MMXM-NONCE`, `X-MMXM-SIGNATURE`, `X-MMXM-TERMINAL-ID`.
- Signature: `HMAC-SHA256(apiSecret, timestamp + "." + nonce + "." + rawBody)`.
- Timestamp skew max 30s. Nonce single-use (Redis SETNX, TTL 60s).
- Secrets never logged (Pino redact paths).
- Web dashboard: session auth (NextAuth credentials, argon2 hash).
