# The `amy-update` gate's scenario, as a repeatable run.
#
# Usage: amy-update-scenario.sh [report-path]
#
# Builds a scratch machine two versions behind: the CLI alone, then a
# third-party workflow installed at v1 through the stand-in registry, one
# move driven, the workflow updated to v2, another move driven — and asserts
# the version that moved and the record that did not. A v3 that exports no
# `plugin` proves the rollback, and the CLI's own update rewrites its skills
# into the harnesses they were written into before.
#
# No network, no credential: the stand-in npm answers every third-party name
# from tarballs this scenario packed, and the plugins root carries the same
# `overrides` the installer writes, so a workflow's own dependencies resolve
# from the machine's tarballs rather than from a registry.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/amy-update-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
if [ -z "${AMY_UPDATE_KEEP_WORK:-}" ]; then
  trap 'rm -rf "$work"' EXIT
else
  echo "work kept at $work" >&2
fi
mkdir -p "$work/bin" "$work/home" "$work/global"
npm_real=$(command -v npm)

# Amy is installed alone, the way the machine this scenario simulates was.
# The tarballs it leaves behind are the machine's own: the plugins root's
# overrides point at them, which is what lets a workflow's dependencies
# resolve without a registry.
AMY_PACKAGES="@amykit/cli" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }
# The bootstrap dependency is a local tarball, but the installed CLI declares
# its registry intent so `amy update` can move itself after publication.
if node -e 'const m=require(process.argv[1]); process.exit(m.amyUpdateRanges?.["@amykit/cli"] === "latest" ? 0 : 1)' "$work/lib/package.json"; then
  install_registry_intent=0
else
  install_registry_intent=1
fi

# The stand-in registry: three versions of one workflow, packed as tarballs.
registry="$work/registry"
write_workflow() {
  # write_workflow <directory> <version>
  mkdir -p "$1"
  cat > "$1/package.json" <<JSON
{"name":"@acme/workflow-oncall","version":"$2","type":"module","main":"./index.js"}
JSON
  cat > "$1/index.js" <<JS
import { appendFileSync } from "node:fs";
const workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesActions: [],
  usesObservers: [],
  plan: (record) =>
    record.state === "paged"
      ? (appendFileSync(process.env.HOME + "/.amy/lifecycle.log", "workflow\n"), { kind: "advance", to: "acknowledged", effects: [], why: "the page was picked up at $2" })
      : { kind: "settled", why: "the page was handled" },
};

export const plugin = {
  name: "@acme/workflow-oncall",
  version: "$2",
  register(registry, ctx) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", "oncall", {
      policy: {},
      found: async () => {
        const fs = await import("node:fs");
        const pages = ctx.paths.state + "/pages";
        return fs.existsSync(pages) ? fs.readdirSync(pages).map((f) => f.replace(/\.md$/, "")) : [];
      },
      newRecord: (id, now) => ({ id, state: "paged", updatedAt: now.toISOString(), attempts: {}, history: [] }),
      observe: async () => ({}),
      handlers: () => ({}),
      apply: (record) => record,
    });
  },
};
JS
}

# v1 and v2 are real, mountable versions. v3 exports no plugin: a version
# that will not mount, which the machine must roll back off.
write_workflow "$registry/1.0.0" "1.0.0"
write_workflow "$registry/1.1.0" "1.1.0"
mkdir -p "$registry/1.2.0"
printf '{"name":"@acme/workflow-oncall","version":"1.2.0","type":"module","main":"./index.js"}\n' > "$registry/1.2.0/package.json"
printf 'export const noPluginHere = true;\n' > "$registry/1.2.0/index.js"

for version in 1.0.0 1.1.0 1.2.0; do
  "$npm_real" pack "$registry/$version" --pack-destination "$registry" >/dev/null 2>&1
done
# What the registry currently publishes for the range; rewritten between
# updates below, the way a real registry gains a version.
printf '1.0.0' > "$work/registry-answer"

