# 59-second vertical video (9:16) — shooting script

Screen recording of Cloud Shell on the left half / phone browser on the right is too
small at 9:16; record full-width terminal, then the client on a phone. Voice-over, no music bed under speech.

| Time | Picture | Voice-over |
| --- | --- | --- |
| 0:00–0:05 | Title card: "Your own Farcaster node + client. 3 commands." | "This is a Farcaster client reading from a node I run. Here's the whole setup." |
| 0:05–0:14 | Cloud Shell: `git clone …`, `./provision.sh`, VM IP printed | "Command zero makes a Google Cloud VM: four CPUs, sixteen gigs, two terabytes of disk." |
| 0:14–0:24 | `./node.sh`, then logs: `Downloading snapshot chunk…` | "Command one starts a Snapchain read node. Pinned version, no API keys. The first sync takes a few hours." |
| 0:24–0:30 | `curl …/v1/info` with `blockDelay` single digits (pre-recorded after sync) | "When block delay is single digits on every shard, you're in sync." |
| 0:30–0:40 | `./client.sh`, browser shows QR, phone scans it, Farcaster app approval screen, UI flips to "connected" | "Command two. I scan the code and approve in the Farcaster app. My seed phrase never touches this client." |
| 0:40–0:50 | Phone: feed loads, post a cast, status "in a block" | "Feed comes from my node. I post; my node checks it and gossips it to the validators." |
| 0:50–0:56 | Filter panel: untick one app FID, feed changes | "Every cast says which app signed it, so I can include or exclude clients." |
| 0:56–0:59 | URL card: arc4randall.github.io/farcaster-in-three-gcp | "Tutorial and code at this link." |

Shoot list: record the sync phase separately and cut; never show a seed phrase, `app.json` or `signer.json`.
