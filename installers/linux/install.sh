#!/bin/sh
# Installs the whiparc CLI on Linux or macOS by downloading the matching
# pre-built binary from the latest GitHub Release and placing it on your
# PATH. Debian/Ubuntu and Fedora/RHEL users should prefer the .deb/.rpm
# package instead (see the docs site's install guide) — this script is the
# fallback for every other distro (and a manual-install path for macOS).
#
# Usage:
#   curl -fsSL https://<host>/downloads/install.sh | sh
#
# Override the install directory with WHIPARC_INSTALL_DIR (default: ~/.local/bin).
set -e

REPO="whiparc/whiparc"
INSTALL_DIR="${WHIPARC_INSTALL_DIR:-$HOME/.local/bin}"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) goos="linux" ;;
  Darwin) goos="darwin" ;;
  *)
    echo "error: unsupported OS: $os (this script supports Linux and macOS only)" >&2
    exit 1
    ;;
esac

case "$arch" in
  x86_64|amd64) goarch="amd64" ;;
  arm64|aarch64) goarch="arm64" ;;
  *)
    echo "error: unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

binary="whiparc-${goos}-${goarch}"
url="https://github.com/${REPO}/releases/latest/download/${binary}"

echo "Downloading ${binary}..."
mkdir -p "$INSTALL_DIR"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp"
chmod +x "$tmp"
mv "$tmp" "$INSTALL_DIR/whiparc"

echo "Installed whiparc to $INSTALL_DIR/whiparc"

case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    # Already on PATH — nothing to do.
    ;;
  *)
    shell_rc="$HOME/.profile"
    case "${SHELL:-}" in
      */zsh) shell_rc="$HOME/.zshrc" ;;
      */bash) shell_rc="$HOME/.bashrc" ;;
    esac
    line="export PATH=\"$INSTALL_DIR:\$PATH\""
    if [ -f "$shell_rc" ] && grep -qxF "$line" "$shell_rc" 2>/dev/null; then
      : # already added on a previous run
    else
      printf '\n# Added by the whiparc install script\n%s\n' "$line" >> "$shell_rc"
      echo "Added $INSTALL_DIR to PATH in $shell_rc — restart your terminal (or run: . $shell_rc)"
    fi
    ;;
esac

"$INSTALL_DIR/whiparc" --version 2>/dev/null || true
