#!/bin/sh
# Installs amy onto this machine, so the thing that runs is not this checkout.
#
# Usage: install.sh [target-directory]
#
# Two reasons this exists, and neither is convenience. Running from the
# checkout means the code under test is never the code that ships, and it
# means the machine's working directory is a repository that must never
# receive anything confidential from the work it does.
#
# What gets installed is packages, resolved by node at run time. Set
# AMY_PACKAGES to a space-separated list to install a subset — a machine with
# no `codex` on it has no use for the plugin that shells out to one.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
target=${1:-${AMY_INSTALL_DIR:-$HOME/.local/bin}}
# Where the packages land. Beside the bin directory by default, the way a
# prefix install lays itself out.
lib=${AMY_INSTALL_LIB:-"$(dirname "$target")/lib/amy"}

# The tarballs stay beside the install rather than in a temporary directory,
# because the overrides that hold this together point at them by path: an
# install whose sources were deleted cannot be added to, and the next
# `npm install` in it would go looking for @amy on a registry.
#
# Point AMY_TARBALLS at a directory of tarballs to reuse them, which is most
# of the time an install takes.
tarballs=${AMY_TARBALLS:-"$lib/packages"}
mkdir -p "$tarballs"

if [ -z "${AMY_TARBALLS:-}" ] || [ -z "$(ls -A "$tarballs" 2>/dev/null)" ]; then
  npm --prefix "$repo" run build >/dev/null
  rm -f "$tarballs"/*.tgz
  # `prepack` stamps the tarball with the version and commit, and refuses to
  # stamp a tree with uncommitted changes. An install from a dirty tree is
  # therefore unstamped, and says `dev`, which is the truth.
  (cd "$repo" && npm pack --workspaces --loglevel=error --pack-destination "$tarballs" >/dev/null)
fi

# Knip cannot see a call from a shell script, so `write-install-manifest.mjs`
# is ignored there rather than being unreferenced here.
# shellcheck disable=SC2086 # AMY_PACKAGES is a list on purpose.
node "$repo/scripts/write-install-manifest.mjs" "$tarballs" "$lib" ${AMY_PACKAGES:-} >/dev/null

rm -rf "$lib/node_modules" "$lib/package-lock.json"
# Run from inside the install rather than with `--prefix`: npm reads the
# working directory to decide it is in a workspace, and a workspace's own
# resolution ignores the overrides that make these tarballs resolvable.
(cd "$lib" && npm install --no-audit --no-fund --prefer-offline --loglevel=error >/dev/null)

mkdir -p "$target"
# Replaced rather than written over: overwriting the link while something is
# resolving through it is what produces a half-installed command.
tmp="$target/.amy.incoming"
ln -sf "$lib/node_modules/.bin/amy" "$tmp"
mv -f "$tmp" "$target/amy"

echo "installed $("$target/amy" --version) to $target/amy"

case ":$PATH:" in
  *":$target:"*) ;;
  *) echo "note: $target is not on your PATH, so \`amy\` will not resolve yet" >&2 ;;
esac
