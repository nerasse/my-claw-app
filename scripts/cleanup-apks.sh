#!/usr/bin/env bash
set -euo pipefail

# Keep only the MAX_APKS most recent .apk assets across all releases.
# Deletes the oldest ones via the Forgejo API. Auth token read from fj's keys.json.

MAX_APKS="${MAX_APKS:-5}"
REPO="${REPO:-claw/my-claw-app}"
BASE_URL="https://git.kssimi.fr/api/v1"
TOKEN_FILE="$HOME/.local/share/forgejo-cli/keys.json"

token="$(jq -r '.hosts["git.kssimi.fr"].token' "$TOKEN_FILE")"
owner="${REPO%%/*}"
repo="${REPO#*/}"

entries=()
page=1
while :; do
  releases="$(curl -sS -H "Authorization: token $token" -H "Accept: application/json" "$BASE_URL/repos/$owner/$repo/releases?page=$page&limit=50")"
  count="$(jq 'length' <<<"$releases")"
  [[ "$count" -eq 0 ]] && break
  while IFS='|' read -r created asset_id release_id name; do
    entries+=("$created|$asset_id|$release_id|$name")
  done < <(jq -r '.[] | .id as $rid | .assets[] | select(.name | endswith(".apk")) | [.created_at, (.id | tostring), ($rid | tostring), .name] | join("|")' <<<"$releases")
  page=$((page + 1))
  [[ "$page" -gt 20 ]] && break
done

if [[ "${#entries[@]}" -eq 0 ]]; then
  echo "cleanup: no apk assets found"
  exit 0
fi

mapfile -t sorted < <(printf '%s\n' "${entries[@]}" | sort -r)

total="${#sorted[@]}"
to_delete=$((total - MAX_APKS))
if [[ "$to_delete" -le 0 ]]; then
  echo "cleanup: $total apk(s) kept, max $MAX_APKS, nothing to delete"
  exit 0
fi

echo "cleanup: $total apk(s), keeping the $MAX_APKS most recent, deleting $to_delete"
for entry in "${sorted[@]:$MAX_APKS}"; do
  IFS='|' read -r created asset_id release_id name <<<"$entry"
  code="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: token $token" "$BASE_URL/repos/$owner/$repo/releases/$release_id/assets/$asset_id")"
  echo "deleted release#$release_id/$name (created $created) -> HTTP $code"
done
