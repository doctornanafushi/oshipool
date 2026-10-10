// ===== 入場ゲート（デモ）：ファンのウォレットアドレスに来場証明を発行する =====
//
// 使い方:
//   npm run pass -- <ファンのウォレットアドレス>
//
// 本番では、入場ゲートの端末がチケットとウォレットのQRを読み取り、1チケットにつき1回だけ発行する想定。

import { PublicKey } from "@solana/web3.js";
import { EVENT } from "../lib/config.ts";
import { issuePass, verifyPass } from "../lib/pass.ts";
import { loadVenueKey } from "./venue-key.mts";
import bs58 from "bs58";

const wallet = process.argv[2];
if (!wallet) {
  console.log("使い方: npm run pass -- <ファンのウォレットアドレス>");
  process.exit(1);
}
try {
  new PublicKey(wallet);
} catch {
  console.log("ウォレットアドレスの形式が正しくありません: " + wallet);
  process.exit(1);
}

const venue = loadVenueKey();
const pass = issuePass(venue.secretKey, EVENT.id, wallet);
const ok = verifyPass(bs58.encode(venue.publicKey), EVENT.id, wallet, pass);

console.log(`\n来場証明を発行しました（${EVENT.title} / ${wallet.slice(0, 4)}…${wallet.slice(-4)}）`);
console.log(`検証: ${ok ? "OK" : "NG"}\n`);
console.log("来場証明コード:");
console.log("  " + pass + "\n");
console.log("このURLを開くと自動で入力されます（同じウォレットで接続してください）:");
console.log(`  http://localhost:3000/?pass=${pass}\n`);
