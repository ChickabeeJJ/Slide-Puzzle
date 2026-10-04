#!/usr/bin/env bash
# Packages game/ into release/slide-and-paint-crazygames.zip (index.html at the zip root),
# ready to upload on the CrazyGames developer portal.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p release
OUT="release/slide-and-paint-crazygames.zip"
rm -f "$OUT"
(cd game && zip -r -9 -X "../$OUT" . -x '.*' >/dev/null)
echo "Built $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"
