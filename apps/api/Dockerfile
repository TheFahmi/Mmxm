FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY packages/types packages/types
COPY packages/database packages/database
COPY apps/api apps/api
RUN pnpm --filter @mmxm/database exec prisma generate \
 && pnpm --filter @mmxm/api build

FROM node:20-alpine3.18 AS runtime
RUN corepack enable && apk add --no-cache openssl libssl1.1 && addgroup -S app && adduser -S app -G app
WORKDIR /app/apps/api
ENV NODE_ENV=production
# bring full install so dist can resolve nest etc.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/package.json /app/package.json
# dist layout = apps/api/dist/apps/api/src/main.js
CMD ["./node_modules/.bin/tsx", "dist/apps/api/src/main.js"]
