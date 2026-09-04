#!/bin/sh
# The `note-to-plan` gate's scenario, as a repeatable run.
#
# Usage: note-to-plan-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then drives it from a piece of friction
# to a pull request adding a plan, with the commands an operator types:
# `amy note`, `amy --workflow note-to-plan discover` and `... tick`. What it
# is driven against is a world of stand-ins: a `gh`, a `claude` and an `sf` on
# the PATH, and two real git repositories that keep their plans the way this
# one does.
#
# There is no tracker in it at all, which is the point rather than an
# omission: this is the run that proves work reaches the queue and gets to a
# pull request without existing in one.
#
# Nothing here needs a credential and nothing here reaches the internet.
# `--keep` leaves the world on disk to be poked at.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/note-to-plan-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/note-to-plan-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

bin=$(mktemp -d)
cleanup() { rm -rf "$bin"; }
trap cleanup EXIT INT TERM

AMY_BUILD_OUT="${bin}/amy.built" "$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no executable" >&2; exit 1; }

node "$here/note-to-plan/drive.mjs" "$here/note-to-plan" "$bin/amy" "$report" $keep
