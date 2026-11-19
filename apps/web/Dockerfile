# syntax=docker/dockerfile:1
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS dependencies
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN --mount=type=cache,id=wps-release-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM dependencies AS build
COPY packages packages
COPY apps/web apps/web
COPY docs/design/variables.css docs/design/variables.css
COPY scripts/prepare-standalone.mjs scripts/prepare-standalone.mjs
RUN pnpm --filter @wps/contracts build && pnpm --filter @wps/web build

FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS runtime
LABEL org.opencontainers.image.source="https://github.com/LiL-FlexeR/wallet-permission-scanner"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --link --chown=1000:1000 /build/apps/web/.next/standalone/ ./
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/start-standalone.mjs"]
