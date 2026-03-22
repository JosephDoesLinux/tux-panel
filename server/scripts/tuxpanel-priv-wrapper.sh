#!/bin/bash
# tuxpanel-priv-wrapper.sh
# A strictly constrained wrapper for privileged commands execution.

COMMAND=$1
shift

# Validate commands and arguments carefully
case "$COMMAND" in
  "/usr/bin/systemctl")
    ACTION=$1
    shift
    if [[ ! "$ACTION" =~ ^(start|stop|restart|reload|daemon-reload|status|is-active|enable|disable|poweroff|reboot|list-units|list-unit-files)$ ]]; then
      echo "Denied systemctl action: $ACTION" >&2
      exit 1
    fi
    exec /usr/bin/systemctl "$ACTION" "$@"
    ;;
  "/usr/bin/kill")
    exec /usr/bin/kill "$@"
    ;;
  "/usr/bin/useradd")
    exec /usr/bin/useradd "$@"
    ;;
  "/usr/bin/userdel")
    exec /usr/bin/userdel "$@"
    ;;
  "/usr/bin/usermod")
    for arg in "$@"; do
        if [[ "$arg" == "root" || "$arg" == "wheel" || "$arg" == "sudo" ]]; then
            echo "Denied usermod target: $arg" >&2
            exit 1
        fi
    done
    exec /usr/bin/usermod "$@"
    ;;
  "/usr/bin/chpasswd")
    exec /usr/bin/chpasswd "$@"
    ;;
  "/usr/bin/smartctl")
    exec /usr/bin/smartctl "$@"
    ;;
  "/usr/bin/btrfs")
    exec /usr/bin/btrfs "$@"
    ;;
  "/usr/bin/mount")
    exec /usr/bin/mount "$@"
    ;;
  "/usr/bin/umount")
    exec /usr/bin/umount "$@"
    ;;
  "/usr/sbin/ausearch")
    exec /usr/sbin/ausearch "$@"
    ;;
  "/usr/bin/lastb")
    exec /usr/bin/lastb "$@"
    ;;
  "/usr/sbin/sshd")
    exec /usr/sbin/sshd "$@"
    ;;
  "/usr/bin/docker")
    exec /usr/bin/docker "$@"
    ;;
  "/usr/bin/journalctl")
    exec /usr/bin/journalctl "$@"
    ;;
  "/usr/bin/dmesg")
    exec /usr/bin/dmesg "$@"
    ;;
  "/usr/bin/ss")
    exec /usr/bin/ss "$@"
    ;;
  "/usr/bin/x11vnc")
    exec /usr/bin/x11vnc "$@"
    ;;
  "/usr/bin/firewall-cmd")
    exec /usr/bin/firewall-cmd "$@"
    ;;
  "/opt/tuxpanel/scripts/tuxpanel-edit-conf.sh")
    exec /opt/tuxpanel/scripts/tuxpanel-edit-conf.sh "$@"
    ;;
  "/usr/bin/su"|"/bin/su")
    exec "$COMMAND" "$@"
    ;;
  "auth")
    # Execute node instead of python for PAM fallback, avoiding python-pam dependencies
    exec /usr/bin/node -e "
const pam = require('/opt/tuxpanel/server/node_modules/authenticate-pam');
const fs = require('fs');
const username = process.argv[1];
const password = fs.readFileSync(0, 'utf8').replace(/\n$/, '');
pam.authenticate(username, password, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
}, { serviceName: 'login', remoteHost: 'localhost' });
" "$@"
    ;;
  *)
    # For local development: allow tuxpanel-edit-conf.sh if it lives in the exact SAME directory as this wrapper
    WRAPPER_DIR="$(cd "$(dirname "$0")" && pwd)"
    if [ "$COMMAND" = "$WRAPPER_DIR/tuxpanel-edit-conf.sh" ]; then
      exec "$COMMAND" "$@"
    fi

    echo "Command not allowed: $COMMAND" >&2
    exit 1
    ;;
esac
