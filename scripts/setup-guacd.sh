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

GUACD_IMAGE="guacamole/guacd:1.5.5"
CONTAINER_NAME="tuxpanel-guacd"

echo "Pulling guacd Docker image…"
docker pull "$GUACD_IMAGE"

# Stop existing container if present
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting guacd container…"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 4822:4822 \
  "$GUACD_IMAGE"

echo "✓ guacd running on port 4822"
echo "  Verify: docker logs $CONTAINER_NAME"
