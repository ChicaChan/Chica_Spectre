#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:1337}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

email="$(awk -F= '/^DIRECTUS_ADMIN_EMAIL=/{print $2}' "$ENV_FILE")"
password="$(awk -F= '/^DIRECTUS_ADMIN_PASSWORD=/{print $2}' "$ENV_FILE")"

if [[ -z "$email" || -z "$password" ]]; then
  echo "Missing DIRECTUS_ADMIN_EMAIL or DIRECTUS_ADMIN_PASSWORD in $ENV_FILE" >&2
  exit 1
fi

auth_payload="$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')"
token="$(curl -fsS -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' -d "$auth_payload" | jq -r '.data.access_token')"

if [[ -z "$token" || "$token" == "null" ]]; then
  echo "Failed to login to Directus at $BASE_URL" >&2
  exit 1
fi

api_get() {
  local path="$1"
  curl -fsS -H "Authorization: Bearer $token" "$BASE_URL$path"
}

api_post() {
  local path="$1"
  local payload="$2"
  curl -fsS -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$payload" "$BASE_URL$path"
}

api_patch() {
  local path="$1"
  local payload="$2"
  curl -fsS -X PATCH -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$payload" "$BASE_URL$path"
}

collection_exists="$(api_get '/collections?limit=200' | jq '[.data[] | select(.collection=="posts")] | length')"
if [[ "$collection_exists" == "0" ]]; then
  echo "Creating collection: posts"
  api_post '/collections' '{"collection":"posts","meta":{"icon":"article","note":"Blog posts"},"schema":{"name":"posts"}}' >/dev/null
else
  echo "Collection posts already exists"
fi

ensure_field() {
  local field="$1"
  local payload="$2"
  local exists
  exists="$(api_get '/fields/posts?limit=200' | jq --arg f "$field" '[.data[] | select(.field==$f)] | length')"
  if [[ "$exists" == "0" ]]; then
    echo "Creating field: $field"
    api_post '/fields/posts' "$payload" >/dev/null
  else
    echo "Field exists: $field"
  fi
}

ensure_field "slug" '{"field":"slug","type":"string","meta":{"interface":"input","required":true,"sort":1},"schema":{"is_nullable":false,"is_unique":true}}'
ensure_field "title" '{"field":"title","type":"string","meta":{"interface":"input","required":true,"sort":2},"schema":{"is_nullable":false}}'
ensure_field "excerpt" '{"field":"excerpt","type":"text","meta":{"interface":"input-multiline","sort":3}}'
ensure_field "content" '{"field":"content","type":"text","meta":{"interface":"input-multiline","note":"请使用 Markdown 编写正文","sort":4}}'
ensure_field "published_at" '{"field":"published_at","type":"timestamp","meta":{"interface":"datetime","sort":5}}'

public_policy="$(api_get '/policies?limit=200' | jq -r '.data[] | select(.name=="$t:public_label") | .id')"
if [[ -z "$public_policy" || "$public_policy" == "null" ]]; then
  echo "Unable to find Directus public policy" >&2
  exit 1
fi

api_patch "/policies/$public_policy" '{"app_access":true}' >/dev/null

read_permission_exists="$(api_get '/permissions?limit=500' | jq --arg p "$public_policy" '[.data[] | select(.policy==$p and .collection=="posts" and .action=="read")] | length')"
if [[ "$read_permission_exists" == "0" ]]; then
  echo "Granting public read permission on posts"
  perm_payload="$(jq -nc --arg p "$public_policy" '{policy:$p,collection:"posts",action:"read",permissions:{},fields:["*"],validation:null,presets:null}')"
  api_post '/permissions' "$perm_payload" >/dev/null
else
  echo "Public read permission already exists"
fi

sample_exists="$(curl -g -fsS "$BASE_URL/items/posts?filter[slug][_eq]=hello-astro-directus&fields=id" | jq '.data | length')"
if [[ "$sample_exists" == "0" ]]; then
  echo "Creating sample post"
  sample_payload='{"slug":"hello-astro-directus","title":"欢迎使用 Astro + Directus","excerpt":"你的博客系统已经成功上线。","content":"这篇文章是在部署阶段自动创建的示例内容。\n\n你可以在 CMS 后台随时编辑或删除它。","published_at":"2026-03-18T06:20:00.000Z"}'
  api_post '/items/posts' "$sample_payload" >/dev/null
else
  echo "Sample post already exists"
fi

echo "Directus bootstrap complete"
