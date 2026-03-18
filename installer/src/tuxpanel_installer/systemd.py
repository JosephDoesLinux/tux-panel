# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate systemd unit files and manage the tuxpanel service."""

from __future__ import annotations

import subprocess
from pathlib import Path
from textwrap import dedent

from . import constants as C


def generate_unit(
    *,
    host: str = C.DEFAULT_HOST,
    port: int = C.DEFAULT_PORT,
    user: str = C.SERVICE_USER,
    group: str = C.SERVICE_GROUP,
    node_bin: str = "/usr/bin/node",
) -> str:
    """Return the contents of tuxpanel.service."""
    return dedent(f"""\
        [Unit]
        Description=TuxPanel — Linux Administration Dashboard
        Documentation={C.GITHUB_REPO}
        After=network-online.target docker.service
        Wants=network-online.target

        [Service]
        Type=simple
        User={user}
        Group={group}
        WorkingDirectory={C.SERVER_DIR}
        ExecStart={node_bin} {C.SERVER_DIR / "dist" / "server.js"}
        Restart=on-failure
        RestartSec=5
        StartLimitBurst=3
        StartLimitIntervalSec=60

        # Hardening
        NoNewPrivileges=false
        ProtectSystem=full
        ProtectHome=false
        ReadWritePaths={C.DATA_DIR} /tmp
        PrivateTmp=true

        # Environment
        Environment=NODE_ENV=production
        Environment=TUXPANEL_PORT={port}
        Environment=TUXPANEL_HOST={host}
        EnvironmentFile=-{C.ENVIRONMENT_FILE}

        [Install]
        WantedBy=multi-user.target
    """)


def generate_environment(*, host: str, port: int, extra: dict[str, str] | None = None) -> str:
    """Generate /etc/tuxpanel/environment file contents."""
    lines = [
        "# TuxPanel environment — managed by tuxpanel-installer",
        f"TUXPANEL_HOST={host}",
        f"TUXPANEL_PORT={port}",
        "NODE_ENV=production",
    ]
    if extra:
        for k, v in extra.items():
            lines.append(f"{k}={v}")
    return "\n".join(lines) + "\n"


def write_unit(content: str) -> None:
    """Write the unit file and reload systemd."""
    C.SYSTEMD_UNIT.write_text(content)
    subprocess.run(["systemctl", "daemon-reload"], check=True)


def enable_service() -> None:
    subprocess.run(["systemctl", "enable", C.SERVICE_NAME], check=True)


def start_service() -> None:
    subprocess.run(["systemctl", "start", C.SERVICE_NAME], check=True)


def stop_service() -> None:
    subprocess.run(["systemctl", "stop", C.SERVICE_NAME], check=False)


def restart_service() -> None:
    subprocess.run(["systemctl", "restart", C.SERVICE_NAME], check=True)


def disable_service() -> None:
    subprocess.run(["systemctl", "disable", C.SERVICE_NAME], check=False)


def is_active() -> bool:
    r = subprocess.run(
        ["systemctl", "is-active", C.SERVICE_NAME],
        capture_output=True, text=True,
    )
    return r.stdout.strip() == "active"


def is_enabled() -> bool:
    r = subprocess.run(
        ["systemctl", "is-enabled", C.SERVICE_NAME],
        capture_output=True, text=True,
    )
    return r.stdout.strip() == "enabled"


def remove_unit() -> None:
    """Stop, disable, and delete the unit file."""
    stop_service()
    disable_service()
    if C.SYSTEMD_UNIT.exists():
        C.SYSTEMD_UNIT.unlink()
    subprocess.run(["systemctl", "daemon-reload"], check=True)


def ensure_service_user() -> None:
    """Create the tuxpanel system user/group if they don't exist."""
    # Ensure the group exists first
    r = subprocess.run(["getent", "group", C.SERVICE_GROUP], capture_output=True)
    if r.returncode != 0:
        subprocess.run(["groupadd", "--system", C.SERVICE_GROUP], check=True)

    # Create the user if it doesn't exist, assigning the (possibly pre-existing) group
    r = subprocess.run(["id", C.SERVICE_USER], capture_output=True)
    if r.returncode != 0:
        subprocess.run([
            "useradd",
            "--system",
            "--no-create-home",
            "--shell", "/bin/bash",
            "--home-dir", str(C.INSTALL_PREFIX),
            "--gid", C.SERVICE_GROUP,    # use existing group, don't try to create one
            C.SERVICE_USER,
        ], check=True)
