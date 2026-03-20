sed -i '/echo "==> Bundling repo assets for standalone execution..."/,/cp src\/tuxpanel_installer/d' build-appimage.sh
cat << 'APP_PATCH' >> build-appimage.sh
echo "==> Pre-building client and server for bundled execution..."

pushd ../server
npm ci
npm run build
npm prune --omit=dev
popd

pushd ../client
npm ci
npm run build
# Note: Client does not typically need node_modules in production if we only serve the 'dist' dir,
# but we bundle it exactly as it would be built by the installer.
popd

echo "==> Bundling repo assets for standalone execution..."
rsync -a ../server "${APPDIR}/usr/lib/"
rsync -a ../client "${APPDIR}/usr/lib/"
mkdir -p "${APPDIR}/usr/lib/installer/appimage"
cp appimage/org.tuxpanel.desktop "${APPDIR}/usr/lib/installer/appimage/"
cp appimage/tuxpanel-tray.desktop "${APPDIR}/usr/lib/installer/appimage/"
mkdir -p "${APPDIR}/usr/lib/installer/src/tuxpanel_installer/resources/icons"
cp src/tuxpanel_installer/resources/icons/tuxpanel.svg "${APPDIR}/usr/lib/installer/src/tuxpanel_installer/resources/icons/"

# ── Package ────────────────────────────────────────────────────────────────
echo "==> Packaging AppImage..."
mkdir -p dist
ARCH="\$ARCH" "\$APPIMAGETOOL" "\$APPDIR" "\$OUTPUT"

echo "==> Done: \$OUTPUT (\$(du -h "\$OUTPUT" | cut -f1))"
APP_PATCH

sed -i '/# ── Package ──/,$d' build-appimage.sh
