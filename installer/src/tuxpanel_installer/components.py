# SPDX-License-Identifier: GPL-3.0-or-later
"""Component catalogue — every optional piece TuxPanel can manage."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto


class Category(Enum):
    CORE = auto()
    REMOTE_DESKTOP = auto()
    DESKTOP_ENV = auto()
    EXTRAS = auto()


@dataclass(frozen=True, slots=True)
class Component:
    """A single installable component."""

    id: str
    name: str
    category: Category
    description: str
    required: bool = False
    size_mb: int = 0
    packages: dict[str, list[str]] = field(default_factory=dict)
    # packages is keyed by PackageManager.value ("dnf", "apt", "pacman", "zypper")

    def packages_for(self, pm: str) -> list[str]:
        return self.packages.get(pm, [])


# ── Registry ───────────────────────────────────────────────────────────────

COMPONENTS: list[Component] = [
    # ── Core (required) ────────────────────────────────────────────────────
    Component(
        id="tuxpanel-server",
        name="TuxPanel Server",
        category=Category.CORE,
        description="Express + TypeScript backend, Socket.IO terminal multiplexer.",
        required=True,
        size_mb=12,
    ),
    Component(
        id="tuxpanel-webui",
        name="TuxPanel Web UI",
        category=Category.CORE,
        description="React 19 + Tailwind CSS dashboard served by Vite.",
        required=True,
        size_mb=4,
    ),
    Component(
        id="tuxpanel-polkit",
        name="Polkit Rules & Scripts",
        category=Category.CORE,
        description="Passwordless pkexec rules and the editConf helper.",
        required=True,
        size_mb=1,
    ),
    # ── Remote Desktop ─────────────────────────────────────────────────────
    Component(
        id="tigervnc",
        name="TigerVNC Server",
        category=Category.REMOTE_DESKTOP,
        description="Headless VNC session spawning per-user via systemd template.",
        size_mb=14,
        packages={
            "dnf": ["tigervnc-server"],
            "apt": ["tigervnc-standalone-server", "tigervnc-common"],
            "pacman": ["tigervnc"],
            "zypper": ["tigervnc"],
        },
    ),
    Component(
        id="x11vnc",
        name="x11vnc",
        category=Category.REMOTE_DESKTOP,
        description="Mirror an existing X11 display for screen-sharing.",
        size_mb=2,
        packages={
            "dnf": ["x11vnc"],
            "apt": ["x11vnc"],
            "pacman": ["x11vnc"],
            "zypper": ["x11vnc"],
        },
    ),
    Component(
        id="freerdp",
        name="FreeRDP Client",
        category=Category.REMOTE_DESKTOP,
        description="RDP→VNC bridge for connecting to Windows containers.",
        size_mb=8,
        packages={
            "dnf": ["freerdp"],
            "apt": ["freerdp2-x11"],
            "pacman": ["freerdp"],
            "zypper": ["freerdp"],
        },
    ),
    # ── Desktop Environments (for headless VNC) ────────────────────────────
    Component(
        id="xfce",
        name="XFCE Desktop",
        category=Category.DESKTOP_ENV,
        description="Lightweight desktop for headless VNC sessions (~180 MB).",
        size_mb=180,
        packages={
            "dnf": ["@xfce-desktop-environment"],
            "apt": ["xfce4", "xfce4-goodies"],
            "pacman": ["xfce4", "xfce4-goodies"],
            "zypper": ["-t", "pattern", "xfce"],
        },
    ),
    Component(
        id="mate",
        name="MATE Desktop",
        category=Category.DESKTOP_ENV,
        description="Traditional desktop for headless VNC sessions (~220 MB).",
        size_mb=220,
        packages={
            "dnf": ["@mate-desktop-environment"],
            "apt": ["mate-desktop-environment"],
            "pacman": ["mate", "mate-extra"],
            "zypper": ["-t", "pattern", "mate"],
        },
    ),
    Component(
        id="openbox",
        name="Openbox",
        category=Category.DESKTOP_ENV,
        description="Ultra-minimal window manager for constrained VNC sessions.",
        size_mb=12,
        packages={
            "dnf": ["openbox"],
            "apt": ["openbox"],
            "pacman": ["openbox"],
            "zypper": ["openbox"],
        },
    ),
    # ── Extras ─────────────────────────────────────────────────────────────
    Component(
        id="nodejs",
        name="Node.js 22 LTS",
        category=Category.EXTRAS,
        description="Required runtime. Installer will set up the NodeSource repo.",
        size_mb=50,
        packages={
            "dnf": ["nodejs"],
            "apt": ["nodejs"],
            "pacman": ["nodejs-lts-jod"],
            "zypper": ["nodejs22"],
        },
    ),
]

COMPONENT_MAP: dict[str, Component] = {c.id: c for c in COMPONENTS}


def core_components() -> list[Component]:
    return [c for c in COMPONENTS if c.category == Category.CORE]


def optional_components() -> list[Component]:
    return [c for c in COMPONENTS if not c.required]


def components_by_category() -> dict[Category, list[Component]]:
    result: dict[Category, list[Component]] = {}
    for c in COMPONENTS:
        result.setdefault(c.category, []).append(c)
    return result
