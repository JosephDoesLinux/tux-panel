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


def _launch_gui(*, force_install: bool = False, force_manage: bool = False) -> None:
    """Initialise Qt and show the wizard or the manager."""
    from PyQt6.QtWidgets import QApplication

    from .app import InstallerWindow

    app = QApplication(sys.argv)
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

    app = QApplication(sys.argv)
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
