# MQL5 <-> Backend Contract

Base URL: `{ApiBaseUrl}` (default `/api/v1`).

## Headers (all ingestion endpoints)

```
X-MMXM-API-KEY:     <apiKey>
X-MMXM-TIMESTAMP:   <unix seconds, UTC>
X-MMXM-NONCE:       <random 16-32 hex, single use>
X-MMXM-SIGNATURE:   hex(HMAC-SHA256(apiSecret, timestamp + "." + nonce + "." + rawBody))
X-MMXM-TERMINAL-ID: <persistent uuid per terminal>
Content-Type: application/json
```

Backend validation order: API key -> terminal active -> timestamp skew <=30s -> nonce fresh -> signature -> payload size -> symbol==XAUUSD -> broker symbol matches terminal -> rate limit.

## Endpoints

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | /mql5/handshake | Mql5HandshakeRequest | register/refresh terminal, returns config |
| POST | /mql5/ticks/batch | { ticks: Mql5TickPayload[] } | tick batch, dedupe by eventId |
| POST | /mql5/candles/current | Mql5CandlePayload | update in-progress candle (isClosed=false) |
| POST | /mql5/candles/closed | Mql5CandlePayload | commit closed candle; revision bump if corrected |
| POST | /mql5/heartbeat | Mql5HeartbeatPayload | terminal health |
| POST | /mql5/history/start | HistoryStartPayload | open sync batch, returns batchId |
| POST | /mql5/history/batch | HistoryBatchPayload | oldest->newest candles, sequence ordered |
| POST | /mql5/history/complete | HistoryCompletePayload | close batch; backend runs gap check |
| GET  | /mql5/config | - | fetch current ingest config for terminal |

## Envelope

Success: `{ "success": true, "data": ... }`
Error:   `{ "success": false, "error": { "code": "...", "message": "..." } }`

Error codes: `UNAUTHORIZED`, `BAD_SIGNATURE`, `STALE_TIMESTAMP`, `NONCE_REUSED`, `UNKNOWN_TERMINAL`, `SYMBOL_NOT_ALLOWED`, `DUPLICATE_EVENT`, `VALIDATION_FAILED`, `RATE_LIMITED`.

Duplicates are not errors: `200 { success: true, data: { duplicated: true } }`.

## Candle rules

- Unique key: (terminalId, brokerSymbol, timeframe, openTime).
- History sync: shift>=1 only (never treat shift 0 as closed).
- Closed candle immutable; corrections arrive with `revision+1` and create `candle_revisions` row.
- Current candle updates: upsert on unique key with isClosed=false.

## Tick rules

- eventId = `terminalId|brokerSymbol|brokerTimestampMs|sequence`.
- Dedupe via Redis SET NX + Postgres PK.
- Never use float price as identity.
