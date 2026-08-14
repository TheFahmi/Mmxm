FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
COPY packages/trading-core/package.json packages/trading-core/
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY packages/types packages/types
COPY packages/database packages/database
COPY packages/trading-core packages/trading-core
COPY apps/worker apps/worker
RUN pnpm --filter @mmxm/database exec prisma generate \
 && pnpm --filter @mmxm/worker build

FROM node:20-alpine3.18 AS runtime
RUN corepack enable && apk add --no-cache libssl1.1 && addgroup -S app && adduser -S app -G app
WORKDIR /app/apps/worker
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/worker/node_modules /app/apps/worker/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/worker/dist /app/apps/worker/dist
COPY --from=build /app/apps/worker/package.json /app/apps/worker/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/package.json /app/package.json
CMD ["./node_modules/.bin/tsx", "dist/main.js"]