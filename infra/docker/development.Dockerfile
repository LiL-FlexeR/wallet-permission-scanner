# syntax=docker/dockerfile:1
# Local verification helper. Release images are a Stage 06 deliverable.
FROM node:24.16.0-bookworm-slim AS dependencies
LABEL org.opencontainers.image.source="https://github.com/LiL-FlexeR/wallet-permission-scanner"
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
RUN --mount=type=cache,id=wps-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM dependencies AS source
COPY --chown=1000:1000 . .
USER node
RUN pnpm --filter @wps/contracts build

FROM source AS api
RUN pnpm --filter @wps/api build
EXPOSE 3001
CMD ["pnpm", "--filter", "@wps/api", "start"]

FROM source AS web
RUN pnpm --filter @wps/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@wps/web", "start"]
