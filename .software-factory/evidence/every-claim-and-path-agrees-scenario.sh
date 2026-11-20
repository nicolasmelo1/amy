#!/bin/sh
# The `every-claim-and-path-agrees` gate's scenario, as a repeatable run.
#
# Usage: every-claim-and-path-agrees-scenario.sh [report-path]
#
# Builds the tree, then drives the claims off the built modules in processes
# of their own: two starters recovering one stale update claim, a live claim
# nobody takes, `amy stop` on Windows writing where its launcher reads, a long
# Slack post split in order, a blank workspace root refused at boot, the
# doctor and the manager naming one checkout, a tree's meta read while another
# process writes it, and a child record speaking in its unit's thread.
#
# No network and no credential. A harness, not the actor: who invokes it is
# what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/every-claim-and-path-agrees-run.json"}
case "$report" in
  /*) ;;
  *) report="$PWD/$report" ;;
esac

work=$(mktemp -d)
cleanup() {
  if [ -z "${EVERY_CLAIM_KEEP_WORK:-}" ]; then rm -rf "$work"; else echo "work kept at $work" >&2; fi
}
trap cleanup EXIT

# The claims are about what the built tree does, so the build is part of the
# scenario rather than an assumption about the caller.
(cd "$repo" && npm run build >/dev/null)

"$repo/node_modules/.bin/tsx" "$here/every-claim-and-path-agrees/drive.ts" "$work" "$report"