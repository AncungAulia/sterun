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

# Never root. The image holds the code that decrypts PII; if something does get
# in through it, it should arrive as a user that owns nothing.
USER node

EXPOSE 3001

# Liveness, not readiness: this restarts a wedged process. Whether traffic
# should be routed here is /ready, and that is the proxy's question.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
