#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current)"
if [ "$branch" != "main" ]; then
  echo "Refusing production push from branch: $branch" >&2
  echo "Switch to main and fast-forward/merge first." >&2
  exit 1
fi

echo "Repo: quick-vint-api"
echo "Branch pushed: main"
echo "Commits moving origin/main:"
git log --oneline origin/main..HEAD

git push origin main
