# Official Node image manifest reviewed 2026-10-17. Update the digest deliberately.
ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
ARG APP
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_DASHBOARD_URL
ARG NEXT_PUBLIC_APP_MODE=live
ARG NEXT_PUBLIC_INDEXABLE=false
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} NEXT_PUBLIC_DASHBOARD_URL=${NEXT_PUBLIC_DASHBOARD_URL}
ENV NEXT_PUBLIC_APP_MODE=${NEXT_PUBLIC_APP_MODE} NEXT_PUBLIC_INDEXABLE=${NEXT_PUBLIC_INDEXABLE}
RUN test "$APP" = website -o "$APP" = dashboard
RUN pnpm --filter "@jesus-in-practice/$APP" build

FROM ${NODE_IMAGE} AS app
WORKDIR /app
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APP=${APP}
COPY --from=build --chown=node:node /workspace/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /workspace/apps/${APP}/public ./apps/${APP}/public
COPY --chown=node:node deployment/start-app.mjs ./start-app.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/'+(process.env.APP==='dashboard'?'api/health':'')).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","start-app.mjs"]

FROM ${NODE_IMAGE} AS scheduler
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node scripts/ops-common.mjs scripts/ops-scheduler.mjs scripts/ops-monitor.mjs ./scripts/
USER node
CMD ["node","scripts/ops-scheduler.mjs"]
