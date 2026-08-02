# Monorepo layout

```
mmxm-xauusd/
├── apps/
│   ├── api/                    # NestJS 11 + Fastify — ingestion + REST + WS
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── mql5-gateway/       # signature guard, controllers
│   │       │   ├── mql5-terminal/
│   │       │   ├── market-data/
│   │       │   ├── candle/
│   │       │   ├── tick/
│   │       │   ├── data-quality/
│   │       │   ├── market-structure/
│   │       │   ├── liquidity/
│   │       │   ├── mmxm/
│   │       │   ├── signal/
│   │       │   ├── notification/
│   │       │   ├── backtest/
│   │       │   ├── websocket/
│   │       │   ├── health/
│   │       │   ├── audit/
│   │       │   └── admin/
│   │       ├── common/          # guards, interceptors, pipes, filters
│   │       └── main.ts
│   ├── web/                    # Next.js 15 App Router
│   │   └── src/
│   │       ├── app/
│   │       │   ├── login/
│   │       │   ├── dashboard/
│   │       │   ├── chart/xauusd/
│   │       │   ├── signals/ + [id]/
│   │       │   ├── strategy/
│   │       │   ├── backtests/
│   │       │   ├── data-source/
│   │       │   ├── settings/
│   │       │   └── admin/
│   │       ├── components/      # shadcn/ui + chart overlays
│   │       ├── hooks/           # TanStack Query, WS
│   │       └── stores/          # Zustand
│   └── worker/                 # BullMQ consumers (aggregation, scan, lifecycle)
├── mql5/
│   ├── Experts/MMXMBridgeEA.mq5
│   ├── Include/
│   │   ├── MmxmHttpClient.mqh
│   │   ├── MmxmJsonBuilder.mqh
│   │   ├── MmxmQueue.mqh
│   │   ├── MmxmSignature.mqh
│   │   └── MmxmCandleSync.mqh
│   └── Scripts/ExportXauusdHistory.mq5
├── packages/
│   ├── config/                 # shared env parsing (zod)
│   ├── database/               # prisma schema + client
│   ├── types/                  # @mmxm/types (DONE)
│   ├── trading-core/           # pure MMXM engine, no infra deps
│   ├── market-data/            # candle store, sessions, symbol map
│   ├── notification/           # telegram/discord/email/webhook
│   └── ui/                     # shared react components
├── docs/                       # architecture.md, erd.md, mql5-contract.md
├── infra/                      # nginx, otel
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```
