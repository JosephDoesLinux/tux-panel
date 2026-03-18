# SPDX-License-Identifier: GPL-3.0-or-later
"""Entry point — ``python -m tuxpanel_installer`` or the console_script."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from . import __version__


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="tuxpanel-installer",
        description="TuxPanel — cross-distro installer, updater, and tray indicator.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--install", action="store_true",
        help="Launch the install wizard (default when TuxPanel is not installed).",
    )
    group.add_argument(
        "--manage", action="store_true",
        help="Open the component manager (default when TuxPanel is installed).",
    )
    group.add_argument(
        "--tray", action="store_true",
        help="Start the system tray indicator (no wizard).",
    )
    group.add_argument(
        "--execute", metavar="MANIFEST",
        help="(Internal) Execute an install manifest as root.",
    )
    group.add_argument(
        "--uninstall", action="store_true",
        help="Remove TuxPanel and all managed components.",
    )

    args = parser.parse_args(argv)

    # ── Privileged execution mode (runs under pkexec, no GUI) ──────────
    if args.execute:
        from .installer import InstallManifest, execute_manifest
        manifest = InstallManifest.from_json(Path(args.execute).read_text())
        rc = execute_manifest(manifest)
        sys.exit(rc)

    # ── Uninstall mode (re-exec via pkexec if needed) ─────────────────
    if args.uninstall:
        from .installer import uninstall_all

        if os.geteuid() != 0:
            src_root = str(Path(__file__).resolve().parents[1])  # installer/src
            entry = [
                "env",
                f"PYTHONPATH={src_root}",
                sys.executable,
                "-m",
                "tuxpanel_installer",
                "--uninstall",
            ]
            rc = subprocess.call(["pkexec", *entry])
            sys.exit(rc)

        rc = uninstall_all()
        sys.exit(rc)

    # ── Tray-only mode ─────────────────────────────────────────────────
    if args.tray:
        _launch_tray()
        return

    # ── GUI modes (install / manage / auto-detect) ─────────────────────
    _launch_gui(force_install=args.install, force_manage=args.manage)


def _is_dark_theme() -> bool:
    """Check Freedesktop settings portal for dark-scheme preference."""
    try:
        import subprocess
        result = subprocess.run(
            [
                "dbus-send",
                "--reply-timeout=100",
                "--print-reply=literal",
                "--dest=org.freedesktop.portal.Desktop",
                "/org/freedesktop/portal/desktop",
                "org.freedesktop.portal.Settings.Read",
                "string:org.freedesktop.appearance",
                "string:color-scheme"
            ],
            capture_output=True,
            text=True,
            timeout=1
        )
        return "uint32 1" in result.stdout
    except Exception:
        return False


def _launch_gui(*, force_install: bool = False, force_manage: bool = False) -> None:
    """Initialise Qt and show the wizard or the manager."""
    from PyQt6.QtWidgets import QApplication

    from .app import InstallerWindow

    # Set some sensible environment defaults for Wayland if not set
    if sys.platform.startswith("linux"):
        if "QT_QPA_PLATFORM" not in os.environ:
            os.environ["QT_QPA_PLATFORM"] = "wayland;xcb"
        if "QT_QPA_PLATFORMTHEME" not in os.environ:
            # Let standard gtk3 bridging attempt to pull the native UI
            os.environ["QT_QPA_PLATFORMTHEME"] = "gtk3"

    app = QApplication(sys.argv)
    
    # Fallback palette injection if the system GTK/Qt bridging isn't actively working
    if sys.platform.startswith("linux") and app.style().objectName() != "gtk3":
        app.setStyle("Fusion")
        if _is_dark_theme():
            from PyQt6.QtGui import QPalette, QColor
            from PyQt6.QtCore import Qt
            p = QPalette()
            p.setColor(QPalette.ColorRole.Window, QColor(40, 40, 40))
            p.setColor(QPalette.ColorRole.WindowText, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.Base, QColor(30, 30, 30))
            p.setColor(QPalette.ColorRole.AlternateBase, QColor(40, 40, 40))
            p.setColor(QPalette.ColorRole.ToolTipBase, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.ToolTipText, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.Text, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.Button, QColor(60, 60, 60))
            p.setColor(QPalette.ColorRole.ButtonText, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.BrightText, Qt.GlobalColor.red)
            p.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218))
            p.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
            p.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.black)
            app.setPalette(p)

    app.setApplicationName("TuxPanel Installer")
    app.setApplicationVersion(__version__)
    app.setOrganizationName("TuxPanel")
    app.setDesktopFileName("org.tuxpanel.installer")

    window = InstallerWindow(force_install=force_install, force_manage=force_manage)
    window.show()
    sys.exit(app.exec())


def _launch_tray() -> None:
    """Start the system-tray indicator (does not show a window)."""
    from PyQt6.QtWidgets import QApplication

    from .tray.indicator import TrayIndicator
    
    # Set some sensible environment defaults for Wayland if not set
    if sys.platform.startswith("linux"):
        if "QT_QPA_PLATFORM" not in os.environ:
            os.environ["QT_QPA_PLATFORM"] = "wayland;xcb"
        if "QT_QPA_PLATFORMTHEME" not in os.environ:
            # Let standard gtk3 bridging attempt to pull the native UI
            os.environ["QT_QPA_PLATFORMTHEME"] = "gtk3"

    app = QApplication(sys.argv)
    
    # Fallback palette injection
    if sys.platform.startswith("linux") and app.style().objectName() != "gtk3":
        app.setStyle("Fusion")
        if _is_dark_theme():
            from PyQt6.QtGui import QPalette, QColor
            from PyQt6.QtCore import Qt
            p = QPalette()
            p.setColor(QPalette.ColorRole.Window, QColor(40, 40, 40))
            p.setColor(QPalette.ColorRole.WindowText, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.Base, QColor(30, 30, 30))
            p.setColor(QPalette.ColorRole.AlternateBase, QColor(40, 40, 40))
            p.setColor(QPalette.ColorRole.ToolTipBase, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.ToolTipText, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.Text, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.Button, QColor(60, 60, 60))
            p.setColor(QPalette.ColorRole.ButtonText, Qt.GlobalColor.white)
            p.setColor(QPalette.ColorRole.BrightText, Qt.GlobalColor.red)
            p.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218))
            p.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
            p.setColor(QPalette.ColorRole.HighlightedText, Qt.GlobalColor.black)
            app.setPalette(p)

    app.setApplicationName("TuxPanel Tray")
    app.setApplicationVersion(__version__)
    app.setOrganizationName("TuxPanel")
    app.setDesktopFileName("org.tuxpanel.installer")
    app.setQuitOnLastWindowClosed(False)

    tray = TrayIndicator()  # noqa: F841 — prevent GC
    tray.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
