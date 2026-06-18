#!/usr/bin/env bash
#
# Deploy P2 — ingest the Aura KB corpus into the CRM hybrid RAG and verify.
#
# Usage (from anywhere):
#   ./scripts/deploy-aura-kb-p2.sh            # incremental (unchanged findings skipped)
#   ./scripts/deploy-aura-kb-p2.sh --reindex  # clean rebuild (recommended for first deploy)
#
# Prereqs the operator provides in .env (this script sources it):
#   EMBEDDING_MODEL=accounts/fireworks/models/qwen3-embedding-8b   # 1024-dim capable
#   INFERENCE_PRIMARY_KEY=<fireworks key>                          # used for embeddings
#   EMBEDDING_URL=https://api.fireworks.ai/inference/v1            # optional if INFERENCE_PRIMARY_URL is Fireworks
#
# The embedding model must emit 1024-dim vectors (the crm_vec_embeddings table is float[1024]).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# 1. Load env (so EMBEDDING_MODEL + the API key reach the Node process).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  echo "[deploy] loaded .env"
else
  echo "[deploy] WARNING: no .env found in $ROOT — relying on the current shell environment."
fi

# 2. Validate preconditions (fail fast — bulk embedding is the one irreversible cost).
MODEL="${EMBEDDING_MODEL:-}"
if [ -z "$MODEL" ] || [ "$MODEL" = "text-embedding-v3" ]; then
  echo "[deploy] ERROR: EMBEDDING_MODEL is unset or still the default 'text-embedding-v3'." >&2
  echo "         Set EMBEDDING_MODEL=accounts/fireworks/models/qwen3-embedding-8b in .env." >&2
  exit 1
fi
if [ -z "${INFERENCE_PRIMARY_KEY:-}" ]; then
  echo "[deploy] ERROR: INFERENCE_PRIMARY_KEY (embedding API key) is not set." >&2
  exit 1
fi
if [ -z "${EMBEDDING_URL:-}" ] && [ -z "${INFERENCE_PRIMARY_URL:-}" ]; then
  echo "[deploy] ERROR: neither EMBEDDING_URL nor INFERENCE_PRIMARY_URL is set." >&2
  exit 1
fi
if [ ! -d aura-kb/knowledge ]; then
  echo "[deploy] ERROR: aura-kb/knowledge not found in $ROOT." >&2
  exit 1
fi
echo "[deploy] embedding model: $MODEL"
echo "[deploy] target DB: ${CRM_DB_PATH:-$ROOT/data/store/crm.db}"

# 3. Ingest. Pass through --reindex if requested.
REINDEX_FLAG=""
for a in "$@"; do [ "$a" = "--reindex" ] && REINDEX_FLAG="--reindex"; done
echo "[deploy] ingesting (sync:aura-kb ${REINDEX_FLAG})..."
npm run sync:aura-kb -- ${REINDEX_FLAG}

# 4. Verify (counts + firewall/RBAC-scoped retrieval).
echo "[deploy] verifying..."
npx tsx scripts/verify-aura-kb.ts

echo "[deploy] P2 deploy complete."
