#!/usr/bin/env bash
# Command 2: on the VM, install the client, give it an app key (first run only),
# and start it. Your browser reaches it at http://localhost:3000 through the
# SSH tunnel this command opens. Nothing is exposed publicly.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=config.env
source ./config.env
SETUP_FLAG="${1:-}"   # pass --onchain for the legacy KeyGateway transaction
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" -- "mkdir -p ~/fc-client-src"
gcloud compute scp --recurse --zone "$ZONE" --project "$PROJECT" \
  client/package.json client/package-lock.json client/lib.mjs client/setup.mjs client/server.mjs client/test.mjs client/public remote/client-run.sh \
  "$VM":~/fc-client-src/ >/dev/null
echo "Open http://localhost:3000 once you see 'client on ...'"
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" -- -t -L 3000:127.0.0.1:3000 \
  "bash ~/fc-client-src/client-run.sh $SETUP_FLAG"
