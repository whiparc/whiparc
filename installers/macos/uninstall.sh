#!/usr/bin/env bash
set -euo pipefail

# Removes a whiparc CLI installed via whiparc-macos.pkg. macOS .pkg
# installers have no built-in uninstaller, so this is shipped alongside the
# package as the documented removal path (see the docs site's install
# guide).

sudo rm -f /usr/local/bin/whiparc
sudo pkgutil --forget dev.whiparc.cli >/dev/null 2>&1 || true

echo "whiparc CLI removed."
