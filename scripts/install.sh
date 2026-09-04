#!/bin/sh
# Installs amy onto this machine, so the thing that runs is not this checkout.
#
# Usage: install.sh [target-directory]
#
# Two reasons this exists, and neither is convenience. Running from the
# checkout means the code under test is never the code that ships, and it
# means the machine's working directory is a repository that must never
# receive anything confidential from the work it does.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
target=${1:-${AMY_INSTALL_DIR:-$HOME/.local/bin}}

"$repo/scripts/build-binary.sh" "$repo/dist/amy"

mkdir -p "$target"
# Replaced rather than written over: overwriting a running binary is what
# produces a half-written executable on the next invocation.
tmp="$target/.amy.incoming"
cp "$repo/dist/amy" "$tmp"
chmod +x "$tmp"
mv -f "$tmp" "$target/amy"

echo "installed $("$target/amy" --version) to $target/amy"

case ":$PATH:" in
  *":$target:"*) ;;
  *) echo "note: $target is not on your PATH, so \`amy\` will not resolve yet" >&2 ;;
esac
