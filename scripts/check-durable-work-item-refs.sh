#!/usr/bin/env sh
set -eu

MATCHES="$(mktemp)"
PATH_MATCHES="$(mktemp)"
trap 'rm -f "$MATCHES" "$PATH_MATCHES"' EXIT

set -- CLAUDE.md packages scripts package.json pnpm-workspace.yaml 'tsconfig*.json' vite.config.ts stryker.config.mjs docs ':!docs/exec-plans' ':!docs/investigations' ':!docs/reports'
# W[I] still matches WI at runtime, but keeps this guard from flagging its own source.
WORK_ITEM_LABEL_PATTERN='W[I]-[0-9][0-9]([0-9])?([^0-9]|$)'

assert_grep_status_ok() {
  if [ "$1" -gt 1 ]; then
    exit "$1"
  fi
}

# Durable source, script, doc, and record files should describe product behavior rather
# than bootstrap plan work-item labels. Historical docs are intentionally out of scope.
set +e
git grep -nEi --untracked "$WORK_ITEM_LABEL_PATTERN" -- "$@" > "$MATCHES"
GREP_STATUS="$?"
set -e
assert_grep_status_ok "$GREP_STATUS"

git ls-files -z --cached --others --exclude-standard -- "$@" \
  | xargs -0 sh -c '
      PATTERN="$1"
      shift
      for FILE do
        [ -f "$FILE" ] || continue
        set +e
        printf "%s\n" "$FILE" | grep -Ei "$PATTERN" >/dev/null
        STATUS="$?"
        set -e

        if [ "$STATUS" -eq 0 ]; then
          printf "path:%s\n" "$FILE"
        elif [ "$STATUS" -gt 1 ]; then
          exit "$STATUS"
        fi
      done
      exit 0
    ' sh "$WORK_ITEM_LABEL_PATTERN" \
  > "$PATH_MATCHES"

if [ -s "$PATH_MATCHES" ]; then
  cat "$PATH_MATCHES" >> "$MATCHES"
fi

if [ -s "$MATCHES" ]; then
  printf '%s\n' 'Durable implementation files must not mention bootstrap work-item labels:'
  cat "$MATCHES"
  printf '%s\n' 'Move historical/provenance notes to docs, or describe the product behavior instead.'
  exit 1
fi
