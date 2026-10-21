#!/usr/bin/env bash
set -euo pipefail

# Keep only the N most recent assets of each kind across all releases: the signed APK and the
# web bundle. Every release carries both under a name that does not carry the version, so the
# list grows by one row per release and only these last few answer a versioned link.
# Auth token read from fj's keys.json.

MAX_APK="${MAX_APK:-5}"
MAX_WEB="${MAX_WEB:-5}"
REPO="${REPO:-claw/my-claw-app}"
BASE_URL="${BASE_URL:-https://git.kssimi.fr/api/v1}"
TOKEN_FILE="$HOME/.local/share/forgejo-cli/keys.json"
DRY_RUN="${DRY_RUN:-0}"

token="$(jq -r '.hosts["git.kssimi.fr"].token' "$TOKEN_FILE")"
owner="${REPO%%/*}"
repo="${REPO#*/}"

apk=()
web=()
page=1
while :; do
  releases="$(curl -sS -H "Authorization: token $token" -H "Accept: application/json" "$BASE_URL/repos/$owner/$repo/releases?page=$page&limit=50")"
  count="$(jq 'length' <<<"$releases")"
  [[ "$count" -eq 0 ]] && break
  while IFS='|' read -r kind created asset_id release_id name; do
    case "$kind" in
      apk) apk+=("$created|$asset_id|$release_id|$name") ;;
      web) web+=("$created|$asset_id|$release_id|$name") ;;
    esac
  done < <(jq -r '.[] | .id as $rid | .assets[] |
    select((.name | endswith(".apk")) or .name == "dist-web.tar.gz") |
    [(if (.name | endswith(".apk")) then "apk" else "web" end), .created_at,
     (.id | tostring), ($rid | tostring), .name] | join("|")' <<<"$releases")
  # Forgejo caps a page at 50; a short page is the last one.
  [[ "$count" -lt 50 ]] && break
  page=$((page + 1))
done

prune() {
  local -n entries="$1"
  local kind="$1" max="$2"
  local sorted total drop entry created asset_id release_id name code

  if [[ "${#entries[@]}" -eq 0 ]]; then
    echo "cleanup: no $kind assets found"
    return
  fi

  mapfile -t sorted < <(printf '%s\n' "${entries[@]}" | sort -r)
  total="${#sorted[@]}"
  drop=$((total - max))
  if [[ "$drop" -le 0 ]]; then
    echo "cleanup: $total $kind asset(s), max $max, nothing to delete"
    return
  fi

  echo "cleanup: $total $kind asset(s), keeping the $max most recent, deleting $drop"
  for entry in "${sorted[@]:$max}"; do
    IFS='|' read -r created asset_id release_id name <<<"$entry"
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "  would delete release#$release_id/$name (created $created)"
      continue
    fi
    code="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: token $token" "$BASE_URL/repos/$owner/$repo/releases/$release_id/assets/$asset_id")"
    echo "  deleted release#$release_id/$name (created $created) -> HTTP $code"
  done
}

prune apk "$MAX_APK"
prune web "$MAX_WEB"
