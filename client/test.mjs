// Offline self-test: builds a KEY_ADD and a cast with throwaway keys and runs the
// same validation the node runs before accepting them. `npm test`. No network.
import { NobleEd25519Signer, ViemLocalEip712Signer, makeKeyAddBody, makeKeyAdd, makeCastAdd, MessageType, FarcasterNetwork, getFarcasterTime, MAX_KEY_TTL_SECONDS, validations, Message } from "@farcaster/hub-nodejs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
const acct = privateKeyToAccount(generatePrivateKey()); const s = new NobleEd25519Signer(randomBytes(32));
const key = (await s.getSignerKey())._unsafeUnwrap(); const now = getFarcasterTime()._unsafeUnwrap();
const body = (await makeKeyAddBody({ fid: 123n, key, nonce: 1, deadline: now+3600, ttl: MAX_KEY_TTL_SECONDS, requestFid: 123n, scopes:[MessageType.CAST_ADD, MessageType.LINK_ADD, MessageType.REACTION_ADD, MessageType.CAST_REMOVE, MessageType.LINK_REMOVE, MessageType.REACTION_REMOVE]}, new ViemLocalEip712Signer(acct)))._unsafeUnwrap();
const m = (await makeKeyAdd(body, { fid: 123, network: FarcasterNetwork.MAINNET }, s))._unsafeUnwrap();
console.log("keyadd valid:", (await validations.validateMessage(m)).isOk(), Message.encode(m).finish().length, "bytes");
const c = (await makeCastAdd({ text:"hi", embeds:[], embedsDeprecated:[], mentions:[], mentionsPositions:[], type:0 }, { fid:123, network: FarcasterNetwork.MAINNET }, s))._unsafeUnwrap();
console.log("cast valid:", (await validations.validateMessage(c)).isOk());
