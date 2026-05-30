#!/usr/bin/env sh
set -eu

scripts/vale-ensure-styles.sh

vale --no-global --minAlertLevel=error \
  README.md \
  CLAUDE.md \
  AGENTS.md \
  docs \
  packages/*/README.md
