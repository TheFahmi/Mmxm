FROM node:20-alpine AS base
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
RUN pnpm --filter @mmxm/database exec prisma generate \
 && pnpm --filter @mmxm/worker build

FROM node:20-alpine AS runtime
RUN corepack enable && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages ./packages
COPY pnpm-workspace.yaml package.json ./
USER app
CMD ["node", "apps/worker/dist/main.js"]
