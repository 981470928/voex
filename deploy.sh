#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="/home/app/voex"

echo "=== Building voex ==="
cd "$(dirname "$0")"
pnpm build:prod

echo "=== Reloading nginx ==="
sudo nginx -t && sudo systemctl reload nginx

echo "=== Done ==="
echo "Output: $OUT_DIR"
du -sh "$OUT_DIR"
