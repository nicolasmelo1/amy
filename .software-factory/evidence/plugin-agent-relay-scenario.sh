#!/bin/sh
# The `plugin-agent-relay` gate's scenario, as a repeatable run.
#
# Usage: plugin-agent-relay-scenario.sh [report-path]
#
# Mounts the *built* claude, codex, hermes and relay plugins in a separate process,
# with fake `claude` and `codex` executables on the PATH, and drives the
# `agent` port that comes out. So the policy is proved through the real
# artifacts: the real argv, the real envelope parsing, the real mount, and the
# real relay.
#
# The fakes are the only pretend part, and they have to be: proving that a
# quota moves to another harness means producing a quota, and no credential
# can be asked to do that on demand.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/plugin-agent-relay-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
here=$(cd "$(dirname "$0")" && pwd)

for pkg in plugins/agent-relay plugins/claude plugins/codex plugins/hermes-agent packages/core packages/agent-kit packages/workflow-ticket-to-qa; do
  test -f "$repo/$pkg/dist/index.js" ||
    { echo "build it first: npm run build ($pkg)" >&2; exit 1; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/checkouts/widgets"

# A claude that behaves as AMY_E2E_CLAUDE says, per model. Every invocation is
# appended to a log so the scenario can assert who was *not* called, which is
# half of what the policy promises.
cat > "$work/bin/claude" <<'FAKE'
#!/bin/sh
prompt=$(cat)
model=""
while [ $# -gt 0 ]; do
  case $1 in --model) model=$2; shift 2 ;; *) shift ;; esac
done
# A skill is invoked by naming it on the first line, so that is where the
# fake reads it from. Absent, the line reads exactly as it did before.
skill=$(printf '%s' "$prompt" | head -1 | sed -n 's|^/\([A-Za-z0-9_-][A-Za-z0-9_-]*\).*|\1|p')
if [ -n "$skill" ]; then
  echo "claude:$model:$skill" >> "$AMY_E2E_CALLS"
else
  echo "claude:$model" >> "$AMY_E2E_CALLS"
fi

# The prompt itself is recorded, because a prompt is a claim amy makes about
# what the agent was told, and the body-in-the-prompt assertions read it back.
printf '%s' "$prompt" > "$(dirname "$AMY_E2E_CALLS")/last-prompt.txt"

# The real CLI reports the model that actually ran, under a full id with a
# window suffix, not the short alias that was asked for. The fake has to do
# the same or the scenario would be proving something easier than the truth.
envelope() {
  printf '{"type":"result","subtype":"%s","is_error":%s,"api_error_status":%s,"result":"{\\"clear\\": true}","duration_ms":10,"total_cost_usd":0.01,"usage":{"input_tokens":2,"output_tokens":4,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"modelUsage":{"claude-%s-4-5[1m]":{"costUSD":0.01}}}\n' "$1" "$2" "$3" "$model"
}

case "$AMY_E2E_CLAUDE" in
  throttled)
    # A 429 in the envelope, which is the only place a quota is stated.
    envelope error_during_execution true 429
    exit 1
    ;;
  weak-model-fails)
    if [ "$model" = "sonnet" ]; then
      envelope error_during_execution true null
      exit 1
    fi
    envelope success false null
    ;;
  first-skill-fails)
    if [ "$skill" = "first-skill" ]; then
      envelope error_during_execution true null
      exit 1
    fi
    envelope success false null
    ;;
  *)
    envelope success false null
    ;;
esac
FAKE

cat > "$work/bin/codex" <<'FAKE'
#!/bin/sh
cat > /dev/null
model=""
while [ $# -gt 0 ]; do
  case $1 in --model) model=$2; shift 2 ;; *) shift ;; esac
done
echo "codex:$model" >> "$AMY_E2E_CALLS"
printf '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"clear\\": true}"}}\n'
printf '{"type":"turn.completed","usage":{"input_tokens":17571,"cached_input_tokens":11008,"cache_write_input_tokens":0,"output_tokens":5}}\n'
FAKE

chmod +x "$work/bin/claude" "$work/bin/codex"

PATH="$work/bin:$PATH" "$repo/node_modules/.bin/tsx" "$here/plugin-agent-relay/probe.ts" "$work" "$repo" "$report"
