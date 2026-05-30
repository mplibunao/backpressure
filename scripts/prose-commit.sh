#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -ne 1 ]; then
  echo "usage: pnpm prose:commit -- <commit-msg-file>" >&2
  exit 2
fi

scripts/vale-ensure-styles.sh

tmp="COMMIT_EDITMSG"
trap 'rm -f "$tmp"' EXIT

# Vale ignores extensionless files outside the repo. Copying to this repo-root
# basename makes the [COMMIT_EDITMSG] section deterministic in fresh clones.
cp "$1" "$tmp"
vale --no-global --minAlertLevel=error "$tmp"
