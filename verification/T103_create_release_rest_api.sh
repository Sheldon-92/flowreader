#!/bin/bash
set -euo pipefail

# T103 GitHub Release Creation Script (REST API)
# Usage: export GH_TOKEN="your-token" && ./T103_create_release_rest_api.sh

# Check for token
if [ -z "${GH_TOKEN:-}" ]; then
  echo "[Error] GH_TOKEN environment variable is not set."
  echo "Please set: export GH_TOKEN=\"your-github-personal-access-token\""
  exit 1
fi

# Variables
OWNER="Sheldon-92"
REPO="flowreader"
TAG="v0.9-personal-ready"
TITLE="v0.9 Personal Use Ready"
RELEASE_NOTES_FILE="RELEASE_NOTES_v0.9_personal_ready.md"
API="https://api.github.com/repos/${OWNER}/${REPO}"

echo "=== T103 GitHub Release Creation (REST API) ==="
echo "Tag: ${TAG}"
echo "Title: ${TITLE}"
echo "Repository: ${OWNER}/${REPO}"
echo ""

# Read release notes
echo "[Step 1] Reading release notes..."
if [ ! -f "${RELEASE_NOTES_FILE}" ]; then
  echo "[Error] Release notes file not found: ${RELEASE_NOTES_FILE}"
  exit 1
fi
NOTES="$(cat "${RELEASE_NOTES_FILE}")"
echo "[Info] Release notes loaded ($(wc -c < "${RELEASE_NOTES_FILE}") bytes)"

# Check if release already exists
echo "[Step 2] Checking if release exists..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Accept: application/vnd.github+json" \
  "${API}/releases/tags/${TAG}")

if [ "${HTTP_CODE}" = "200" ]; then
  echo "[Info] Release already exists for ${TAG}, skipping creation."
  echo "[Info] Will verify and export existing release details."
elif [ "${HTTP_CODE}" = "404" ]; then
  echo "[Info] Release does not exist, creating..."

  # Create release payload
  CREATE_PAYLOAD=$(jq -n \
    --arg tag "${TAG}" \
    --arg name "${TITLE}" \
    --arg body "${NOTES}" \
    '{
      tag_name: $tag,
      name: $name,
      body: $body,
      draft: false,
      prerelease: false,
      generate_release_notes: false
    }')

  # Create release
  echo "[Step 3] Creating release via REST API..."
  CREATE_RESPONSE=$(curl -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${API}/releases" \
    -d "${CREATE_PAYLOAD}" 2>/dev/null)

  # Check creation status
  if echo "${CREATE_RESPONSE}" | jq -e '.id' >/dev/null 2>&1; then
    echo "${CREATE_RESPONSE}" > verification/T103_GH_RELEASE_CREATE_RESPONSE.json
    echo "[Success] Release created successfully!"
    echo "Release ID: $(echo "${CREATE_RESPONSE}" | jq -r '.id')"
  else
    echo "[Error] Failed to create release"
    echo "Response: ${CREATE_RESPONSE}"
    exit 1
  fi
else
  echo "[Warning] Unexpected HTTP status code: ${HTTP_CODE}"
fi

# Get release details
echo "[Step 4] Fetching release details..."
curl -s -H "Accept: application/vnd.github+json" \
  "${API}/releases/tags/${TAG}" \
  | tee verification/T103_GH_RELEASE_VIEW.json \
  | jq '{name, tag_name, html_url, created_at, published_at}' || {
  echo "[Warning] Could not fetch release details"
}

# List releases
echo "[Step 5] Listing recent releases..."
curl -s -H "Accept: application/vnd.github+json" \
  "${API}/releases?per_page=10" \
  | jq -r '.[].tag_name' \
  | tee verification/T103_GH_RELEASE_LIST.txt || {
  echo "[Warning] Could not list releases"
}

# Final verification
echo ""
echo "=== Release Verification ==="
if [ -f verification/T103_GH_RELEASE_VIEW.json ]; then
  RELEASE_URL=$(jq -r '.html_url // .url // empty' verification/T103_GH_RELEASE_VIEW.json 2>/dev/null || echo "N/A")
  echo "Release URL: ${RELEASE_URL}"
fi
echo ""
echo "[Success] T103 GitHub Release process complete!"
echo "View the release at: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}"