# The registry's own newer CLI: the machine's CLI tarball, restamped at
# 999.0.0 with a marker written into its skill, so the self-update section
# proves the move replaced the binary and the skills follow the version.
# Its dependencies resolve from the machine's own tree, which is what the
# first install left there — the same ranges, already on disk.
cli_registry="$work/cli-registry"
mkdir -p "$cli_registry/contents"
tar xzf "$work/lib/packages/amykit-cli-0.4.0.tgz" -C "$cli_registry/contents"
node - "$cli_registry/contents/package" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
manifest.version = "999.0.0";
fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const skill = path.join(root, "skills", "amy", "SKILL.md");
fs.writeFileSync(skill, fs.readFileSync(skill, "utf-8").replace("version: 1.0.0", "version: 999.0.0\nprovenance: replacement-cli-probe"));
fs.writeFileSync(
  path.join(root, "dist", "stamp.json"),
  `${JSON.stringify({ version: "999.0.0", commit: "scenario", builtAt: "2026-09-24T00:00:00.000Z" })}\n`,
);
NODE
tar czf "$cli_registry/amykit-cli-999.0.0.tgz" -C "$cli_registry/contents" package

# amy keeps its state in one place per machine, so this run gets its own.
export HOME="$work/home"
cd "$work/home"

# The stand-in: a `view` for one package answers from the tarball's own
# manifest, and an `install` of the workflow's name maps every range onto
# the tarball that version holds. Everything else is real npm, and every
# `@amykit/*` resolves from the machine's tarballs the way the installer's
# own overrides do.
cat > "$work/bin/npm" <<SH
#!/bin/sh
set -eu
printf '%s\\n' "\$*" >> "$work/npm.log"
viewing=""
prev=""
for arg in "\$@"; do
  if [ "\$prev" = "view" ]; then viewing=\$arg; fi
  prev=\$arg
done
case "\$viewing" in
  "@amykit/cli"*)
    # The registry publishes a NEWER CLI than the one installed, so the
    # machine's self-update actually moves it: the replacement binary, not
    # the running one, answers the version and rewrites the skills.
    printf '"999.0.0"'
    exit 0
    ;;
  "@acme/workflow-oncall"*)
    printf 'update\n' >> "$HOME/.amy/lifecycle.log"
    # The registry publishes one answer for the range; the scenario rewrites
    # it between updates, the way a real registry gains a version.
    printf '"%s"' "\$(cat "$work/registry-answer")"
    exit 0
    ;;
