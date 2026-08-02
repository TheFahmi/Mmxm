FROM node:20-alpine AS base
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
RUN pnpm --filter @mmxm/database exec prisma generate \
 && pnpm --filter @mmxm/api build

FROM node:20-alpine AS runtime
RUN corepack enable && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages ./packages
COPY pnpm-workspace.yaml package.json ./
USER app
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
