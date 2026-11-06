#!/usr/bin/env bash
# Usage: bash tests/e2e/parity.sh <git commit-ish>   (env CHROME = Chrome binary)
# Builds BASE and the working copy, runs the e2e scenarios on both, and diffs the output.
set -euo pipefail
BASE=${1:?usage: parity.sh <git commit-ish>}
ROOT=$(git rev-parse --show-toplevel)
TMP=$(mktemp -d)
trap 'git -C "$ROOT" worktree remove --force "$TMP/base" 2>/dev/null || true; rm -rf "$TMP"' EXIT
BUILD="npx webpack --mode=development --config ./config/webpack.config.js"

git -C "$ROOT" worktree add --detach "$TMP/base" "$BASE" >/dev/null
ln -s "$ROOT/node_modules" "$TMP/base/node_modules"
(cd "$TMP/base" && $BUILD >/dev/null)
(cd "$ROOT" && $BUILD >/dev/null)
node "$ROOT/tests/e2e/run.js" "$TMP/base/dist/development/chrome" > "$TMP/base.txt"
node "$ROOT/tests/e2e/run.js" "$ROOT/dist/development/chrome" > "$TMP/work.txt"
diff "$TMP/base.txt" "$TMP/work.txt"