esac
args=""
for arg in "\$@"; do
  case "\$arg" in
    @amykit/cli@*)
      # The version the install asks for decides the CLI tarball: 999.0.0
      # is the registry's newer CLI, anything else is the machine's own.
      wanted=\${arg#@amykit/cli@}
      if [ "\$wanted" = "999.0.0" ]; then
        args="\$args '$cli_registry/amykit-cli-999.0.0.tgz'"
      else
        args="\$args '$work/lib/packages/amykit-cli-'*'.tgz'"
      fi
      ;;
    @amykit/*)
      stem=\$(printf '%s' "\${arg#@amykit/}" | tr '/' '-')
      args="\$args '$work/lib/packages/amykit-\$stem-'*'.tgz'"
      ;;
    @acme/workflow-oncall@*)
      # The version the install asks for decides the tarball, the way
      # name@version decides it on a real one.
      wanted=\${arg#@acme/workflow-oncall@}
      args="\$args '$registry/acme-workflow-oncall-'\$wanted'.tgz'"
      ;;
    *)
      args="\$args '\$arg'"
      ;;
  esac
done
# The artifact paths are made by this scenario, without spaces; eval expands
# the tarball path only after the version above has become that path.
eval "exec '$npm_real' \$args"
SH
chmod +x "$work/bin/npm"
export PATH="$work/bin:$PATH"
export NPM_CONFIG_PREFIX="$work/global"

assertions=""
record() {
  status=failed
  if [ "$2" = "0" ]; then status=passed; fi
  assertions="$assertions{\"type\":\"$1\",\"status\":\"$status\"},"
  if [ "$status" = "failed" ]; then echo "FAILED $1" >&2; fi
}

says() {
  # says <name> <haystack> <needle>
  case "$2" in *"$3"*) record "$1" 0 ;; *) record "$1" 1 ;; esac
}

# The install records a registry intent even though the dependency itself is a
# local tarball, so self-update is not silently pinned forever.
record update.the_installed_cli_keeps_a_registry_intent "$install_registry_intent"

# 1. The machine two versions behind: the workflow at v1, one move driven.
# The first install is by path — the form `amy add` takes — and what it
# pins in the manifest is re-declared below as the range it came from, the
# way an operator publishes the version they want.
added=$("$amy" add "$registry/1.0.0" 2>&1 || echo "")
says update.added_the_first_version "$added" "added @acme/workflow-oncall as the workflow \`oncall\`"
node -e '
  const fs = require("fs");
  const file = process.env.HOME + "/.amy/plugins/package.json";
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.dependencies["@acme/workflow-oncall"] = "^1.0.0";
  manifest.overrides = { ...(manifest.overrides ?? {}) };
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
'
mkdir -p .amy/pages
echo "the disk filled up on node 3" > .amy/pages/PAGE-1.md
discovered=$("$amy" --workflow oncall discover 2>&1 || echo "")
says update.v1_finds_the_page "$discovered" "queued PAGE-1"
# The config names no schedule at all.  Make this invocation its twentieth,
# then read the stand-in's update call before the workflow's own durable log.
mkdir -p .amy/workflows/oncall
printf '{"runs": 19}\n' > .amy/workflows/oncall/auto-update.json
: > "$work/npm.log"
rm -f .amy/lifecycle.log
first=$("$amy" --workflow oncall tick 2>&1 || echo "")
says update.v1_moves_the_page "$first" "the page was picked up at 1.0.0"
if [ "$(cat .amy/lifecycle.log)" = "update
workflow" ]; then
  record update.default_auto_update_runs_before_a_workflow 0
else
  record update.default_auto_update_runs_before_a_workflow 1
fi
record_before=$(cat .amy/oncall/records/PAGE-1.json)

# The rest of the schedule modes use the same installed command and workflow.
# A one-run after schedule proves ordering; a two-run schedule proves cadence
# persists in the profile state rather than in this process.
node -e 'const fs=require("fs");const f=process.env.HOME+"/.amy/config.yaml";const n=String.fromCharCode(10);const block="autoUpdate:"+n+"  enabled: true"+n+"  timing: after"+n+"  everyRuns: 1";const text=fs.readFileSync(f,"utf8");fs.writeFileSync(f,/autoUpdate:[^]*?everyRuns: [0-9]+/.test(text)?text.replace(/autoUpdate:[^]*?everyRuns: [0-9]+/,block):text+n+block+n);'
: > "$work/npm.log"
rm -f .amy/lifecycle.log
rm -f .amy/pages/PAGE-1.md
rm -rf .amy/oncall/queue
mkdir -p .amy/oncall/queue
echo "the disk filled up on node 5" > .amy/pages/PAGE-3.md
"$amy" --workflow oncall discover >/dev/null
"$amy" --workflow oncall tick >/dev/null 2>&1 || true
if [ "$(cat .amy/lifecycle.log 2>/dev/null || true)" = "workflow
update" ]; then
  record update.auto_update_can_run_after_a_workflow 0
else
  record update.auto_update_can_run_after_a_workflow 1
fi
node -e 'const fs=require("fs");const f=process.env.HOME+"/.amy/config.yaml";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/everyRuns: 1/,"everyRuns: 2"));'
printf '{"runs": 0}\n' > .amy/workflows/oncall/auto-update.json
: > "$work/npm.log"
"$amy" --workflow oncall run --max 1 >/dev/null 2>&1 || true
first_cadence=$(wc -l < "$work/npm.log" | tr -d ' ')
"$amy" --workflow oncall run --max 1 >/dev/null 2>&1 || true
second_cadence=$(wc -l < "$work/npm.log" | tr -d ' ')
if [ "$first_cadence" = "0" ] && [ "$second_cadence" -gt "0" ]; then record update.auto_update_respects_its_cadence 0; else record update.auto_update_respects_its_cadence 1; fi
node -e 'const fs=require("fs");const f=process.env.HOME+"/.amy/config.yaml";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("enabled: true","enabled: false"));'
: > "$work/npm.log"
"$amy" --workflow oncall run --max 1 >/dev/null 2>&1 || true
if [ ! -s "$work/npm.log" ]; then record update.auto_update_can_be_disabled 0; else record update.auto_update_can_be_disabled 1; fi
node -e 'const fs=require("fs");const f=process.env.HOME+"/.amy/config.yaml";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("enabled: false","enabled: true").replace("timing: after","timing: during").replace("everyRuns: 2","everyRuns: 0"));'
: > "$work/npm.log"
invalid=$("$amy" --workflow oncall tick 2>&1 || echo "")
if [ ! -s "$work/npm.log" ]; then says update.invalid_auto_update_settings_refuse_before_work "$invalid" '`autoUpdate.timing` must be `before` or `after`'; else record update.invalid_auto_update_settings_refuse_before_work 1; fi
node -e 'const fs=require("fs");const f=process.env.HOME+"/.amy/config.yaml";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("timing: during","timing: after").replace("everyRuns: 0","everyRuns: 1"));'

# A started daemon has a detached reaper. It owns the marker after SIGTERM,
# and invokes update only after the loop exits; direct `daemon` documents that
# it is intentionally unscheduled rather than silently doing something else.
rm -f .amy/lifecycle.log
: > "$work/npm.log"
started=$("$amy" --workflow oncall start --every 1 2>&1 || echo "")
sleep 1
if case "$started" in *"started oncall: pid"*) false ;; *) true ;; esac || grep -q '^update$' .amy/lifecycle.log 2>/dev/null; then
  record update.a_daemon_updates_only_at_its_lifecycle_boundary 1
else
  "$amy" stop >/dev/null 2>&1 || true
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    grep -q '^update$' .amy/lifecycle.log 2>/dev/null && break
    sleep 1
  done
  if grep -q '^update$' .amy/lifecycle.log 2>/dev/null && ! test -f .amy/daemon.pid; then
    record update.a_daemon_updates_only_at_its_lifecycle_boundary 0
  else
    record update.a_daemon_updates_only_at_its_lifecycle_boundary 1
  fi
fi
# A directly-driven daemon owns the same schedule. It has no daemon record, so
# after timing runs only once its foreground loop has returned.
rm -f .amy/lifecycle.log
: > "$work/npm.log"
"$amy" --workflow oncall daemon --every 1 > "$work/direct-daemon.log" 2>&1 &
direct=$!
sleep 1
kill -TERM "$direct"
wait "$direct" || true
if grep -q '^update$' .amy/lifecycle.log 2>/dev/null; then
  record update.direct_daemon_uses_the_configured_schedule 0
else
  record update.direct_daemon_uses_the_configured_schedule 1
fi

# 2. `--check` names what would move, and moves nothing. The registry has
# gained 1.1.0, which the range the machine holds now points at.
printf '1.1.0' > "$work/registry-answer"
check=$("$amy" update --check 2>&1 || echo "")
says update.a_check_names_what_would_move "$check" "@acme/workflow-oncall  1.0.0 -> 1.1.0"
if grep -q '"version":"1.0.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.a_check_changes_nothing 0
else
  record update.a_check_changes_nothing 1
fi

# 3. The update moves the version and keeps records, queue and log.
updated=$("$amy" update 2>&1 || echo "")
says update.the_version_moved "$updated" "updated @acme/workflow-oncall"
says update.the_update_reports_the_move "$updated" "1.0.0 -> 1.1.0"
if grep -q '"version":"1.1.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.the_copy_on_disk_moved 0
else
  record update.the_copy_on_disk_moved 1
fi
if [ "$record_before" = "$(cat .amy/oncall/records/PAGE-1.json)" ]; then
  record update.the_state_survives_the_version 0
else
  record update.the_state_survives_the_version 1
fi
if grep -q '"@acme/workflow-oncall": "\^1' .amy/plugins/package.json; then
  record update.the_manifest_keeps_the_range 0
else
  record update.the_manifest_keeps_the_range 1
fi

# 4. The new version drives the work it finds, with its own reason. The
# page PAGE-1 came from is removed first — one tick moves one item, and the
# record is what the state assertion reads, not the file.
rm -f .amy/pages/PAGE-1.md
echo "the disk filled up on node 4" > .amy/pages/PAGE-2.md
discover_two=$("$amy" --workflow oncall discover 2>&1 || echo "")
run_two=$("$amy" --workflow oncall run 2>&1 || echo "")
says update.the_new_version_drives_the_work "$run_two" "the page was picked up at 1.1.0"

# 5. The machine boots after every move, or the move is not called done: an
# update that leaves a config which cannot boot has not worked. The registry
# has gained a 1.2.0 that exports no `plugin`, so the update that reaches it
# rolls back to the version that did mount.
printf '1.2.0' > "$work/registry-answer"
bad=$("$amy" update 2>&1 || echo "")
says update.the_rollback_names_the_reason "$bad" "does not import"
if grep -q '"version":"1.1.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.a_bad_version_is_rolled_back 0
else
  record update.a_bad_version_is_rolled_back 1
fi
still=$("$amy" --workflow oncall status --all 2>&1 || echo "")
says update.the_machine_boots_after_the_update "$still" "PAGE-1"

# 6. Every configured profile is mounted before the update is called done.
# A second profile naming a package that is not installed is the machine
# the check exists for: the update refuses with the boot's own refusal,
# rather than leaving a config that finds out from the daemon.
printf '1.1.0' > "$work/registry-answer"
node -e '
  const fs = require("fs");
  const file = process.env.HOME + "/.amy/config.yaml";
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const kept = [];
  for (const line of lines) {
    kept.push(line);
    if (line.trim() === "workflows:") {
      kept.push("  afterhours:");
      kept.push("    workflow: \"@acme/workflow-afterhours\"");
    }
  }
  fs.writeFileSync(file, kept.join("\n"));
' 
broken=$("$amy" update 2>&1 || echo "")
case "$broken" in
  *"does not boot"*"afterhours: @acme/workflow-afterhours: not installed"*)
    record update.a_config_that_stops_booting_fails_the_update 0 ;;
  *) record update.a_config_that_stops_booting_fails_the_update 1 ;;
esac
# The move that landed is rolled back with the refusal, and the machine is
# left on the version that did boot.
if grep -q '"version":"1.1.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.the_boot_refusal_rolls_the_move_back 0
else
  record update.the_boot_refusal_rolls_the_move_back 1
fi
# The broken profile goes, and the machine is whole again for the rest.
node -e '
  const fs = require("fs");
  const file = process.env.HOME + "/.amy/config.yaml";
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const kept = [];
  let inAfterhours = false;
  for (const line of lines) {
    if (line.includes("afterhours:")) { inAfterhours = true; continue; }
    if (inAfterhours && (line.startsWith("    ") || line.trim() === "")) continue;
    inAfterhours = false;
    kept.push(line);
  }
  fs.writeFileSync(file, kept.join("\n"));
' 

# 7. The update refuses while the loop is running, naming the pid.
printf '{"pid": %s, "workflow": "oncall", "startedAt": "2026-01-01T00:00:00.000Z"}\n' "$$" > .amy/daemon.pid
refused=$("$amy" update 2>&1 || echo "")
rm .amy/daemon.pid
says update.an_update_refuses_while_the_loop_runs "$refused" "the loop is running as pid $$"

# 8. Updating the CLI rewrites its skills into the harnesses it wrote to
# before — and never into one it did not. The machine's own HOME carries a
# claude harness and a hermes one; only the first is ever written into,
# which is what the record, not the install list, decides.
mkdir -p "$HOME/.claude" "$HOME/.hermes"
"$amy" skills --harness claude >/dev/null 2>&1 || true
recorded=$(cat "$HOME/.amy/skills-written.json" 2>/dev/null || echo "absent")
case "$recorded" in *"claude"*) record update.skills_writes_are_recorded 0 ;; *) record update.skills_writes_are_recorded 1 ;; esac

# A harness never written to is not written to now, and the one that was
# gets the CLI's own skills, not a guess from what is installed.
"$amy" skills --recorded >/dev/null 2>&1 || true
if [ -f "$HOME/.claude/skills/amy/SKILL.md" ]; then
  record update.the_skills_follow_the_version 0
else
  record update.the_skills_follow_the_version 1
fi
if [ -d "$HOME/.hermes/skills" ]; then
  record update.a_harness_never_written_to_is_not_written_to_now 1
else
  record update.a_harness_never_written_to_is_not_written_to_now 0
fi

# 9. The CLI moves itself, the same way it moves a workflow. The registry
# publishes a 999.0.0 the machine's manifest range now points at, so every
# update moves the install root's copy alongside the workflow's: the NEW
# binary answers for itself, and the skills it rewrites are its own, not
# the old CLI's. The version before is what the install put there.
cli_version_after=$(node -p "require('$work/lib/node_modules/@amykit/cli/package.json').version")
if [ "$cli_version_after" = "999.0.0" ]; then
  record update.the_cli_moves_itself 0
else
  record update.the_cli_moves_itself 1
fi
if node "$work/lib/node_modules/@amykit/cli/dist/index.js" --version 2>/dev/null | grep -q "999.0.0"; then
  record update.a_moved_cli_still_runs 0
else
  record update.a_moved_cli_still_runs 1
fi
if grep -q "provenance: replacement-cli-probe" "$HOME/.claude/skills/amy/SKILL.md" 2>/dev/null; then
  record update.a_moved_cli_rewrites_its_own_skills 0
else
  record update.a_moved_cli_rewrites_its_own_skills 1
fi

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "amy-update",
  "status": "$status",
  "goal": "I want a machine two versions behind to run one command, end up on the current one with its work untouched, and the skills in its harnesses to describe the CLI that is now installed.",
  "artifact": { "package": "@amykit/cli", "entry": "the installed amy command, run by node", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "workflow_updated": "@acme/workflow-oncall",
    "moved_from": "1.0.0",
    "moved_to": "1.1.0"
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"