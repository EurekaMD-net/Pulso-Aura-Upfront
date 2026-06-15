#!/usr/bin/env bash
# One-shot rollback if Groq/qwen3-32b underperforms.
# Recreates crm-hindsight pointed at Fireworks/minimax-m2p7 (pre-2026-05-09 config).
set -euo pipefail
docker stop crm-hindsight 2>/dev/null && docker rm crm-hindsight 2>/dev/null || true
rm -f /root/claude/crm-azteca/data/hindsight/instances/hindsight/data/postmaster.pid
docker run -d \
  --name crm-hindsight \
  --network crm-net \
  --restart unless-stopped \
  -p 8888:8888 -p 9999:9999 \
  -v /root/claude/crm-azteca/data/hindsight:/home/hindsight/.pg0 \
  -e HINDSIGHT_API_LLM_PROVIDER=openai \
  -e HINDSIGHT_API_LLM_API_KEY=fw_G2Qxa6ApNFhVZ8gxSukbe2 \
  -e HINDSIGHT_API_LLM_MODEL=accounts/fireworks/models/minimax-m2p7 \
  -e HINDSIGHT_API_LLM_BASE_URL=https://api.fireworks.ai/inference/v1 \
  -e HINDSIGHT_API_MCP_ENABLED=true \
  -e HINDSIGHT_API_LLM_TIMEOUT=60 \
  -e HINDSIGHT_API_LLM_MAX_RETRIES=3 \
  -e HINDSIGHT_API_LLM_MAX_CONCURRENT=3 \
  -e HINDSIGHT_API_RERANKER_MAX_CANDIDATES=100 \
  --health-cmd 'curl -sf http://localhost:8888/health || exit 1' \
  --health-interval 30s --health-timeout 5s --health-retries 3 \
  ghcr.io/vectorize-io/hindsight:latest
echo "Rolled back to Fireworks/minimax-m2p7."
