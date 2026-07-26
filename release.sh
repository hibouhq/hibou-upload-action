#!/usr/bin/env bash
#
# release.sh — Cut a release for THIS repo's single action.
#
# One action per repo, so releases use bare semver tags (no per-target prefix).
# Three tags track each release:
#
#   vX.Y.Z   immutable — the exact release, never moved
#   vX.Y     moving    — follows the latest patch of that minor
#   vX       moving    — follows the latest minor+patch of that major
#
# Consumers pin the moving major (@vX) for automatic fixes without editing refs,
# or vX.Y.Z / a commit SHA for strict reproducibility.
#
# This is a TypeScript action: the release rebuilds dist/ with ncc and FAILS if
# the committed dist/ is stale. The author commits dist/; the release never does.
#
# Usage:
#   ./release.sh <version|--bump TYPE> [options]
#
# Arguments:
#   <version>                  Explicit release version, e.g. 1.2.3 (leading "v" ok).
#   --bump major|minor|patch   Derive the next version from the latest vX.Y.Z tag.
#
# Options:
#   -r, --ref <commitish>  Commit/branch/tag to release (default: HEAD).
#   -n, --dry-run          Print the plan; create nothing, push nothing.
#   -y, --yes              Don't prompt before pushing.
#       --no-push          Create tags locally but don't push.
#       --no-release       Don't create a GitHub Release (tags only).
#       --remote <r>       Git remote to push to (default: origin).
#   -h, --help             Show this help and exit.
#
# --bump targets the highest version overall; to release into an older major
# line still maintained, pass an explicit version (e.g. 1.4.3 while 2.x exists).
# In CI the resolved "from -> to" is written to the run summary and a notice.
#
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }
info() { echo "==> $*"; }
usage() { sed -n '2,45p' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; exit 0; }

REF=HEAD
DRY=0
YES=0
PUSH=1
RELEASE=1
REMOTE=origin
VERSION=""
BUMP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --bump)       BUMP="${2:-}"; shift 2;;
    -r|--ref)     REF="${2:-}"; shift 2;;
    -n|--dry-run) DRY=1; shift;;
    -y|--yes)     YES=1; shift;;
    --no-push)    PUSH=0; shift;;
    --no-release) RELEASE=0; shift;;
    --remote)     REMOTE="${2:-}"; shift 2;;
    -h|--help)    usage;;
    -*)           die "unknown option: $1 (see --help)";;
    *)            [ -z "$VERSION" ] || die "unexpected argument: $1"; VERSION="$1"; shift;;
  esac
done

command -v git >/dev/null || die "git not found"
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository"

semver_re='^[0-9]+\.[0-9]+\.[0-9]+$'
# Highest vX.Y.Z tag, or empty if none. `|| true` so an empty match doesn't
# trip `set -o pipefail` (important on a fresh repo with no tags yet).
latest_tag() { git tag -l 'v*' | { grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; } | sort -V | tail -1; }

# ---- resolve the target version ----
if [ -n "$BUMP" ]; then
  [ -z "$VERSION" ] || die "pass either <version> or --bump, not both"
  case "$BUMP" in major|minor|patch) ;; *) die "--bump must be major|minor|patch";; esac
  cur="$(latest_tag)"; cur="${cur#v}"; [ -n "$cur" ] || cur="0.0.0"
  IFS=. read -r MA MI PA <<<"$cur"
  case "$BUMP" in
    major) MA=$((MA + 1)); MI=0; PA=0;;
    minor) MI=$((MI + 1)); PA=0;;
    patch) PA=$((PA + 1));;
  esac
  VERSION="${MA}.${MI}.${PA}"
  FROM="v${cur}"
else
  [ -n "$VERSION" ] || die "provide <version> or --bump TYPE (see --help)"
  VERSION="${VERSION#v}"
  FROM="$(latest_tag)"; FROM="${FROM:-none}"
fi

[[ "$VERSION" =~ $semver_re ]] || die "invalid version '$VERSION' (want X.Y.Z)"
IFS=. read -r MAJOR MINOR PATCH <<<"$VERSION"

TAG="v${VERSION}"
TAG_MINOR="v${MAJOR}.${MINOR}"
TAG_MAJOR="v${MAJOR}"
SHA="$(git rev-parse --verify "${REF}^{commit}" 2>/dev/null)" || die "bad --ref: $REF"

git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null \
  && die "${TAG} already exists (immutable) — pick a new version"

# ---- TypeScript action: verify committed dist/ is fresh ----
if [ -f package.json ] && [ -d dist ]; then
  if [ "$DRY" -eq 1 ]; then
    info "(dry-run) skipping dist/ freshness check"
  else
    info "Verifying dist/ is up to date (ncc rebuild)"
    npm ci
    npm run build
    if ! git diff --quiet -- dist; then
      git --no-pager diff --stat -- dist
      die "dist/ is stale — run 'npm run build' and commit dist/ before releasing"
    fi
  fi
fi

echo
info "Release plan"
echo "  ref:      ${REF} (${SHA})"
echo "  from:     ${FROM}"
echo "  version:  ${TAG}"
echo "  tags:     ${TAG} (immutable), ${TAG_MINOR} + ${TAG_MAJOR} (moving)"
echo "  push:     $([ "$PUSH" -eq 1 ] && echo "yes -> ${REMOTE}" || echo "no")"
echo "  release:  $([ "$RELEASE" -eq 1 ] && echo "yes" || echo "no")"
echo

# record from -> to for CI (run-name can't compute it)
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Release ${TAG}"
    echo
    echo "| | |"
    echo "|---|---|"
    echo "| from | \`${FROM}\` |"
    echo "| to | \`${TAG}\` (+ ${TAG_MINOR}, ${TAG_MAJOR}) |"
    echo "| commit | \`${SHA}\` |"
  } >> "$GITHUB_STEP_SUMMARY"
fi
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::notice::Releasing ${TAG} (from ${FROM}) at ${SHA}"

if [ "$DRY" -eq 1 ]; then
  info "dry-run: nothing created"
  exit 0
fi

if [ "$YES" -ne 1 ] && [ -t 0 ]; then
  read -r -p "Proceed? [y/N] " ans
  case "$ans" in y|Y|yes|YES) ;; *) die "aborted";; esac
fi

info "Creating tags"
git tag -a "$TAG" -m "$TAG" "$SHA"
git tag -f -a "$TAG_MINOR" -m "$TAG_MINOR" "$SHA"
git tag -f -a "$TAG_MAJOR" -m "$TAG_MAJOR" "$SHA"

if [ "$PUSH" -eq 1 ]; then
  info "Pushing tags to ${REMOTE}"
  git push "$REMOTE" "refs/tags/${TAG}"
  git push -f "$REMOTE" "refs/tags/${TAG_MINOR}" "refs/tags/${TAG_MAJOR}"
fi

if [ "$RELEASE" -eq 1 ] && [ "$PUSH" -eq 1 ]; then
  command -v gh >/dev/null || die "gh not found (needed unless --no-release)"
  info "Creating GitHub Release ${TAG}"
  gh release create "$TAG" --title "$TAG" --generate-notes --target "$SHA"
fi

info "Done: ${TAG}"
