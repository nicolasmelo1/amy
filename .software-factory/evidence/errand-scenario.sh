#!/bin/sh
# The `errand` gate's scenario, as a repeatable run.
#
# Usage: errand-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then drives it through four errands with
# the commands an operator types: `amy btw`, `amy --workflow errand discover`
# and `... tick`. What it is driven against is a world of stand-ins: a `gh` and
# a `claude` on the PATH, and one real git repository the work happens in.
#
# There is no tracker in it at all, which is the point rather than an
# omission: `amy btw` is the shortest road anybody has into this machine, and
# nobody who uses it had to open a ticket.
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

report=${1:-"$repo/.software-factory/evidence/errand-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/errand-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

bin=$(mktemp -d)
install_lib=$(mktemp -d)
tarballs=$(mktemp -d)
cleanup() { rm -rf "$bin" "$install_lib" "$tarballs"; }
trap cleanup EXIT INT TERM

AMY_INSTALL_LIB="$install_lib" AMY_TARBALLS="$tarballs" "$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

AMY_E2E_TARBALLS="$tarballs" "$repo/node_modules/.bin/tsx" "$here/errand/drive.ts" "$here/errand" "$bin/amy" "$report" $keep
