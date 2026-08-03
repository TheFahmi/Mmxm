FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile --filter @mmxm/api...

FROM deps AS build
COPY packages/types packages/types
COPY packages/database packages/database
COPY apps/api apps/api
RUN pnpm --filter @mmxm/types build \
 && pnpm --filter @mmxm/database exec prisma generate \
 && pnpm --filter @mmxm/database build \
 && pnpm --filter @mmxm/api build

FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && addgroup --system app && adduser --system --group app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/database/node_modules ./packages/database/node_modules
COPY pnpm-workspace.yaml package.json ./
# re-create pnpm symlinks (resolved by node at runtime)
RUN rm -rf apps/api/node_modules/@mmxm \
 && mkdir -p apps/api/node_modules/@mmxm \
 && ln -s /app/packages/database apps/api/node_modules/@mmxm/database \
 && ln -s /app/packages/types apps/api/node_modules/@mmxm/types \
 && chmod -R a+r /app/packages
USER app
EXPOSE 3001
CMD ["node", "apps/api/dist/apps/api/src/main.js"]