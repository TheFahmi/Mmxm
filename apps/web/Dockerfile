FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --filter @mmxm/web...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=https://trade.mfah.me
ARG NEXT_PUBLIC_WS_URL=https://trade.mfah.me
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
COPY packages/types packages/types
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mmxm/types build \
 && pnpm --filter @mmxm/web build

FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN addgroup --system app && adduser --system --group app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
RUN rm -rf apps/web/node_modules/@mmxm \
 && mkdir -p apps/web/node_modules/@mmxm \
 && ln -s /app/packages/types apps/web/node_modules/@mmxm/types \
 && chmod -R a+r /app/packages/types
USER app
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start", "-p", "3000"]