#!/usr/bin/env bash
# Deploy backend to Hugging Face Spaces.
# Pushes only Dockerfile + README.md (HF frontmatter) + backend/ as a fresh
# orphan commit — no frontend, no images, no git history baggage.
#
# Usage:
#   HF_TOKEN=<your_token> ./scripts/deploy-hf.sh
#   or set HF_TOKEN in env and just run the script.

set -euo pipefail

HF_REPO="https://anirbanpx:${HF_TOKEN}@huggingface.co/spaces/anirbanpx/tripsathi-api"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$(mktemp -d)"

echo "→ Staging backend files in $DEPLOY_DIR"

# Copy only what HF needs
cp "$REPO_ROOT/Dockerfile"  "$DEPLOY_DIR/"
cp "$REPO_ROOT/README.md"   "$DEPLOY_DIR/"
cp -r "$REPO_ROOT/backend"  "$DEPLOY_DIR/"

# Drop dirs/files that are large, unused, or dev-only
rm -rf "$DEPLOY_DIR/backend/venv"         # local Python virtualenv
rm -rf "$DEPLOY_DIR/backend/static"       # unused destination images (LFS)
rm -rf "$DEPLOY_DIR/backend/data"         # local chroma/sqlite DBs
rm -rf "$DEPLOY_DIR/backend/.deepeval"    # dev telemetry config
rm -f  "$DEPLOY_DIR/backend/.env"         # local secrets (HF gets env vars via Space settings)
find   "$DEPLOY_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find   "$DEPLOY_DIR" -name "*.pyc" -delete 2>/dev/null || true

echo "→ Initialising orphan git repo"
cd "$DEPLOY_DIR"
git init -q
git checkout -q --orphan main

git config user.email "deploy-bot@tripsathi"
git config user.name  "TripSathi Deploy"

git add -A
git commit -q -m "deploy: $(date -u '+%Y-%m-%dT%H:%M:%SZ') $(cd "$REPO_ROOT" && git rev-parse --short HEAD)"

echo "→ Force-pushing to HF Spaces"
git remote add hf "$HF_REPO"
git push hf main --force

echo "→ Cleaning up"
rm -rf "$DEPLOY_DIR"

echo "✓ HF deploy complete"
