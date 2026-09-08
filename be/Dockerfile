# STE-31 — the Sterun backend, built once and run as three processes.
#
# The API, the poller and the TTL keeper are the same image with different
# commands (be/CLAUDE.md: "which one runs is decided by the command you type,
# not by a flag"). One image means one build, one version, and no chance of the
# poller running code the API does not have.
#
# Multi-stage so the shipped image carries no compiler, no test framework and no
# source: a smaller attack surface on a box that holds identity documents, and a
# faster restart.

# ---------------------------------------------------------------------------
# Stage 1 — install and build against the committed lockfile.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /repo

RUN corepack enable

# Manifests first, so a source-only change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY be/package.json be/
COPY sdk/package.json sdk/
COPY fe/package.json fe/
COPY landing-page/package.json landing-page/

# --frozen-lockfile: a dependency that was never committed fails the build
# rather than resolving to whatever is newest today.
# --filter be...: the backend and what it depends on. fe/ and landing-page/ are
# Next.js apps this image has no use for.
RUN pnpm install --frozen-lockfile --filter be...

COPY be/ be/
COPY sdk/ sdk/
# docs/deployments.md is not documentation here — src/deployments.ts PARSES it
# for the contract addresses, and startup fails without it. Copying it into the
# image is what makes "addresses are never hardcoded" survive containerisation.
COPY docs/deployments.md docs/deployments.md

RUN pnpm --filter be build

# Prune to production dependencies only, into a self-contained tree.
#
# `--legacy` because pnpm 10 otherwise refuses to deploy a workspace that has
# not opted into injected dependencies, and opting in would change how the whole
# repo resolves its workspace packages for the sake of one container build.
# The legacy path copies rather than injects, which is what a runtime image
# wants anyway: no symlinks pointing outside /app.
RUN pnpm --filter be --prod deploy --legacy /out

# ---------------------------------------------------------------------------
# Stage 2 — the runtime.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Bind to every interface: inside a container, 127.0.0.1 is unreachable from the
# reverse proxy. TLS and exposure are the proxy's job (see compose.prod.yml);
# this port is never published to the host.
ENV HOST=0.0.0.0
ENV PORT=3001

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/be/migrations ./migrations
COPY --from=build /repo/docs/deployments.md ../docs/deployments.md

# The mount point for the event metadata files, created here and owned by the
# user that has to write to it.
#
# This exists so a fresh Docker named volume inherits the right ownership.
# Docker seeds an empty volume from the image's directory at that path; when the
# path is ABSENT from the image it creates one owned by root instead, and the
# first upload then fails with EACCES from a process that cannot chown its way
# out. That is the same shape as the cloudflared permission bug in STE-31, and
# it only shows up on a real deployment.
RUN mkdir -p /app/data/files && chown -R node:node /app/data

# Never root. The image holds the code that decrypts PII; if something does get
# in through it, it should arrive as a user that owns nothing.
USER node

EXPOSE 3001

# No HEALTHCHECK here, deliberately.
#
# One image runs three different processes, and only one of them serves HTTP. An
# image-level health check is inherited by all three, so the poller and the TTL
# keeper — which are working perfectly — report "unhealthy" forever, and any
# `depends_on: condition: service_healthy` pointing at them deadlocks. Observed
# on the first real deployment.
#
# The check belongs to the service that can answer it: see the `api` service in
# compose.prod.yml.
CMD ["node", "dist/index.js"]
