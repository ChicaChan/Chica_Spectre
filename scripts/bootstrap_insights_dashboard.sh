#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:1337}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
PUBLISH_PUBLIC="${PUBLISH_PUBLIC:-0}"

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

api_delete() {
	local path="$1"
	curl -fsS -X DELETE -H "Authorization: Bearer $token" "$BASE_URL$path"
}

ensure_dashboard() {
	local existing_id
	existing_id="$(api_get '/dashboards?limit=200&fields=id,name' | jq -r '.data[] | select(.name=="博客公开仪表盘") | .id' | head -n 1)"

	local payload
	payload="$(jq -nc '{
		name:"博客公开仪表盘",
		icon:"space_dashboard",
		color:"#8c5cf5",
		note:null
	}')"

	if [[ -n "$existing_id" && "$existing_id" != "null" ]]; then
		echo "Updating dashboard: 博客公开仪表盘" >&2
		api_patch "/dashboards/$existing_id" "$payload" >/dev/null
		echo "$existing_id"
	else
		echo "Creating dashboard: 博客公开仪表盘" >&2
		api_post '/dashboards' "$payload" | jq -r '.data.id'
	fi
}

find_panel_id() {
	local dashboard_id="$1"
	local panel_name="$2"
	api_get "/dashboards/$dashboard_id?fields=panels.id,panels.name" \
		| jq -r --arg panel_name "$panel_name" '.data.panels[]? | select(.name==$panel_name) | .id' \
		| head -n 1
}

upsert_panel() {
	local dashboard_id="$1"
	local panel_name="$2"
	local payload="$3"
	local panel_id
	panel_id="$(find_panel_id "$dashboard_id" "$panel_name")"

	if [[ -n "$panel_id" && "$panel_id" != "null" ]]; then
		echo "Updating panel: $panel_name"
		api_patch "/panels/$panel_id" "$payload" >/dev/null
	else
		echo "Creating panel: $panel_name"
		api_post '/panels' "$payload" >/dev/null
	fi
}

delete_panel_if_exists() {
	local dashboard_id="$1"
	local panel_name="$2"
	local panel_id
	panel_id="$(find_panel_id "$dashboard_id" "$panel_name")"

	if [[ -n "$panel_id" && "$panel_id" != "null" ]]; then
		echo "Deleting panel: $panel_name"
		api_delete "/panels/$panel_id" >/dev/null
	fi
}

ensure_public_permission() {
	local collection="$1"
	local permissions_json="$2"
	local fields_json="$3"

	local public_policy
	public_policy="$(api_get '/policies?limit=200' | jq -r '.data[] | select(.name=="$t:public_label") | .id')"

	if [[ -z "$public_policy" || "$public_policy" == "null" ]]; then
		echo "Unable to find Directus public policy" >&2
		exit 1
	fi

	local permission_id
	permission_id="$(
		api_get '/permissions?limit=500' \
			| jq -r --arg policy "$public_policy" --arg collection "$collection" '
				.data[]
				| select(.policy==$policy and .collection==$collection and .action=="read")
				| .id
			' | head -n 1
	)"

	local payload
	payload="$(jq -nc \
		--arg policy "$public_policy" \
		--arg collection "$collection" \
		--argjson permissions "$permissions_json" \
		--argjson fields "$fields_json" '
		{
			policy:$policy,
			collection:$collection,
			action:"read",
			permissions:$permissions,
			fields:$fields,
			validation:null,
			presets:null
		}
	')"

	if [[ -n "$permission_id" && "$permission_id" != "null" ]]; then
		echo "Updating public read permission on $collection"
		api_patch "/permissions/$permission_id" "$payload" >/dev/null
	else
		echo "Creating public read permission on $collection"
		api_post '/permissions' "$payload" >/dev/null
	fi
}

dashboard_id="$(ensure_dashboard)"

delete_panel_if_exists "$dashboard_id" "公开导语"

upsert_panel "$dashboard_id" "文章总数" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"文章总数",
	type:"metric",
	position_x:1,
	position_y:1,
	width:6,
	height:5,
	show_header:true,
	color:"#8c5cf5",
	icon:"library_books",
	note:null,
	options:{
		collection:"posts",
		field:"id",
		function:"count",
		sortField:"published_at",
		prefix:"",
		suffix:" 篇",
		numberStyle:"decimal",
		notation:"standard",
		minimumFractionDigits:0,
		maximumFractionDigits:0
	}
}')"

upsert_panel "$dashboard_id" "首篇发文" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"首篇发文",
	type:"metric",
	position_x:7,
	position_y:1,
	width:6,
	height:5,
	show_header:true,
	color:"#59c3c3",
	icon:"history_edu",
	note:null,
	options:{
		collection:"posts",
		field:"published_at",
		function:"first",
		sortField:"published_at",
		prefix:"",
		suffix:""
	}
}')"

upsert_panel "$dashboard_id" "最近发文" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"最近发文",
	type:"metric",
	position_x:13,
	position_y:1,
	width:6,
	height:5,
	show_header:true,
	color:"#ffb84d",
	icon:"event",
	note:null,
	options:{
		collection:"posts",
		field:"published_at",
		function:"last",
		sortField:"published_at",
		prefix:"",
		suffix:""
	}
}')"

upsert_panel "$dashboard_id" "带摘要文章" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"带摘要文章",
	type:"metric",
	position_x:19,
	position_y:1,
	width:6,
	height:5,
	show_header:true,
	color:"#ff6b7a",
	icon:"short_text",
	note:null,
	options:{
		collection:"posts",
		field:"id",
		function:"count",
		sortField:"published_at",
		filter:{
			excerpt:{
				_nempty:true
			}
		},
		prefix:"",
		suffix:" 篇",
		numberStyle:"decimal",
		notation:"standard",
		minimumFractionDigits:0,
		maximumFractionDigits:0
	}
}')"

