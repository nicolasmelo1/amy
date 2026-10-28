#!/bin/sh
# The `ui-frame` gate's scenario, as a repeatable run.
#
# Usage: ui-frame-scenario.sh [report-path]
#
# Packs @amykit/ui, @amykit/ui-conformance and the stub renderers, installs them onto a directory that
# has nothing else, and drives the installed `amy-ui-conformance` from another
# process: once against the stubs, which must pass, and against renderers
# broken one way each, which must fail naming what they broke. The broken
# ones are copied beside the install so they resolve the installed packages,
# never this checkout.
#
# Nothing here needs a credential. npm answers `yaml` from its cache when it
# can. A harness, not the actor — who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/ui-frame-run.json"}
case "$report" in
  /*) ;;
  *) report="$PWD/$report" ;;
esac

test -f "$repo/packages/ui-conformance/dist/cli.js" || { echo "build it first: npm run build" >&2; exit 1; }
test -f "$repo/plugins/ui-stub/dist/index.js" || { echo "build it first: npm run build" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

(cd "$repo/packages/ui" && npm pack --silent --pack-destination "$work" >/dev/null)
(cd "$repo/packages/ui-conformance" && npm pack --silent --pack-destination "$work" >/dev/null)
(cd "$repo/plugins/ui-stub" && npm pack --silent --pack-destination "$work" >/dev/null)
mkdir -p "$work/install"
(cd "$work/install" && echo '{ "name": "ui-frame-scenario", "private": true, "type": "module" }' > package.json \
  && npm install --silent --no-audit --no-fund --prefer-offline "$work"/amykit-ui-0*.tgz "$work"/amykit-ui-conformance-*.tgz "$work"/amykit-plugin-ui-stub-*.tgz >/dev/null)

# The four renderers L1.EVERY_RENDERER_HOLDS_THE_FRAME trips on, as a workspace
# of their own, and the ones this scenario adds for the other assertions.
mkdir -p "$work/install/broken"
cp -R "$repo/.software-factory/mutations/L1.EVERY_RENDERER_HOLDS_THE_FRAME/plugins" "$work/install/broken/plugins"
cp "$here/ui-frame/"*.ts "$work/install/"

"$repo/node_modules/.bin/tsx" "$here/ui-frame/drive.ts" "$work/install" "$report"
