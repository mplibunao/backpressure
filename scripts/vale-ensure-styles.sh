#!/usr/bin/env sh
set -eu

for style in ai-tells ai-tells-commits Google write-good alex; do
  if [ ! -d "styles/$style" ]; then
    vale --no-global sync
    exit 0
  fi
done
