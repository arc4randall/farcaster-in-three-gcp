# Outdated or broken upstream docs we hit

Each item: where, what it says, what is true now, and the evidence. Checked 2026-10-24.

## farcasterxyz/docs

1. `docs/developers/guides/basics/hello-world.md`, lines 144-148.
   `getSignedKeyRequestMetadata({ requestFid: APP_FID, key: APP_PRIVATE_KEY, ... })`.
   Neither `APP_FID` nor `APP_PRIVATE_KEY` is defined anywhere in the file, so the
   example does not run. The values in scope are `fid` and `publicKey`, and the
   metadata must sign the *public* key. Fix: `requestFid: BigInt(fid), key: hexToBytes(publicKey)`.
2. Same file, lines 140-162: adds the app key with `KeyGateway.add` on Optimism
   and then sleeps 30 s. Since Snapchain engine V16 a key can be added gaslessly with a
   `KEY_ADD` message (FIP-272; `makeKeyAddBody` / `makeKeyAdd` in `@farcaster/core` >= 0.20.0).
   The onchain path still works but should no longer be the only one shown.
   Source: https://snapchain.farcaster.xyz/guides/writing-messages
3. Same file, lines 18, 45-50, 216-227: "hub", "hoyt.farcaster.xyz:3383", "run your own
   mainnet hub". The network is Snapchain; Hubble hubs are gone. Should say "a Snapchain
   node (your own read node works: it validates and relays writes)".
   Source: https://snapchain.farcaster.xyz/node-types#message-submission-and-the-mempool
4. `docs/learn/architecture/overview.md`, line 15: lists "Adding account keys for
   connected apps" under onchain actions only. Keys can now also be added offchain
   via `KEY_ADD` (gasless signers, scoped, sliding TTL up to 90 days).

## farcasterxyz/snapchain

5. `docs` getting-started page, sample `/v1/info` output shows `"version": "0.14.2"`.
   Latest GitHub release is v0.14.3 (2026-10-15). Cosmetic.
6. Docker Hub has a `farcasterxyz/snapchain:0.15.0` tag, but there is no matching
   GitHub release or tag. `docker-compose.mainnet.yml` on main uses `:latest` with
   `pull_policy: always`, so a `snapchain.sh upgrade` can pull an image newer than any
   published release notes. Suggest: compose files on release tags pin the matching image.
7. `scripts/snapchain.sh` line 72 builds `$RAWFILE_BASE/$LATEST_TAG/$file_path` with
   `LATEST_TAG="@latest"` (line 11), and the bootstrap one-liner in the docs pulls the
   script from `refs/heads/main`. There is no way to install a specific release.
   Suggest a `SNAPCHAIN_VERSION` override that fetches `v$VERSION/...` and pins the image.
   (This repo's `remote/node-setup.sh` does exactly that.)

## farcasterxyz/docs (storage)

8. `docs/learn/what-is-farcaster/messages.md`, "Storage" section: lists per-unit limits
   of 5000 casts / 2500 reactions / 2500 links / 50 profile data / 50 verifications and "$7".
   `getDefaultStoreLimit()` in `@farcaster/core` 0.20.0 gives, for legacy units,
   5000 / 2500 / 2500 / 50 / **25** verifications, and for `UNIT_TYPE_2024` units
   2000 casts / 1000 reactions / 1000 links / 50 / 25. The page also still says "Hubs".
   It should describe both unit types (or link to `/v1/storageLimitsByFid`) rather than
   one table.
