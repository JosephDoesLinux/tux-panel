#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# build-appimage.sh — Build a self-contained TuxPanel Installer AppImage.
#
# Usage:  ./build-appimage.sh [--arch x86_64]
#
# Requirements (fetched automatically if missing):
#   - appimagetool  (https://github.com/AppImage/appimagetool)
#   - python3, pip

set -euo pipefail

ARCH="${1:-x86_64}"
APP_NAME="TuxPanel-Installer"
APP_VERSION=$(python3 -c "
import tomllib, pathlib
p = tomllib.loads(pathlib.Path('pyproject.toml').read_text())
print(p['project']['version'])
")
APPDIR="build/${APP_NAME}.AppDir"
OUTPUT="dist/${APP_NAME}-${APP_VERSION}-${ARCH}.AppImage"

echo "==> Building ${APP_NAME} ${APP_VERSION} for ${ARCH}"

# ── Fetch appimagetool if needed ───────────────────────────────────────────
APPIMAGETOOL="build/appimagetool"
if [[ ! -x "$APPIMAGETOOL" ]]; then
    echo "==> Downloading appimagetool..."
    mkdir -p build
    curl -fsSL -o "$APPIMAGETOOL" \
        "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
    chmod +x "$APPIMAGETOOL"
fi

# ── Build AppDir ───────────────────────────────────────────────────────────
echo "==> Constructing AppDir..."
rm -rf "$APPDIR"
mkdir -p "${APPDIR}/usr/lib/python3/dist-packages" \
         "${APPDIR}/usr/bin" \
         "${APPDIR}/usr/share/applications" \
         "${APPDIR}/usr/share/icons/hicolor/scalable/apps" \
         "${APPDIR}/usr/share/metainfo"

# Copy application source
cp -r src/tuxpanel_installer "${APPDIR}/usr/lib/python3/dist-packages/"

# Install Python deps into AppDir (PyQt6, dbus-python)
echo "==> Installing Python dependencies into AppDir..."
pip install --upgrade --target="${APPDIR}/usr/lib/python3/dist-packages" \
    PyQt6 dbus-python

# Verify the package directory was copied
if [[ ! -d "${APPDIR}/usr/lib/python3/dist-packages/tuxpanel_installer" ]]; then
    echo "Error: tuxpanel_installer not found in AppDir. Aborting." >&2
    exit 1
fi

# Entry point wrapper
cat > "${APPDIR}/usr/bin/tuxpanel-installer" << 'WRAPPER'
#!/usr/bin/env python3
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, '..', 'lib', 'python3', 'dist-packages'))
from tuxpanel_installer.__main__ import main
main()
WRAPPER
chmod +x "${APPDIR}/usr/bin/tuxpanel-installer"

# Desktop + icon + appstream
cp appimage/org.tuxpanel.installer.desktop "${APPDIR}/usr/share/applications/"
cp appimage/org.tuxpanel.installer.desktop "${APPDIR}/"
cp appimage/org.tuxpanel.installer.appdata.xml "${APPDIR}/usr/share/metainfo/"
cp src/tuxpanel_installer/resources/icons/tuxpanel.svg \
    "${APPDIR}/usr/share/icons/hicolor/scalable/apps/org.tuxpanel.installer.svg"
cp src/tuxpanel_installer/resources/icons/tuxpanel.svg "${APPDIR}/org.tuxpanel.installer.svg"

# AppRun
cp appimage/AppRun "${APPDIR}/"
chmod +x "${APPDIR}/AppRun"

# ── Package ────────────────────────────────────────────────────────────────
echo "==> Packaging AppImage..."
mkdir -p dist
ARCH="$ARCH" "$APPIMAGETOOL" "$APPDIR" "$OUTPUT"

echo "==> Done: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
