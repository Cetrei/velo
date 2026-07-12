# Velo signaling server — single-stage Bun image.
# Only apps/server is containerized; apps/web is deployed separately (Cloudflare Pages).
# See docs/MANUAL_STEPS.md for the full deploy walkthrough.

FROM oven/bun:1 AS runtime

WORKDIR /app

# Copy workspace manifests first so `bun install` is cached unless a dependency actually changes.
# All workspace member package.json files must be present, even ones we won't build here (apps/web),
# because bun validates the full `workspaces` array in the root package.json before it will filter.
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile --filter server --filter shared-types

# Now copy the actual source.
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY config ./config

WORKDIR /app/apps/server

ENV NODE_ENV=production

EXPOSE 4001

CMD ["bun", "run", "start"]
