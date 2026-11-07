#!/bin/sh
# Installs the oasdiff the toolchain lock names into ~/.local/bin, checked
# against the checksums its release publishes. L2.THE_CONTRACT_ONLY_BREAKS_ON_PURPOSE
# and the services' gate test both run it, so every job that runs either one
# calls this, and so does ./scripts/setup-dev.sh: one place reads the version.
#
# On GitHub Actions the directory is added to the job's PATH; anywhere else
# the script fails, naming the line to add, while that directory is not on it.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
version=$(sed -n 's/.*"oasdiff": *"\([^"]*\)".*/\1/p' "$repo/.software-factory/toolchain.lock.json")
target="$HOME/.local/bin"

have=$(command -v oasdiff >/dev/null 2>&1 && oasdiff --version 2>/dev/null | awk '{print $3}' || echo "")
if [ "$have" = "$version" ]; then
  echo "oasdiff $version already installed"
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-*) asset="oasdiff_${version}_darwin_all.tar.gz" ;;
  Linux-x86_64) asset="oasdiff_${version}_linux_amd64.tar.gz" ;;
  Linux-aarch64 | Linux-arm64) asset="oasdiff_${version}_linux_arm64.tar.gz" ;;
  *)
    echo "no oasdiff release for $(uname -s)-$(uname -m); install $version from https://github.com/oasdiff/oasdiff/releases" >&2
    exit 1
    ;;
esac

if command -v sha256sum >/dev/null 2>&1; then check="sha256sum -c -"; else check="shasum -a 256 -c -"; fi

base="https://github.com/oasdiff/oasdiff/releases/download/v$version"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL "$base/$asset" -o "$work/$asset"
curl -fsSL "$base/checksums.txt" -o "$work/checksums.txt"
(cd "$work" && grep " $asset\$" checksums.txt | $check)
tar -xzf "$work/$asset" -C "$work" oasdiff
mkdir -p "$target"
mv "$work/oasdiff" "$target/oasdiff"
"$target/oasdiff" --version
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$target" >> "$GITHUB_PATH"
else
  case ":$PATH:" in
    *":$target:"*) ;;
    *)
      echo "oasdiff is in $target, which is not on your PATH; add it, then run this again:" >&2
      echo "  export PATH=\"$target:\$PATH\"" >&2
      exit 1
      ;;
  esac
fi
