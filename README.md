# farcaster-in-three-gcp

Run your own Farcaster stack on Google Cloud in three commands: a VM, a Snapchain
read node, and a small web client that reads from that node and posts through it.
No API keys.

Tutorial: https://arc4randall.github.io/farcaster-in-three-gcp/ ([中文](https://arc4randall.github.io/farcaster-in-three-gcp/zh.html))

```sh
git clone https://github.com/arc4randall/farcaster-in-three-gcp && cd farcaster-in-three-gcp
./provision.sh   # 0. e2-standard-4 + 2 TB pd-balanced + firewall (3382/udp)
./node.sh        # 1. Snapchain read node, image pinned to 0.14.3
./client.sh      # 2. app key via gasless KEY_ADD, then client on localhost:3000 over SSH
```

Run from Cloud Shell or anywhere `gcloud` is logged in with a billing-enabled project.
Settings live in `config.env` (zone, VM name, machine type, disk size, Snapchain version).

**Seed phrases:** use a test account. Read `client/setup.mjs` before you run it. It reads
the phrase from your terminal on your own VM, signs two EIP-712 messages in memory and
exits; the phrase is never stored or sent anywhere else. See the tutorial's warning box.

## Layout

| Path | What |
| --- | --- |
| `provision.sh` | Command 0. Creates firewall rules and the VM. Idempotent. |
| `node.sh`, `remote/node-setup.sh` | Command 1. Installs Docker, fetches compose + `validators.toml` from the Snapchain release tag, pins the image, starts it. |
| `client.sh`, `remote/client-run.sh` | Command 2. Copies the client, installs Node 22, runs setup once, starts the server, opens an SSH tunnel. |
| `client/setup.mjs` | Seed phrase -> FID -> new Ed25519 app key -> `KEY_ADD` (default) or `KeyGateway.add` (`--onchain`). |
| `client/server.mjs`, `client/public/` | Feed, casts, replies, follow/unfollow, like/recast, include/exclude by app FID. |
| `client/test.mjs` | Offline check: builds a `KEY_ADD` and a cast with throwaway keys and runs `validateMessage`. |
| `docs/` | The microsite (GitHub Pages, `/docs` folder). |
| `NOTES-upstream.md` | Outdated upstream docs we hit, with file/line and the correct fact. |
| `VIDEO.md` | Script for a 59 s vertical walkthrough. |

## Writes

The client submits every message to your own read node (`POST /v1/submitMessage`). The
read node validates it and relays it to validators over the `mempool` gossip topic; it has
no mempool of its own. A 200 means "valid and relayed", so the client confirms inclusion
with `/v1/castById`. Details: https://snapchain.farcaster.xyz/node-types#message-submission-and-the-mempool

## Measured

<a id="measured"></a>
To be filled in from a real run: provision time, snapshot download time, catch-up time,
disk used after sync. Unmeasured numbers are not published here.

## Develop

```sh
cd client && npm ci && npm test
NODE_HTTP=http://127.0.0.1:3381 NODE_GRPC=127.0.0.1:3383 npm run setup && npm start
```

MIT licensed.
