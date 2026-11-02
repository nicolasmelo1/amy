#!/bin/sh
# The `errand` gate's scenario, as a repeatable run.
#
# Usage: errand-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then drives it through five errands with
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
regst=$(mktemp -d)
regpid=""
cleanup() {
  if [ -n "$regpid" ]; then kill "$regpid" 2>/dev/null || true; fi
  rm -rf "$bin" "$install_lib" "$tarballs" "$regst";
}
trap cleanup EXIT INT TERM

AMY_INSTALL_LIB="$install_lib" AMY_TARBALLS="$tarballs" "$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

# `amy add @amykit/workflow-errand` runs real npm, and real npm resolves the
# tarball's dependencies by version against a registry. A static one on the
# loopback publishes exactly the tarballs the installer packed, so the
# version ranges resolve to this build — and the run never reaches any real
# registry, which is the claim rather than a convenience.
mkdir -p "$regst/tarballs"
for ball in "$tarballs"/*.tgz; do ln -s "$ball" "$regst/tarballs/"; done
"$repo/node_modules/.bin/tsx" "$here/amy-update/registry.ts" "$regst" "$repo/node_modules" >/dev/null &
regpid=$!
for _ in $(seq 1 50); do
  if [ -f "$regst/url" ]; then break; fi
  sleep 0.1
done
test -f "$regst/url" || { echo "the stand-in registry did not come up" >&2; exit 1; }
AMY_E2E_REGISTRY=$(cat "$regst/url")
export AMY_E2E_REGISTRY

AMY_E2E_TARBALLS="$tarballs" "$repo/node_modules/.bin/tsx" "$here/errand/drive.ts" "$here/errand" "$bin/amy" "$report" $keep
