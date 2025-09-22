# T103-GH-RELEASE Programmatic Result

**Tag**: v0.9-personal-ready
**Title**: v0.9 Personal Use Ready
**Repository**: https://github.com/Sheldon-92/flowreader
**Method**: REST API (with token instructions)
**Date**: 2025-09-19T22:53:30-04:00

## Evidence Files
- verification/T103_env.txt
- verification/T103_remote.txt
- verification/T103_tag.txt
- verification/T103_tag_show.txt
- verification/T103_GH_RELEASE_VIEW.json (pending creation)
- verification/T103_GH_RELEASE_LIST.txt (pending creation)
- verification/T103_GH_RELEASE_CREATE_RESPONSE.json (pending creation)

## Baseline Verification ✅

### Remote Configuration
```
origin	https://github.com/Sheldon-92/flowreader.git (fetch)
origin	https://github.com/Sheldon-92/flowreader.git (push)
```

### Tag Status
```
v0.9-personal-ready Personal Use Ready; Expansion Paused
```

### Tag Details
```
tag v0.9-personal-ready
Tagger: Sheldon Zhao <sheldonzhao@SheldondeMacBook-Air.local>
Date:   Fri Sep 19 20:12:17 2025 -0400

Personal Use Ready; Expansion Paused

commit 3230e3d85b0d31d922d34c2a38dfcdfa752822fa
```

## Release Creation Status

### Current State
- **Release Exists**: ❌ No (checked via public API)
- **Token Available**: ❌ No GH_TOKEN environment variable
- **Action Required**: Set GH_TOKEN and execute commands below

## Programmatic Release Commands

### Option 1: GitHub CLI (Recommended)

```bash
# Set your GitHub Personal Access Token (with 'repo' scope)
export GH_TOKEN="your-github-personal-access-token"

# Authenticate with GitHub CLI
echo "${GH_TOKEN}" | gh auth login --with-token

# Create release (idempotent - checks if exists first)
if gh release view "v0.9-personal-ready" >/dev/null 2>&1; then
  echo "[Info] Release already exists for v0.9-personal-ready, verifying..."
else
  gh release create "v0.9-personal-ready" \
    --title "v0.9 Personal Use Ready" \
    --notes-file "RELEASE_NOTES_v0.9_personal_ready.md" \
    --verify-tag \
    --target "3230e3d85b0d31d922d34c2a38dfcdfa752822fa"
fi

# Export release details
gh release view "v0.9-personal-ready" \
  --json name,tagName,url,createdAt,publishedAt,author,tarballUrl,zipballUrl \
  | tee verification/T103_GH_RELEASE_VIEW.json

# List releases
gh release list --limit 10 | tee verification/T103_GH_RELEASE_LIST.txt
```

### Option 2: REST API (Alternative)

```bash
# Set your GitHub Personal Access Token (with 'repo' scope)
export GH_TOKEN="your-github-personal-access-token"

# Set variables
OWNER="Sheldon-92"
REPO="flowreader"
TAG="v0.9-personal-ready"
TITLE="v0.9 Personal Use Ready"
API="https://api.github.com/repos/${OWNER}/${REPO}"

# Read release notes
NOTES="$(cat RELEASE_NOTES_v0.9_personal_ready.md)"

# Check if release exists
RELEASE_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${API}/releases/tags/${TAG}")

if [ "${RELEASE_EXISTS}" = "404" ]; then
  # Create release
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

  curl -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${API}/releases" \
    -d "${CREATE_PAYLOAD}" \
    | tee verification/T103_GH_RELEASE_CREATE_RESPONSE.json
else
  echo "[Info] Release already exists for ${TAG}"
fi

# Get release details
curl -H "Accept: application/vnd.github+json" \
  "${API}/releases/tags/${TAG}" \
  | tee verification/T103_GH_RELEASE_VIEW.json

# List releases
curl -H "Accept: application/vnd.github+json" \
  "${API}/releases?per_page=10" \
  | jq '.[].tag_name' -r \
  | tee verification/T103_GH_RELEASE_LIST.txt
```

## Idempotent Behavior ✅

The provided commands implement idempotent behavior:
1. **Check First**: Verifies if release exists before attempting creation
2. **Skip if Exists**: Does not error on duplicate; only verifies
3. **Create if Missing**: Creates new release only when needed
4. **Always Verify**: Exports current state regardless of creation

## Token Security Requirements

### Creating a GitHub Personal Access Token
1. Go to: https://github.com/settings/tokens/new
2. Select scope: `repo` (full control of private repositories)
3. Set expiration as needed
4. Generate token and copy immediately
5. Store securely (never commit to repository)

### Token Usage Guidelines
- ✅ Use environment variable: `export GH_TOKEN="..."`
- ✅ Pass via secure methods only
- ❌ Never hardcode in scripts
- ❌ Never include in reports or logs
- ❌ Never commit to version control

## Expected Release URL

Once created, the release will be available at:
- **Direct URL**: https://github.com/Sheldon-92/flowreader/releases/tag/v0.9-personal-ready
- **Latest Release**: https://github.com/Sheldon-92/flowreader/releases/latest
- **All Releases**: https://github.com/Sheldon-92/flowreader/releases

## Verification After Creation

### Public API Verification (No Auth Required)
```bash
# Check release exists
curl -s "https://api.github.com/repos/Sheldon-92/flowreader/releases/tags/v0.9-personal-ready" \
  | jq '{name, tag_name, html_url, created_at}'

# Download release assets
curl -L -o "flowreader-v0.9.tar.gz" \
  "https://github.com/Sheldon-92/flowreader/archive/refs/tags/v0.9-personal-ready.tar.gz"
```

## Code Integrity Confirmation ✅

### No Repository Modifications
- **Code Files**: ✅ No changes
- **Branches**: ✅ No changes
- **Tags**: ✅ No changes (using existing tag)
- **Commits**: ✅ No new commits

### Only Metadata Operations
- **Release Creation**: GitHub-side metadata only
- **Documentation**: Using existing RELEASE_NOTES file
- **Verification Files**: Only in verification/ directory

## Conclusion

### Status Summary
- **Idempotent**: ✅ Commands handle existing releases gracefully
- **Programmatic**: ✅ Fully automated with token
- **Safe**: ✅ No code or tags modified; metadata operation only
- **Reproducible**: ✅ Commands can be run multiple times safely

### Next Action Required
1. **Obtain GitHub Personal Access Token** with `repo` scope
2. **Set environment variable**: `export GH_TOKEN="your-token"`
3. **Execute either Option 1 (gh CLI) or Option 2 (REST API)** commands
4. **Verify release creation** at GitHub releases page

### Alternative: Manual Web Creation
If token creation is not feasible, use web interface:
1. Navigate to: https://github.com/Sheldon-92/flowreader/releases/new
2. Select tag: `v0.9-personal-ready`
3. Title: `v0.9 Personal Use Ready`
4. Copy release notes from `RELEASE_NOTES_v0.9_personal_ready.md`
5. Publish release

---

**Process**: T103-GH-RELEASE (Programmatic)
**Completion Requirements**: GitHub Personal Access Token
**Automation Ready**: Yes (with token)