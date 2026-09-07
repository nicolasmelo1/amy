#!/bin/sh
# Sets this checkout up to be worked in, on a machine that has never seen it.
#
# Usage: ./scripts/setup-dev.sh
#
# Separate from `install.sh`, which installs amy for *using*. This one is
# about contributing: the dependencies, the toolchain the gate needs, and the
# hooks that run it before a commit leaves the machine.
#
# Safe to run again. Every step here is idempotent, and re-running it is the
# fastest way to find out what a machine is missing.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"

# The version of `sf` this repository locked. Read rather than written down,
# because a second copy of a version number is the thing that goes stale —
# see scripts/check-toolchain.mjs, which fails the gate when one does.
sf_version=$(node -e "process.stdout.write(require('./.software-factory/catalog.lock.json').sf_version)")

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
missing=""

say "1/5  Node"
node_major=$(node -p 'process.versions.node.split(".")[0]')
echo "node $(node -v), npm $(npm -v)"
# CI runs 24. Older majors do run the tests today, so this warns rather than
# stops: being told is useful, being blocked on your own laptop is not.
if [ "$node_major" -lt 24 ]; then
  echo "  note: CI runs node 24, and this is $(node -v). Expect the gate to agree anyway,"
  echo "        but a version-specific failure here will not reproduce there."
fi

say "2/5  Dependencies"
npm ci

say "3/5  sf $sf_version — the tool that turns this repository's rules into checks"
# `sf` is not optional: `npm run gate` ends in `sf check` and `sf verify`, and
# without it the half of the gate that holds the architecture does not run.
have_sf=$(command -v sf >/dev/null 2>&1 && sf --version 2>/dev/null | awk '{print $2}' || echo "")

if [ "$have_sf" = "$sf_version" ]; then
  echo "sf $sf_version already installed"
elif ! command -v cargo >/dev/null 2>&1; then
  echo "  cargo is not on this machine, and sf is built from source."
  echo "  Install rust (https://rustup.rs), then run this script again."
  missing="$missing sf"
else
  [ -n "$have_sf" ] && echo "replacing sf $have_sf with the locked $sf_version"
  cargo install --git https://github.com/nicolasmelo1/software-factory \
    --tag "v$sf_version" --locked --force
fi

say "4/5  bun — only the end-to-end scenarios need it"
# `npm run e2e` drives the single executable, and `bun build --compile` is
# what makes one. The gate does not need it, so a machine without bun is
# still a machine you can contribute from.
if command -v bun >/dev/null 2>&1; then
  echo "bun $(bun --version)"
else
  echo "  no bun, so \`npm run e2e\` will not run here. \`npm run gate\` will."
  echo "  https://bun.sh if you want the scenarios too."
fi

say "5/5  Git hooks"
# Committed in .githooks and enabled per clone, because git will not enable a
# hook from a checkout on its own — which is a security property, not an
# oversight, and the reason this needs a step at all.
git config core.hooksPath .githooks
echo "core.hooksPath = .githooks"
echo "  pre-commit: the fast half of the gate, ten to fifteen seconds"
echo "  pre-push:   the whole gate, which is what CI runs"
echo "  --no-verify skips either one when you know why"

say "Building, so the first gate run is not also the first build"
npm run build

if [ -n "$missing" ]; then
  say "Set up, except:$missing"
  echo "Install what is listed above and run this script again."
  exit 1
fi

say "Ready"
cat <<'MSG'
  npm test          the unit tests, about a second
  npm run gate      what CI runs, minus the scenarios
  npm run e2e       the seven scenarios, a few minutes

CONTRIBUTING.md is the five minutes worth reading before the first change.
MSG
