// One-time, operator only: give this client an identity (an "app FID").
// Every key the client requests is signed by the app FID's custody key, which is how
// other clients can tell your casts came from this app. Use a FID you registered for
// the app, not your personal account. Only the derived private key is stored, in
// data/app.json (mode 600) on this VM. Nothing is sent anywhere.
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { ID_REGISTRY_ADDRESS, idRegistryABI } from "@farcaster/hub-nodejs";
import { createPublicClient, http, bytesToHex } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { optimism } from "viem/chains";
import { cfg } from "./lib.mjs";
import { appFile } from "./delegated.mjs";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const q = "App FID custody seed phrase or 0x private key (not shown): ";
rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
const secret = (await rl.question(q)).trim(); rl.close(); process.stdout.write("\n");
const acct = secret.startsWith("0x") ? privateKeyToAccount(secret) : mnemonicToAccount(secret, { addressIndex: Number(process.env.ACCOUNT_INDEX ?? 0) });
const pk = secret.startsWith("0x") ? secret : bytesToHex(acct.getHdKey().privateKey);
const pub = createPublicClient({ chain: optimism, transport: http(cfg.opRpc) });
const fid = await pub.readContract({ address: ID_REGISTRY_ADDRESS, abi: idRegistryABI, functionName: "idOf", args: [acct.address] });
if (fid === 0n) { console.error(`${acct.address} owns no FID.`); process.exit(1); }
fs.mkdirSync(cfg.dataDir, { recursive: true });
fs.writeFileSync(appFile(), JSON.stringify({ appFid: Number(fid), address: acct.address, privateKey: pk }, null, 2), { mode: 0o600 });
console.log(`App FID ${fid} (${acct.address}) saved to ${appFile()}`);
