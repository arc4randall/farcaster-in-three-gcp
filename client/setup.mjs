// Import a seed phrase, find its FID, and give this client its own app key.
//   node setup.mjs            -> gasless KEY_ADD message (FIP-272). Default. No ETH needed.
//   node setup.mjs --onchain  -> legacy KeyGateway.add on Optimism (one tx, needs a little ETH)
// The seed phrase is read in this terminal, used in memory to sign two EIP-712
// messages, and dropped. It is never written to disk or sent anywhere.
// Only the new Ed25519 app key is saved (data/signer.json, mode 600).
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import {
  NobleEd25519Signer, ViemLocalEip712Signer, ID_REGISTRY_ADDRESS, idRegistryABI,
  KEY_GATEWAY_ADDRESS, keyGatewayABI, makeKeyAddBody, makeKeyAdd, MessageType,
  FarcasterNetwork, getFarcasterTime, MAX_KEY_TTL_SECONDS,
} from "@farcaster/hub-nodejs";
import { createPublicClient, createWalletClient, http as viemHttp, bytesToHex, formatEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { optimism } from "viem/chains";
import { cfg, rpc, submit, signerFile } from "./lib.mjs";

const gasless = !process.argv.includes("--onchain");
const idx = Number(process.env.ACCOUNT_INDEX ?? 0);
const pub = createPublicClient({ chain: optimism, transport: viemHttp(cfg.opRpc) });

async function ask(q, hidden = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
  const a = await rl.question(q); rl.close(); if (hidden) process.stdout.write("\n"); return a.trim();
}
async function fidOf(address) {
  return pub.readContract({ address: ID_REGISTRY_ADDRESS, abi: idRegistryABI, functionName: "idOf", args: [address] });
}

if (fs.existsSync(signerFile())) { console.log(`Key already exists at ${signerFile()}. Delete it to start over.`); process.exit(0); }

const phrase = process.env.SEED_PHRASE ?? await ask("Seed phrase of the account's custody wallet (not shown): ", true);
const custody = mnemonicToAccount(phrase, { addressIndex: idx });
const fid = await fidOf(custody.address);
if (fid === 0n) { console.error(`${custody.address} owns no FID. Wrong phrase, or try ACCOUNT_INDEX=1.`); process.exit(1); }
console.log(`custody ${custody.address} -> fid ${fid}`);

// The app that requests the key. Default: your own FID acts as the app.
// Set APP_SEED_PHRASE to sign as a separate app FID (e.g. one you registered for this client).
const appAcct = process.env.APP_SEED_PHRASE ? mnemonicToAccount(process.env.APP_SEED_PHRASE) : custody;
const appFid = appAcct === custody ? fid : await fidOf(appAcct.address);
if (appFid === 0n) { console.error("APP_SEED_PHRASE owns no FID"); process.exit(1); }
console.log(`app fid ${appFid} will be recorded as the requester of this key`);

const priv = randomBytes(32);
const signer = new NobleEd25519Signer(priv);
const pubKey = (await signer.getSignerKey())._unsafeUnwrap();
const custodySigner = new ViemLocalEip712Signer(custody);
const appSigner = new ViemLocalEip712Signer(appAcct);

if (!gasless) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const meta = (await appSigner.getSignedKeyRequestMetadata({ requestFid: appFid, key: pubKey, deadline }))._unsafeUnwrap();
  const args = [1, bytesToHex(pubKey), 1, bytesToHex(meta)];
  const gas = await pub.estimateContractGas({ address: KEY_GATEWAY_ADDRESS, abi: keyGatewayABI, functionName: "add", args, account: custody });
  const price = await pub.getGasPrice();
  const bal = await pub.getBalance({ address: custody.address });
  console.log(`KeyGateway.add: ~${gas} gas, ~${formatEther(gas * price)} ETH; balance ${formatEther(bal)} ETH`);
  if (bal < gas * price * 2n) { console.error("Not enough ETH on Optimism for gas. Send a little (0.0005 ETH is plenty) or run without --onchain."); process.exit(1); }
  if ((await ask("Send the transaction? [y/N] ")).toLowerCase() !== "y") process.exit(1);
  const wallet = createWalletClient({ account: custody, chain: optimism, transport: viemHttp(cfg.opRpc) });
  const tx = await wallet.writeContract({ address: KEY_GATEWAY_ADDRESS, abi: keyGatewayABI, functionName: "add", args });
  console.log(`tx https://optimistic.etherscan.io/tx/${tx}`);
  const rc = await pub.waitForTransactionReceipt({ hash: tx });
  if (rc.status !== "success") { console.error("transaction reverted"); process.exit(1); }
} else {
  const s = await rpc.getSignersByFid({ fid: Number(fid) });
  if (s.isErr()) throw new Error(s.error.message);
  const now = getFarcasterTime()._unsafeUnwrap();
  const body = (await makeKeyAddBody({
    fid, key: pubKey, nonce: s.value.currentUserNonce + 1, deadline: now + 3600,
    ttl: MAX_KEY_TTL_SECONDS, requestFid: appFid,
    scopes: [MessageType.CAST_ADD, MessageType.CAST_REMOVE, MessageType.REACTION_ADD,
             MessageType.REACTION_REMOVE, MessageType.LINK_ADD, MessageType.LINK_REMOVE],
  }, custodySigner, appSigner))._unsafeUnwrap();
  const msg = (await makeKeyAdd(body, { fid: Number(fid), network: FarcasterNetwork.MAINNET }, signer))._unsafeUnwrap();
  console.log("KEY_ADD submitted", await submit(msg));
}

fs.mkdirSync(cfg.dataDir, { recursive: true });
fs.writeFileSync(signerFile(), JSON.stringify({ fid: Number(fid), appFid: Number(appFid), privateKey: bytesToHex(priv), publicKey: bytesToHex(pubKey), mode: gasless ? "gasless" : "onchain" }, null, 2), { mode: 0o600 });
process.stdout.write("Waiting for your node to see the key");
for (let i = 0; i < 90; i++) {
  const r = await rpc.getSignersByFid({ fid: Number(fid) });
  if (r.isOk() && r.value.signers.some((x) => bytesToHex(x.key) === bytesToHex(pubKey))) { console.log("\nKey is live. Start the client: npm start"); process.exit(0); }
  process.stdout.write("."); await new Promise((r) => setTimeout(r, 2000));
}
console.log("\nNot visible yet. If the node is still syncing it will appear once it catches up.");
process.exit(0);
