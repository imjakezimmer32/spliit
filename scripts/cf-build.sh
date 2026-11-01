#!/usr/bin/env bash
# Builds the Cloudflare Workers bundle (.open-next/) with @opennextjs/cloudflare.
# Runtime configuration lives in wrangler.jsonc (vars) and Worker secrets; the
# placeholders below only satisfy the env schema during `next build`.
set -euo pipefail
cd "$(dirname "$0")/.."

# OpenNext copies .env* files into the worker; keep local dev values out of it.
restore=()
for f in .env .env.local .env.production .env.production.local; do
  if [ -f "$f" ]; then mv "$f" "$f.cf-build-bak"; restore+=("$f"); fi
done
trap 'for f in "${restore[@]}"; do mv "$f.cf-build-bak" "$f"; done' EXIT

export NEXT_PUBLIC_UPLOAD_STORAGE=r2
export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-https://rent-split.jake-35b.workers.dev}"
export POSTGRES_PRISMA_URL="${CF_BUILD_PLACEHOLDER_DB:-postgresql://build:build@localhost/build}"
export POSTGRES_URL_NON_POOLING="$POSTGRES_PRISMA_URL"

# Workers cannot compile WebAssembly at runtime, so generate the client with
# Prisma's `cloudflare` runtime (precompiled wasm imports) for this build only.
cp prisma/schema.prisma prisma/schema.prisma.cf-build-bak
trap 'mv prisma/schema.prisma.cf-build-bak prisma/schema.prisma; npx prisma generate >/dev/null 2>&1 || true; for f in "${restore[@]}"; do mv "$f.cf-build-bak" "$f"; done' EXIT
sed -i 's#provider = "prisma-client"#provider = "prisma-client"\n  runtime  = "cloudflare"#' prisma/schema.prisma
npx prisma generate
npx opennextjs-cloudflare build
