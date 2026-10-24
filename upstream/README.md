# Upstream doc fixes

Small fixes to farcasterxyz/docs found while writing this tutorial. Each patch was made
against `main` on 2026-10-24 and applies with `git apply` from the repo root.

## 1. hello-world: undefined variables in the key metadata call

- Repo: `farcasterxyz/docs`
- File: `docs/developers/guides/basics/hello-world.md` (lines 144-148)
- Patch: `01-docs-hello-world-undefined-vars.patch`

PR title: `hello-world: pass fid and public key to getSignedKeyRequestMetadata`

> `getOrRegisterAccountKey` passes `APP_FID` and `APP_PRIVATE_KEY` to
> `getSignedKeyRequestMetadata`, but neither is defined anywhere in the guide, so the
> example doesn't compile. The values in scope are `fid` (the function's argument) and
> `publicKey` (hex, from `toHex(ed25519.getPublicKey(...))`). The metadata has to sign the
> public key, not a private one, and `SignedKeyRequestMessage` takes `bigint` for
> `requestFid` and `deadline` and `Uint8Array` for `key`, so this converts them.

## 2. signer-requests: step 3 snippet uses names from nowhere

- Repo: `farcasterxyz/docs`
- File: `docs/reference/farcaster/signer-requests.md` (lines 63, 96-97)
- Patch: `02-docs-signer-requests-undefined-vars.patch`

PR title: `signer-requests: use the variables defined in step 2`

> Step 2 defines `key` and `appFid`; step 3 posts `key: publicKey` and `requestFid: fid`,
> which don't exist. The full example further down the page already does it right
> (`key`, `requestFid: appFid`). Also fixes the `APP_MNENOMIC` typo in step 2, which
> breaks anyone who copies the env var name.

## 3. architecture overview: keys aren't onchain-only anymore

- Repo: `farcasterxyz/docs`
- File: `docs/learn/architecture/overview.md` (line 15)
- Patch: `03-docs-overview-gasless-keys.patch`

PR title: `overview: mention gasless KEY_ADD next to onchain key adds`

> The overview lists adding app keys only under onchain actions. Since Snapchain engine
> V16 (FIP-272) a key can also be added with an offchain `KEY_ADD` message, no
> transaction. One sentence plus a link to the Snapchain guide that documents it.

Not included: the storage-limit table in `messages.md` (item 8 in `../NOTES-upstream.md`)
needs someone who knows which unit type is currently sold, so we left it as a note.
