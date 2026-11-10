#!/bin/sh
# The `a-workspace-is-a-capability` gate's scenario, as a repeatable run.
#
# Usage: a-workspace-is-a-capability-scenario.sh [report-path] [--keep]
#
# Two halves. The first installs the executable and drives a workflow that
# touches no code — a support inbox, added from a path — on an install whose
# config names none of repos, workspaceRoot, checkouts, defaultBranch,
# baseBranch, gate and worktrees and mounts no workspace: from `amy setup` to
# an answer sent after the operator approved it in a Telegram topic. The
# stand-ins are a `claude` on the PATH and Telegram's Bot API on the loopback.
#
# The second runs the ticket-to-qa, errand and note-to-plan scenarios as they
# stand, keeps each world, and reads where each one's workspace was said: in
# the file-worktree plugin's slice, not at the top of the machine's config.
#
# Nothing here needs a credential and nothing here reaches the internet.
# A harness, not the actor: who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/a-workspace-is-a-capability-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/a-workspace-is-a-capability-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

root=$(mktemp -d)
pids="$root/stand-ins.pid"
cleanup() {
  trap - EXIT INT TERM
  if [ -f "$pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$pids"
  fi
  if [ -z "$keep" ]; then rm -rf "$root"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$root/bin"
AMY_INSTALL_LIB="$root/lib/amy" "$repo/scripts/install.sh" "$root/bin" >/dev/null
test -x "$root/bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

# The workflow is copied out and compiled the way npm would ship it, so the
# installed machine has no path back into this checkout.
tsx="$repo/node_modules/.bin/tsx"
"$tsx" "$here/lib/publish.ts" "$here/a-workspace-is-a-capability/workflow-support-inbox" "$root/workflow-support-inbox"

AMY_E2E_PIDFILE="$pids" AMY_E2E_TARBALLS="$root/lib/amy/packages" \
  "$tsx" "$here/a-workspace-is-a-capability/drive.ts" "$repo" "$root" "$report" $keep
