FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=https://trade.mfah.me
ARG NEXT_PUBLIC_WS_URL=https://trade.mfah.me
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
COPY packages/types packages/types
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mmxm/web build

FROM node:20-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
# standalone output embeds node_modules + server.js — no workspace layout needed
COPY --from=build /app/apps/web/.next/standalone /app/
COPY --from=build /app/apps/web/public /app/apps/web/public
COPY --from=build /app/apps/web/.next/static /app/apps/web/.next/static
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]