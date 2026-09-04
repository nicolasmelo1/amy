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
# Where the executable is built before it is installed. Overridable so a test
# run keeps its 64 MB inside the temporary directory it will delete, rather
# than leaving it in a checkout it was only borrowing.
built=${AMY_BUILD_OUT:-"$repo/dist/amy"}

"$repo/scripts/build-binary.sh" "$built"

mkdir -p "$target"
# Replaced rather than written over: overwriting a running binary is what
# produces a half-written executable on the next invocation.
tmp="$target/.amy.incoming"
cp "$built" "$tmp"
chmod +x "$tmp"
mv -f "$tmp" "$target/amy"

echo "installed $("$target/amy" --version) to $target/amy"

case ":$PATH:" in
  *":$target:"*) ;;
  *) echo "note: $target is not on your PATH, so \`amy\` will not resolve yet" >&2 ;;
esac
