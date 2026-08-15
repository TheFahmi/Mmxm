# MMXM XAUUSD Signal System

ICT **Market Maker Buy/Sell Model** signal system for XAUUSD. Data from MetaTrader 5 via MQL5 bridge EA. **Signal-only — no auto-trading, no order execution, ever.**

> Analysis only. Not financial advice.

## Stack

| Layer | Tech |
|---|---|
| Bridge | MQL5 EA (`mql5/`) — ticks, candles, heartbeat, HMAC-signed HTTPS |
| Ingestion | NestJS 11 + Fastify, HMAC signature guard, nonce replay protection, Zod validation |
| Engine | Pure TypeScript `packages/trading-core` — pivots, BOS/CHoCH/MSS, sweeps, FVG/OB, MMBM/MMSM state machine, scoring |
| Storage | PostgreSQL 16 (Prisma), Redis 7 (dedupe, nonce, pub/sub) |
| Compute | BullMQ worker — live analysis + walk-forward backtesting |
| UI | Next.js 15 + Tailwind + Lightweight Charts + socket.io |
| Infra | Docker Compose, GitHub Actions CI |

## Quickstart

```bash
cp .env.example .env          # set POSTGRES_PASSWORD, MQL5_API_KEY, MQL5_API_SECRET
docker compose build
docker compose up -d postgres redis
docker compose run --rm migrate   # schema + seed strategy v1.0.0
docker compose up -d api worker web
```

- Web: http://localhost:3000
- API + Swagger: http://localhost:3001/docs
- Health: http://localhost:3001/health

## MT5 EA Install

1. Copy `mql5/Experts/MMXMBridgeEA.mq5` → `MQL5/Experts/`, `mql5/Include/*.mqh` → `MQL5/Include/`, `mql5/Scripts/ExportXauusdHistory.mq5` → `MQL5/Scripts/`.
2. Compile in MetaEditor (F7). Zero errors expected.
3. MT5 → Tools → Options → Expert Advisors → **Allow WebRequest for listed URL** → add your API base URL (e.g. `https://api.yourdomain.com`).
4. Attach EA to any XAUUSD chart. Set inputs: `ApiBaseUrl`, `ApiKey`, `ApiSecret` (must match `.env`), `TerminalId` (unique per terminal).
5. Check Experts tab log: `MMXM Bridge READY` + handshake 200.
6. Historical backfill: run `ExportXauusdHistory` script → CSV/JSONL in `MQL5/Files/`.

**The EA contains no trade functions. It cannot open, modify, or close positions.**

## Security (ingestion)

Every MQL5 request requires headers: `X-MMXM-API-KEY`, `X-MMXM-TIMESTAMP` (±60s), `X-MMXM-NONCE` (Redis one-time), `X-MMXM-SIGNATURE` = `HMAC_SHA256(secret, timestamp\nnonce\nsha256(body))`, compared with `timingSafeEqual`. Batches are idempotent via `Idempotency-Key` (24h Redis dedupe).

## Trading model (engine)

- **HTF bias**: H4+H1 structure + premium/discount in dealing range
- **Setup (M15)**: original consolidation → expansion → liquidity sweep (wick through, close back) → displacement (≥1.2×ATR body, ≤12 candles old)
- **Confirmation (M5)**: CHoCH/MSS/BOS in bias direction (closed candles only) + unmitigated FVG/OB entry zone
- **Signal**: preferred/aggressive/conservative entries, structural+ATR stop, TPs at opposing liquidity, confidence score 0–100, explicit invalidation rules, expiry
- **Anti-repaint**: only closed candles ever produce evidence; pivots confirm only after right-side bars

## Tests

```bash
cd packages/trading-core && npx vitest run   # 13 tests: engine + core primitives
```

CI runs typecheck (all packages) + tests + full build on every push.

## Backtesting

UI → Backtests → New. Walk-forward replay: at each M15 close the engine sees only candles closed at/before that time. Outcome resolution: TP1 vs SL first touch (SL wins on same-candle tie — conservative).

## Troubleshooting

| Symptom | Check |
|---|---|
| EA log `WebRequest failed 4014` | URL not whitelisted in MT5 options |
| 401 from API | ApiKey/Secret mismatch, clock skew >60s on VPS |
| Signals empty | Worker logs: `insufficient candles` → backfill history first |
| Terminal OFFLINE in UI | Heartbeat >60s — EA removed, market closed, or VPS network |
| Duplicate candles | Safe — unique constraint + revision audit; check `candle_revisions` |

## Repo layout

See [docs/folder-structure.md](docs/folder-structure.md), [docs/architecture.md](docs/architecture.md), [docs/erd.md](docs/erd.md), [docs/mql5-contract.md](docs/mql5-contract.md).
