#!/usr/bin/env bash
# Remove generated folders from the Git index only (files stay on disk).
# Run if Git still shows thousands of changes after updating .gitignore
# (usually means node_modules, VitePress output, or target/ were committed once).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

paths=(
  website/node_modules
  website/.vitepress/dist
  website/.vitepress/cache
  node_modules
  dist
  target
)

for p in "${paths[@]}"; do
  git rm -r --cached "$p" 2>/dev/null || true
done

echo "Done. Run: git status"
echo "Commit the index change: git add -A && git commit -m 'Stop tracking generated files'"
