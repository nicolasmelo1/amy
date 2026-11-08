#!/bin/sh
# The `a-brief-is-groomed-through-amy` gate's scenario, as a repeatable run.
#
# Usage: a-brief-is-groomed-through-amy-scenario.sh [report-path]
#
# Installs amy, points it at a project whose brief/ phase declares four
# sections and a check, and replays, through the installed executable, the
# session a separate agent recorded running the shipped amy-groom skill.
#
# The sections asked are the workflow's, every answer goes through the brief
# port, and the check refuses by section and rule until the groomed brief is green.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/a-brief-is-groomed-through-amy-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/home" "$work/global"
npm_real=$(command -v npm)

# Amy is installed alone; the plugins its config names arrive through
# `amy init --install`, into its own root.
AMY_PACKAGES="@amykit/cli" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# The project is copied out and compiled as somebody's own would be, so the
# installed machine has no path back into this checkout.
"$repo/node_modules/.bin/tsx" "$here/lib/publish.ts" "$here/a-brief-is-groomed-through-amy/project" "$work/project"

# npm answers the @amykit names from the tarballs the command install made,
# with this checkout's core swapped in after it writes the root — the same
# stand-in the installed-plugins scenario uses, for the same reason.
cat > "$work/bin/npm" <<STANDIN
#!/bin/sh
set -eu
args=""
for arg in "\$@"; do
  case "\$arg" in
    @amykit/*)
      stem=\$(printf '%s' "\${arg#@amykit/}" | tr '/' '-')
      args="\$args '$work/lib/packages/amykit-\$stem-'*'.tgz'"
      ;;
    *) args="\$args '\$arg'" ;;
  esac
done
prefix=""
previous=""
for arg in "\$@"; do
  if [ "\$previous" = "--prefix" ]; then prefix="\$arg"; fi
  previous="\$arg"
done
status=0
eval "'$npm_real' \$args" || status=\$?
core="\$prefix/node_modules/@amykit/core"
if [ "\$status" = 0 ] && [ -n "\$prefix" ] && [ -d "\$core" ]; then
  rm -rf "\$core" && mkdir -p "\$core"
  tar xzf $work/lib/packages/amykit-core-*.tgz -C "\$core" --strip-components=1
fi
exit "\$status"
STANDIN
chmod +x "$work/bin/npm"
export PATH="$work/bin:$PATH"
export NPM_CONFIG_PREFIX="$work/global"
export HOME="$work/home"
cd "$work/home"
mkdir -p .amy

cat > .amy/config.yaml <<YAML
workflows:
  invoices:
    workflow: "$work/project/brief"
    plugins:
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-file-brief-store"
      - "$work/project/brief"
      - "@amykit/plugin-serial-engine"
      - "@amykit/plugin-notify-fanout"
      - "@amykit/plugin-notify-inbox"
defaultWorkflow: invoices
notify:
  tracker: false
  inbox: true
YAML

"$amy" init --install >/dev/null 2>&1 || true

# The project's phases import the core the machine installed, as a project
# beside an install resolves it.
mkdir -p "$work/project/node_modules/@amykit"
ln -s "$work/home/.amy/plugins/node_modules/@amykit/core" "$work/project/node_modules/@amykit/core"

"$repo/node_modules/.bin/tsx" "$here/a-brief-is-groomed-through-amy/drive.ts" \
  "$amy" "$here/a-brief-is-groomed-through-amy/transcript.json" "$report"
