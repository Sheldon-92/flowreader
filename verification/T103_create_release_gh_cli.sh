#!/bin/bash
set -euo pipefail

# T103 GitHub Release Creation Script (GitHub CLI)
# Usage: export GH_TOKEN="your-token" && ./T103_create_release_gh_cli.sh

# Check for token
if [ -z "${GH_TOKEN:-}" ]; then
  echo "[Error] GH_TOKEN environment variable is not set."
  echo "Please set: export GH_TOKEN=\"your-github-personal-access-token\""
  exit 1
fi

# Variables
TAG="v0.9-personal-ready"
TITLE="v0.9 Personal Use Ready"
RELEASE_NOTES_FILE="RELEASE_NOTES_v0.9_personal_ready.md"
COMMIT="3230e3d85b0d31d922d34c2a38dfcdfa752822fa"

echo "=== T103 GitHub Release Creation ==="
echo "Tag: ${TAG}"
echo "Title: ${TITLE}"
echo "Repository: Sheldon-92/flowreader"
echo ""

# Authenticate
echo "[Step 1] Authenticating with GitHub CLI..."
echo "${GH_TOKEN}" | gh auth login --with-token || {
  echo "[Error] Failed to authenticate with GitHub CLI"
  exit 1
}

# Check authentication
gh auth status || {
  echo "[Error] GitHub CLI not authenticated properly"
  exit 1
}

# Create release (idempotent)
echo "[Step 2] Creating release (idempotent check)..."
if gh release view "${TAG}" >/dev/null 2>&1; then
  echo "[Info] Release already exists for ${TAG}, skipping creation."
  echo "[Info] Will verify and export existing release details."
else
  echo "[Info] Creating new release..."
  gh release create "${TAG}" \
    --title "${TITLE}" \
    --notes-file "${RELEASE_NOTES_FILE}" \
    --verify-tag \
    --target "${COMMIT}" || {
    echo "[Error] Failed to create release"
    exit 1
  }
  echo "[Success] Release created successfully!"
fi

# Export release details
echo "[Step 3] Exporting release details..."
gh release view "${TAG}" \
  --json name,tagName,url,createdAt,publishedAt,author,tarballUrl,zipballUrl \
  | tee verification/T103_GH_RELEASE_VIEW.json

# List releases
echo "[Step 4] Listing recent releases..."
gh release list --limit 10 | tee verification/T103_GH_RELEASE_LIST.txt

# Final verification
echo ""
echo "=== Release Verification ==="
RELEASE_URL=$(jq -r '.url' verification/T103_GH_RELEASE_VIEW.json 2>/dev/null || echo "N/A")
echo "Release URL: ${RELEASE_URL}"
echo ""
echo "[Success] T103 GitHub Release process complete!"
echo "View the release at: https://github.com/Sheldon-92/flowreader/releases/tag/${TAG}"