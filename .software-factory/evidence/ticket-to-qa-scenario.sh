#!/bin/sh
# The `ticket-to-qa` gate's scenario, as a repeatable run.
#
# Usage: ticket-to-qa-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then drives it through one ticket from
# the working status to a QA handoff with `amy discover` and `amy tick`, the
# way an operator would. What it is driven against is a world of stand-ins:
# a tracker that speaks GraphQL over a socket, a `gh` and a `claude` on the
# PATH, real git repositories and a real shell gate.
#
# Nothing here needs a credential and nothing here reaches the internet,
# which is what makes it a proof anybody can repeat rather than a story about
# one afternoon. `--keep` leaves the world on disk to be poked at.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/ticket-to-qa-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/ticket-to-qa-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

bin=$(mktemp -d)
pids="$bin/trackers.pid"

# The stand-in tracker is a child of the driver, and a driver killed between
# its start and its `finally` would leave one listening. So every pid it
# starts is written down and this ends them, whatever happened.
cleanup() {
  if [ -f "$pids" ]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null || true
    done < "$pids"
  fi
  rm -rf "$bin"
}
trap cleanup EXIT INT TERM

"$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

AMY_E2E_PIDFILE="$pids" node "$here/ticket-to-qa/drive.mjs" "$here/ticket-to-qa" "$bin/amy" "$report" $keep
