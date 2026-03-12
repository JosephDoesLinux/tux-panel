# TuxPanel Installer

A cross-distro graphical installer, updater, and system tray indicator for
[TuxPanel](https://github.com/JosephDoesLinux/tux-panel) — the self-hosted
Linux administration dashboard.

## Features

- **One-click install** — download the AppImage, double-click, done.
- **Component picker** — choose exactly what you need (VNC, RDP bridge, XFCE, etc.).
- **Update / Add / Remove** — re-run the same AppImage to manage an existing install.
- **System tray indicator** — monitor service status, open the dashboard, restart from the taskbar.
- **Distro-agnostic** — detects `dnf`, `apt`, `pacman`, `zypper` automatically.
- **Polkit integration** — never asks you to run the GUI as root; privilege escalation is scoped.

## Requirements

- Python 3.10+
- PyQt6
- Linux with systemd
- A desktop environment (KDE, GNOME, XFCE, MATE, etc.)

## Quick Start

### From AppImage (recommended)

```bash
chmod +x TuxPanel-Installer-*.AppImage
./TuxPanel-Installer-*.AppImage
```

### From source

```bash
pip install -e '.[dev]'
tuxpanel-installer          # launch GUI wizard
tuxpanel-installer --tray   # launch tray indicator only
tuxpanel-installer --help   # show all options
```

## Building the AppImage

```bash
./build-appimage.sh
```

Requires `appimagetool` and `python-appimage` (the script will fetch them if missing).

## CLI Reference

```
tuxpanel-installer [OPTIONS]

Options:
  --install              Run the install wizard (default when not installed)
  --manage               Open the component manager (default when installed)
  --tray                 Start the system tray indicator
  --execute MANIFEST     Privileged: execute an install manifest (internal)
  --uninstall            Remove TuxPanel and all components
  --version              Show version and exit
  --help                 Show this help and exit
```

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).

## Credits

Part of the TuxPanel project by Joseph Abou Antoun & Merheb Merheb.
