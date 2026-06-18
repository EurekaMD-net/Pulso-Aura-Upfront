#!/usr/bin/env bash
#
# Build a minimal .env for the Aura KB deploy by pulling the Fireworks API key out of an
# existing backup env, and forcing the embedding endpoint to Fireworks.
#
# WHY force the URL: the backup's EMBEDDING_URL points at the deprecated DashScope endpoint,
# and the code prefers EMBEDDING_URL over INFERENCE_PRIMARY_URL — so we must override it.
#
# Usage:
#   bash scripts/make-deploy-env.sh [path-to-backup-env]
# Default backup path is the VPS clean-start backup.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP="${1:-/root/claude/crm-azteca-env.backup-2026-06-15}"
if [ ! -r "$BACKUP" ]; then
  echo "ERROR: cannot read backup env at: $BACKUP" >&2
  echo "       pass the correct path: bash scripts/make-deploy-env.sh /path/to/your/.env.backup" >&2
  exit 1
fi

# Extract the key value with sed (portable; avoids grep/ugrep differences). Strip any CR.
KEY="$(sed -n 's/^INFERENCE_PRIMARY_KEY=//p' "$BACKUP" | head -1 | tr -d '\r')"
if [ -z "$KEY" ]; then
  echo "ERROR: INFERENCE_PRIMARY_KEY not found in $BACKUP" >&2
  exit 1
fi

if [ -f .env ]; then
  cp .env ".env.bak.$(date +%s 2>/dev/null || echo prev)" 2>/dev/null || true
  echo "note: existing .env backed up to .env.bak.*"
fi

umask 077
{
  echo "INFERENCE_PRIMARY_KEY=$KEY"
  echo "EMBEDDING_URL=https://api.fireworks.ai/inference/v1"
  echo "EMBEDDING_MODEL=accounts/fireworks/models/qwen3-embedding-8b"
} > .env
chmod 600 .env

echo ".env written ($(wc -l < .env) lines)"
echo "  keys: $(sed -n 's/=.*//p' .env | paste -sd, -)   (values hidden)"
echo "  embedding endpoint: https://api.fireworks.ai/inference/v1/embeddings"
echo "  embedding model:    accounts/fireworks/models/qwen3-embedding-8b (1024-dim)"
