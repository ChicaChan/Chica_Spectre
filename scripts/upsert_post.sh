#!/usr/bin/env bash
# Usage: ./scripts/upsert_post.sh <post-json-file> [directus-base-url]
# Create or update one Directus post by slug using the local .env admin credentials.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <post-json-file> [directus-base-url]" >&2
  exit 1
fi

POST_FILE="$1"
BASE_URL="${2:-http://127.0.0.1:1337}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$POST_FILE" ]]; then
  echo "Missing post file: $POST_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if ! jq -e '
  type == "object" and
  (.slug | type == "string" and length > 0) and
  (.title | type == "string" and length > 0) and
  (.published_at | type == "string" and length > 0) and
  ((.excerpt == null) or (.excerpt | type == "string")) and
  (.content | type == "string" and length > 0)
' "$POST_FILE" >/dev/null; then
  echo "Post JSON must be an object with non-empty string fields: slug, title, published_at, content; excerpt must be a string or null" >&2
  exit 1
fi

email="$(awk -F= '/^DIRECTUS_ADMIN_EMAIL=/{print $2}' "$ENV_FILE")"
password="$(awk -F= '/^DIRECTUS_ADMIN_PASSWORD=/{print $2}' "$ENV_FILE")"

if [[ -z "$email" || -z "$password" ]]; then
  echo "Missing DIRECTUS_ADMIN_EMAIL or DIRECTUS_ADMIN_PASSWORD in $ENV_FILE" >&2
  exit 1
fi

slug="$(jq -r '.slug // empty' "$POST_FILE")"
title="$(jq -r '.title // empty' "$POST_FILE")"
published_at="$(jq -r '.published_at // empty' "$POST_FILE")"
encoded_slug="$(jq -rn --arg value "$slug" '$value | @uri')"

auth_payload="$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')"
token="$(curl -fsS -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' -d "$auth_payload" | jq -r '.data.access_token')"

if [[ -z "$token" || "$token" == "null" ]]; then
  echo "Failed to login to Directus at $BASE_URL" >&2
  exit 1
fi

existing_id="$(curl -g -fsS -H "Authorization: Bearer $token" "$BASE_URL/items/posts?filter[slug][_eq]=$encoded_slug&fields=id&limit=1" | jq -r '.data[0].id // empty')"
payload="$(jq -c '{slug, title, excerpt, content, published_at}' "$POST_FILE")"

if [[ -n "$existing_id" ]]; then
  curl -fsS -X PATCH \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "$payload" \
    "$BASE_URL/items/posts/$existing_id" >/dev/null
  echo "Updated post: $slug (id=$existing_id)"
else
  curl -fsS -X POST \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "$payload" \
    "$BASE_URL/items/posts" >/dev/null
  echo "Created post: $slug"
fi
