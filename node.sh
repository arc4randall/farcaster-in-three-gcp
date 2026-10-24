#!/usr/bin/env bash
# Command 1: install Docker on the VM and start a pinned Snapchain read node.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=config.env
source ./config.env
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" -- \
  "SNAPCHAIN_VERSION=$SNAPCHAIN_VERSION bash -s" < remote/node-setup.sh
