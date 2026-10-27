#!/bin/sh
# The `a-question-is-not-an-answer` gate's scenario, as a repeatable run.
#
# Usage: a-question-is-not-an-answer-scenario.sh [report-path]
#
# Drives an escalated record through the built engine, workflow and Slack
# adapter while its owner discusses it in the work's thread: three questions
# answered there and no move, then a decision that resumes the work with the
# whole discussion in the prompt. Then the same under the default policy,
# where only a reply marked as a discussion is held back.
#
# Nothing here needs a credential or reaches the internet: Slack's Web API is
# answered in-process. A harness, not the actor — who invokes it is what the
# manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/a-question-is-not-an-answer-run.json"}
case "$report" in
  /*) ;;
  *) report="$PWD/$report" ;;
esac

for built in packages/core/dist/index.js plugins/slack/dist/index.js plugins/file-queue/dist/index.js \
  plugins/serial-engine/dist/index.js packages/workflow-ticket-to-qa/dist/index.js; do
  test -f "$repo/$built" || { echo "build it first: npm run build" >&2; exit 1; }
done

node "$here/a-question-is-not-an-answer/drive.mjs" "$repo" "$report"
