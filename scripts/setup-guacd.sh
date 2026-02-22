#!/usr/bin/env bash
# ============================================================
#  TuxPanel — Guacamole (guacd) Docker Setup
#
#  Since guacd is not packaged for Fedora 43, we run the
#  official Apache Guacamole daemon as a Docker container.
#
#  Run:  sudo bash scripts/setup-guacd.sh
# ============================================================

set -euo pipefail

GUACD_IMAGE="tuxpanel/guacd:latest"
CONTAINER_NAME="tuxpanel-guacd"

echo "Building custom guacd image with FreeRDP 3 support…"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
docker build -t "$GUACD_IMAGE" "$PROJECT_DIR/docker/guacd/"

# Stop existing container if present
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting guacd container (host networking for localhost RDP access)…"
docker run -d \
  --name "$CONTAINER_NAME" \
  --network host \
  --restart unless-stopped \
  "$GUACD_IMAGE"

echo "✓ guacd running on port 4822 (host network)"
echo "  Verify: docker logs $CONTAINER_NAME"
