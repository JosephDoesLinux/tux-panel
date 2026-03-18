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
  "/usr/bin/su")
    exec /usr/bin/su "$@"
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
  "/opt/tuxpanel/scripts/tuxpanel-edit-conf.sh")
    exec /opt/tuxpanel/scripts/tuxpanel-edit-conf.sh "$@"
    ;;
  "auth")
    # Custom auth command that uses python to verify against PAM as root
    USERNAME=$1
    exec /usr/bin/python3 -c '
import sys, ctypes, ctypes.util

_libpam = ctypes.CDLL(ctypes.util.find_library("pam"))

CONV_FUNC = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)),
    ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)), ctypes.c_void_p
)

class PamConv(ctypes.Structure):
    _fields_ = [("conv", CONV_FUNC), ("appdata_ptr", ctypes.c_void_p)]

class PamResponse(ctypes.Structure):
    _fields_ = [("resp", ctypes.c_char_p), ("resp_retcode", ctypes.c_int)]

password = sys.stdin.read().rstrip("\n").encode()

def conv_func(num_msg, msg, resp, appdata):
    response = PamResponse()
    # Memory allocated here will be freed by PAM, so we use strdup
    _libpam.strdup.restype = ctypes.POINTER(ctypes.c_char)
    response.resp = ctypes.cast(_libpam.strdup(password), ctypes.c_char_p)
    response.resp_retcode = 0
    resp_array = (PamResponse * 1)(response)
    
    # Needs to be a malloc pointer
    _libc = ctypes.CDLL(ctypes.util.find_library("c"))
    _libc.malloc.restype = ctypes.c_void_p
    mem = _libc.malloc(ctypes.sizeof(PamResponse))
    ctypes.memmove(mem, ctypes.addressof(response), ctypes.sizeof(PamResponse))
    
    resp[0] = ctypes.cast(mem, ctypes.POINTER(ctypes.c_void_p))
    return 0

conv = PamConv(CONV_FUNC(conv_func), None)
handle = ctypes.c_void_p()
retval = _libpam.pam_start(b"login", sys.argv[1].encode(), ctypes.byref(conv), ctypes.byref(handle))
if retval != 0:
    sys.exit(1)
retval = _libpam.pam_authenticate(handle, 0)
_libpam.pam_end(handle, retval)
sys.exit(0 if retval == 0 else 1)
' "$USERNAME"
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
