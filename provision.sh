#!/usr/bin/env bash
# Command 0: create a Google Cloud VM big enough for a Snapchain read node.
# Run from Cloud Shell or any machine with gcloud logged in (gcloud auth login).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=config.env
source ./config.env
[ -n "$PROJECT" ] || { echo "No project. Run: gcloud config set project YOUR_PROJECT_ID" >&2; exit 1; }

echo "project=$PROJECT zone=$ZONE vm=$VM machine=$MACHINE disk=${DISK_GB}GB"
gcloud services enable compute.googleapis.com --project "$PROJECT"

# Gossip is QUIC over UDP 3382. 3381 (HTTP) and 3383 (gRPC) are what the
# Snapchain docs ask you to expose; set PRIVATE_API=1 to keep them closed and
# use them only through SSH.
if ! gcloud compute firewall-rules describe snapchain-gossip --project "$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create snapchain-gossip --project "$PROJECT" \
    --allow udp:3382 --target-tags snapchain --source-ranges 0.0.0.0/0
fi
if [ "${PRIVATE_API:-0}" != 1 ] && ! gcloud compute firewall-rules describe snapchain-api --project "$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create snapchain-api --project "$PROJECT" \
    --allow tcp:3381,tcp:3383 --target-tags snapchain --source-ranges 0.0.0.0/0
fi

if gcloud compute instances describe "$VM" --zone "$ZONE" --project "$PROJECT" >/dev/null 2>&1; then
  echo "VM $VM already exists, leaving it alone."
else
  gcloud compute instances create "$VM" --project "$PROJECT" --zone "$ZONE" \
    --machine-type "$MACHINE" \
    --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
    --boot-disk-size "${DISK_GB}GB" --boot-disk-type pd-balanced \
    --tags snapchain
fi

IP=$(gcloud compute instances describe "$VM" --zone "$ZONE" --project "$PROJECT" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "VM ready at $IP. Next: ./node.sh"
