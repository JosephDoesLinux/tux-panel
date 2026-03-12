# SPDX-License-Identifier: GPL-3.0-or-later
"""Distro detection and package-manager abstraction."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class PackageManager(Enum):
    DNF = "dnf"
    APT = "apt"
    PACMAN = "pacman"
    ZYPPER = "zypper"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class DistroInfo:
    id: str  # e.g. "fedora", "ubuntu", "arch"
    name: str  # e.g. "Fedora Linux 43"
    version: str  # e.g. "43"
    pm: PackageManager


def detect_distro() -> DistroInfo:
    """Read /etc/os-release and resolve the package manager."""
    fields: dict[str, str] = {}
    os_release = Path("/etc/os-release")
    if os_release.exists():
        for line in os_release.read_text().splitlines():
            if "=" in line:
                key, _, val = line.partition("=")
                fields[key.strip()] = val.strip().strip('"')

    distro_id = fields.get("ID", "unknown")
    distro_name = fields.get("PRETTY_NAME", fields.get("NAME", distro_id))
    distro_version = fields.get("VERSION_ID", "")

    pm = _detect_pm(distro_id)
    return DistroInfo(id=distro_id, name=distro_name, version=distro_version, pm=pm)


def _detect_pm(distro_id: str) -> PackageManager:
    """Prefer explicit ID mapping, fall back to binary detection."""
    id_map: dict[str, PackageManager] = {
        "fedora": PackageManager.DNF,
        "rhel": PackageManager.DNF,
        "centos": PackageManager.DNF,
        "rocky": PackageManager.DNF,
        "alma": PackageManager.DNF,
        "nobara": PackageManager.DNF,
        "debian": PackageManager.APT,
        "ubuntu": PackageManager.APT,
        "linuxmint": PackageManager.APT,
        "pop": PackageManager.APT,
        "elementary": PackageManager.APT,
        "arch": PackageManager.PACMAN,
        "manjaro": PackageManager.PACMAN,
        "endeavouros": PackageManager.PACMAN,
        "opensuse-tumbleweed": PackageManager.ZYPPER,
        "opensuse-leap": PackageManager.ZYPPER,
        "sles": PackageManager.ZYPPER,
    }
    if distro_id in id_map:
        return id_map[distro_id]

    # Fallback: check which binary exists
    for pm in PackageManager:
        if pm != PackageManager.UNKNOWN and shutil.which(pm.value):
            return pm
    return PackageManager.UNKNOWN


def install_packages(pm: PackageManager, packages: list[str]) -> subprocess.CompletedProcess[str]:
    """Install packages non-interactively.  Must be run as root."""
    if not packages:
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")

    cmd: list[str]
    match pm:
        case PackageManager.DNF:
            cmd = ["dnf", "install", "-y", "--setopt=install_weak_deps=False", *packages]
        case PackageManager.APT:
            cmd = ["apt-get", "install", "-y", "--no-install-recommends", *packages]
        case PackageManager.PACMAN:
            cmd = ["pacman", "-S", "--noconfirm", "--needed", *packages]
        case PackageManager.ZYPPER:
            cmd = ["zypper", "--non-interactive", "install", *packages]
        case _:
            raise RuntimeError(f"Unsupported package manager: {pm}")

    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def remove_packages(pm: PackageManager, packages: list[str]) -> subprocess.CompletedProcess[str]:
    """Remove packages non-interactively.  Must be run as root."""
    if not packages:
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")

    cmd: list[str]
    match pm:
        case PackageManager.DNF:
            cmd = ["dnf", "remove", "-y", *packages]
        case PackageManager.APT:
            cmd = ["apt-get", "remove", "-y", *packages]
        case PackageManager.PACMAN:
            cmd = ["pacman", "-Rns", "--noconfirm", *packages]
        case PackageManager.ZYPPER:
            cmd = ["zypper", "--non-interactive", "remove", *packages]
        case _:
            raise RuntimeError(f"Unsupported package manager: {pm}")

    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def is_package_installed(pm: PackageManager, package: str) -> bool:
    """Check whether a single package is already installed."""
    cmd: list[str]
    match pm:
        case PackageManager.DNF:
            cmd = ["rpm", "-q", package]
        case PackageManager.APT:
            cmd = ["dpkg", "-s", package]
        case PackageManager.PACMAN:
            cmd = ["pacman", "-Qi", package]
        case PackageManager.ZYPPER:
            cmd = ["rpm", "-q", package]
        case _:
            return False

    return subprocess.run(cmd, capture_output=True).returncode == 0
