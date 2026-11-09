#!/bin/sh
# The `amy-answers-in-the-chat` gate's scenario, as a repeatable run.
#
# Usage: amy-answers-in-the-chat-scenario.sh [report-path] [--keep]
#
# Installs the executable and runs its loop as a supervisor would, driving
# ticket-to-qa with Telegram as its conversation, then talks to it in the
# operator's private chat: asks, actions, a harness switch, restarts and a
# broken mount. Stand-ins answer for Telegram and the agent; nothing reaches
# the internet and no credential is real.
#
# A harness, not the actor. Who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/amy-answers-in-the-chat-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/amy-answers-in-the-chat-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

for built in packages/core/dist/index.js plugins/telegram/dist/index.js examples/workflow-ticket-to-qa/dist/index.js; do
  test -f "$repo/$built" || { echo "build it first: npm run build" >&2; exit 1; }
done

root=$(mktemp -d)
bin="$root/bin"
mkdir -p "$bin"
pids="$root/stand-ins.pid"
cleanup() {
  trap - EXIT INT TERM
  if [ -f "$pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$pids"
  fi
  rm -rf "$root"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

AMY_INSTALL_LIB="$root/lib/amy" "$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

AMY_E2E_PIDFILE="$pids" AMY_E2E_TARBALLS="$root/lib/amy/packages" \
  "$repo/node_modules/.bin/tsx" "$here/amy-answers-in-the-chat/drive.ts" "$repo" "$bin/amy" "$report" $keep
