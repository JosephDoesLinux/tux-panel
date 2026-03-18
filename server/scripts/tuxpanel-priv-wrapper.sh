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
    if [[ ! "$ACTION" =~ ^(start|stop|restart|reload|status|is-active|enable|disable|poweroff|reboot|list-units)$ ]]; then
      echo "Denied systemctl action: $ACTION" >&2
      exit 1
    fi
    # If starting/stopping etc, ensure it only manages allowed services (add regex if needed)
    # Right now, we let systemctl pass through because the backend needs it for containers, services, etc.
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
    # Disallow modifying the root user or wheel/sudo group
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
  "/opt/tuxpanel/scripts/tuxpanel-edit-conf.sh")
    exec /opt/tuxpanel/scripts/tuxpanel-edit-conf.sh "$@"
    ;;
  *)
    echo "Command not allowed: $COMMAND" >&2
    exit 1
    ;;
esac
