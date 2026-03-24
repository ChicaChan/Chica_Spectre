#!/usr/bin/env bash
# Usage: ./scripts/import_posts.sh [directus-base-url]
# Import every JSON post under content/posts into Directus with idempotent upserts.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:1337}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POSTS_DIR="$ROOT_DIR/content/posts"
UPSERT_SCRIPT="$ROOT_DIR/scripts/upsert_post.sh"

if [[ ! -d "$POSTS_DIR" ]]; then
  echo "Missing posts directory: $POSTS_DIR" >&2
  exit 1
fi

if [[ ! -x "$UPSERT_SCRIPT" ]]; then
  echo "Missing upsert script: $UPSERT_SCRIPT" >&2
  exit 1
fi

count=0
while IFS= read -r post_file; do
  [[ -n "$post_file" ]] || continue
  "$UPSERT_SCRIPT" "$post_file" "$BASE_URL"
  count=$((count + 1))
done < <(find "$POSTS_DIR" -maxdepth 1 -type f -name '*.json' | sort)

echo "Imported $count post(s)"
