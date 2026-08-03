FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
COPY packages/trading-core/package.json packages/trading-core/
RUN pnpm install --frozen-lockfile --filter @mmxm/worker...

FROM deps AS build
COPY packages/types packages/types
COPY packages/database packages/database
COPY packages/trading-core packages/trading-core
COPY apps/worker apps/worker
RUN pnpm --filter @mmxm/types build \
 && pnpm --filter @mmxm/database exec prisma generate \
 && pnpm --filter @mmxm/database build \
 && pnpm --filter @mmxm/trading-core build \
 && pnpm --filter @mmxm/worker build

FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && addgroup --system app && adduser --system --group app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=build /app/packages/trading-core/dist ./packages/trading-core/dist
COPY --from=build /app/packages/trading-core/package.json ./packages/trading-core/package.json
COPY pnpm-workspace.yaml package.json ./
RUN rm -rf apps/worker/node_modules/@mmxm \
 && mkdir -p apps/worker/node_modules/@mmxm \
 && ln -s /app/packages/database apps/worker/node_modules/@mmxm/database \
 && ln -s /app/packages/types apps/worker/node_modules/@mmxm/types \
 && ln -s /app/packages/trading-core apps/worker/node_modules/@mmxm/trading-core \
 && chmod -R a+r /app/packages
USER app
CMD ["node", "apps/worker/dist/main.js"]