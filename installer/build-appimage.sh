#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# build-appimage.sh — Build a self-contained TuxPanel Installer AppImage.
#
# Usage:  ./build-appimage.sh [--arch x86_64]
#
# Requirements (fetched automatically if missing):
#   - appimagetool  (https://github.com/AppImage/appimagetool)

set -euo pipefail

ARCH="${1:-x86_64}"
APP_NAME="TuxPanel-Installer"
# Can't use python directly if assuming minimal system, hardcode or grab via basic grep
APP_VERSION=$(grep -E 'version\s*=\s*"' pyproject.toml | head -n1 | cut -d'"' -f2 || echo "1.1.0")

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
mkdir -p "${APPDIR}/usr/bin" \
         "${APPDIR}/usr/share/applications" \
         "${APPDIR}/usr/share/icons/hicolor/scalable/apps" \
         "${APPDIR}/usr/share/metainfo" \
         "${APPDIR}/opt/python" \
         "${APPDIR}/usr/lib/python3/dist-packages"

# ── Fetch Standalone Python Runtime ────────────────────────────────────────
# Using python-build-standalone (manylinux compatible)
PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20240107/cpython-3.10.13+20240107-x86_64-unknown-linux-gnu-install_only.tar.gz"
echo "==> Fetching standalone Python runtime (this may take a minute)..."
if [[ ! -f "build/python-standalone.tar.gz" ]]; then
    curl -L -o build/python-standalone.tar.gz "$PYTHON_URL"
fi
echo "==> Extracting Python runtime into AppDir..."
tar -xzf build/python-standalone.tar.gz -C "${APPDIR}/opt/python"
# The archive has a 'python' folder inside. Move contents up
mv "${APPDIR}/opt/python/python/"* "${APPDIR}/opt/python/"
rmdir "${APPDIR}/opt/python/python"

# ── Install Python Dependencies ────────────────────────────────────────────
# Copy application source
cp -r src/tuxpanel_installer "${APPDIR}/usr/lib/python3/dist-packages/"

echo "==> Installing Python dependencies into AppDir..."
# Use the newly bundled Python to install the dependencies!
export PATH="${APPDIR}/opt/python/bin:$PATH"
python3 -m pip install --upgrade pip
python3 -m pip install PyQt6 dbus-python 

# ── Pre-build & Bundle Repo Assets ─────────────────────────────────────────
echo "==> Pre-building client and server for bundled execution..."
pushd ../server
npm ci
npm run build
npm prune --omit=dev
popd

pushd ../client
npm ci
npm run build
popd

echo "==> Bundling repo assets for standalone execution..."
rsync -a --exclude='.env' --exclude='node_modules' ../server "${APPDIR}/usr/lib/"
rsync -a --exclude='.env' --exclude='node_modules' ../client "${APPDIR}/usr/lib/"
# Remove any git directories that snuck in
find "${APPDIR}/usr/lib/server" "${APPDIR}/usr/lib/client" -name ".git" -type d -exec rm -rf {} +

# Bundle installer assets (icons, rules, manifests) exactly where installer expects them
mkdir -p "${APPDIR}/usr/lib/installer/appimage"
mkdir -p "${APPDIR}/usr/lib/installer/src/tuxpanel_installer/resources/icons"
cp appimage/org.tuxpanel.desktop "${APPDIR}/usr/lib/installer/appimage/"
cp appimage/tuxpanel-tray.desktop "${APPDIR}/usr/lib/installer/appimage/"
cp src/tuxpanel_installer/resources/icons/tuxpanel.svg "${APPDIR}/usr/lib/installer/src/tuxpanel_installer/resources/icons/"

echo "==> Bundling Qt6 XCB platform dependencies..."
# Bundle necessary XCB libraries if present on the build system
for lib in libxcb-cursor.so.0 libxcb-render-util.so.0 libxcb-image.so.0 libxcb-util.so.1 libxcb-icccm.so.4 libxcb-keysyms.so.1 libxcb-randr.so.0 libxcb-render.so.0 libxcb-shape.so.0 libxcb-shm.so.0 libxcb-sync.so.1 libxcb-xfixes.so.0 libxcb-xkb.so.1 libxkbcommon-x11.so.0 libxkbcommon.so.0; do
    real_lib=$(ldconfig -p | grep -m 1 "${lib}" | awk '{print $NF}' || true)
    if [[ -n "$real_lib" && -f "$real_lib" ]]; then
        cp -L "$real_lib" "${APPDIR}/usr/lib/${lib}"
    fi
done

# Entry point wrapper (Symlink or execution script)
cat > "${APPDIR}/usr/bin/tuxpanel-installer" << 'WRAPPER'
#!/bin/bash
HERE="$(dirname "$(readlink -f "${0}")")"
export PATH="${HERE}/../../opt/python/bin:$PATH"
export PYTHONPATH="${HERE}/../lib/python3/dist-packages:${HERE}/../../opt/python/lib/python3.10/site-packages"
export LD_LIBRARY_PATH="${HERE}/../lib:${LD_LIBRARY_PATH:-}"

# We must set LD_LIBRARY_PATH if the Qt C-extensions need it, but normally wheels include them
# or if they rely on system libs. The python-standalone is fully self contained.
exec python3 -m tuxpanel_installer "$@"
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