upsert_panel "$dashboard_id" "近 30 天更新" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"近 30 天更新",
	type:"metric",
	position_x:1,
	position_y:6,
	width:8,
	height:5,
	show_header:true,
	color:"#7fffd4",
	icon:"bolt",
	note:null,
	options:{
		collection:"posts",
		field:"id",
		function:"count",
		sortField:"published_at",
		filter:{
			published_at:{
				_gte:"$NOW(-30 days)"
			}
		},
		prefix:"",
		suffix:" 篇",
		numberStyle:"decimal",
		notation:"standard",
		minimumFractionDigits:0,
		maximumFractionDigits:0
	}
}')"

upsert_panel "$dashboard_id" "近 90 天更新" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"近 90 天更新",
	type:"metric",
	position_x:9,
	position_y:6,
	width:8,
	height:5,
	show_header:true,
	color:"#5dd39e",
	icon:"update",
	note:null,
	options:{
		collection:"posts",
		field:"id",
		function:"count",
		sortField:"published_at",
		filter:{
			published_at:{
				_gte:"$NOW(-90 days)"
			}
		},
		prefix:"",
		suffix:" 篇",
		numberStyle:"decimal",
		notation:"standard",
		minimumFractionDigits:0,
		maximumFractionDigits:0
	}
}')"

upsert_panel "$dashboard_id" "待补摘要" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"待补摘要",
	type:"metric",
	position_x:17,
	position_y:6,
	width:8,
	height:5,
	show_header:true,
	color:"#f28482",
	icon:"assignment_late",
	note:null,
	options:{
		collection:"posts",
		field:"id",
		function:"count",
		sortField:"published_at",
		filter:{
			excerpt:{
				_empty:true
			}
		},
		prefix:"",
		suffix:" 篇",
		numberStyle:"decimal",
		notation:"standard",
		minimumFractionDigits:0,
		maximumFractionDigits:0
	}
}')"

upsert_panel "$dashboard_id" "月度发文趋势" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"月度发文趋势",
	type:"time-series",
	position_x:1,
	position_y:11,
	width:14,
	height:10,
	show_header:true,
	color:"#8c5cf5",
	icon:"timeline",
	note:null,
	options:{
		collection:"posts",
		function:"count",
		precision:"month",
		dateField:"published_at",
		range:"auto",
		valueField:"id",
		decimals:0,
		curveType:"smooth",
		fillType:"gradient",
		showXAxis:true,
		showYAxis:true
	}
}')"

upsert_panel "$dashboard_id" "最近更新文章" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"最近更新文章",
	type:"list",
	position_x:15,
	position_y:11,
	width:10,
	height:10,
	show_header:true,
	color:"#7fffd4",
	icon:"list",
	note:null,
	options:{
		collection:"posts",
		limit:6,
		sortField:"published_at",
		sortDirection:"desc",
		displayTemplate:"{{ title }}",
		linkToItem:false
	}
}')"

upsert_panel "$dashboard_id" "近 180 天周度节奏" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"近 180 天周度节奏",
	type:"time-series",
	position_x:1,
	position_y:21,
	width:14,
	height:10,
	show_header:true,
	color:"#4cc9f0",
	icon:"insights",
	note:null,
	options:{
		collection:"posts",
		function:"count",
		precision:"week",
		dateField:"published_at",
		range:"180 days",
		valueField:"id",
		decimals:0,
		curveType:"smooth",
		fillType:"gradient",
		showXAxis:true,
		showYAxis:true
	}
}')"

upsert_panel "$dashboard_id" "待补摘要文章" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"待补摘要文章",
	type:"list",
	position_x:15,
	position_y:21,
	width:10,
	height:10,
	show_header:true,
	color:"#f28482",
	icon:"playlist_remove",
	note:null,
	options:{
		collection:"posts",
		limit:6,
		sortField:"published_at",
		sortDirection:"desc",
		displayTemplate:"{{ title }}",
		filter:{
			excerpt:{
				_empty:true
			}
		},
		linkToItem:false
	}
}')"

upsert_panel "$dashboard_id" "建站早期文章" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"建站早期文章",
	type:"list",
	position_x:1,
	position_y:31,
	width:12,
	height:10,
	show_header:true,
	color:"#ffd166",
	icon:"schedule",
	note:null,
	options:{
		collection:"posts",
		limit:5,
		sortField:"published_at",
		sortDirection:"asc",
		displayTemplate:"{{ title }}",
		linkToItem:false
	}
}')"

upsert_panel "$dashboard_id" "最近带摘要文章" "$(jq -nc --arg dashboard "$dashboard_id" '{
	dashboard:$dashboard,
	name:"最近带摘要文章",
	type:"list",
	position_x:13,
	position_y:31,
	width:12,
	height:10,
	show_header:true,
	color:"#7bd389",
	icon:"article",
	note:null,
	options:{
		collection:"posts",
		limit:5,
		sortField:"published_at",
		sortDirection:"desc",
		displayTemplate:"{{ title }}",
		filter:{
			excerpt:{
				_nempty:true
			}
		},
		linkToItem:false
	}
}')"

if [[ "$PUBLISH_PUBLIC" == "1" ]]; then
	echo "Publishing dashboard to Directus public policy"
	ensure_public_permission "directus_dashboards" "{\"id\":{\"_eq\":\"$dashboard_id\"}}" '["id","name","icon","color","note","panels"]'
	ensure_public_permission "directus_panels" "{\"dashboard\":{\"_eq\":\"$dashboard_id\"}}" '["id","dashboard","type","position_x","position_y","width","height","show_header","name","icon","color","note","options"]'
fi

echo "Insights dashboard bootstrap complete: $dashboard_id"
