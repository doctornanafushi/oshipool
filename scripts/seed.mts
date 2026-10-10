// ===== デモ用：大勢のファンからの投げ銭をシミュレーションするスクリプト =====
//
// 使い方:
//   npm run seed            … 実行（初回は資金係ウォレットを作って終了）
//   npm run seed -- --dry   … 何も送らずに計画だけ表示
//   npm run seed -- --attendees … 「会場で来場証明を受け取った本物の来場者」の投げ銭を追加
//
// しくみ:
//   「資金係（funder）」ウォレットが、ファンごとに新しいウォレットを作り、
//   1つのトランザクションの中で
//     資金係 → ファン へ c SOL 送金
//     ファン → 推し   へ c SOL 投げ銭（＋アプリと同じメモ）
//   を行う。手数料は資金係が払い、ファンの残高は最後に0になる。
//
// ※ 1人が大量のウォレットを作って投げ銭する、という点で
//   これは二次ファンディングに対する「シビル攻撃」そのもの。
//   → 対策が案C（来場証明の電子署名）。ピッチのネタにどうぞ。

import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ARTISTS, EVENT, MEMO_PREFIX, MEMO_PROGRAM_ID } from "../lib/config.ts";
import { issuePass } from "../lib/pass.ts";
import { loadVenueKey } from "./venue-key.mts";

// ---- ここを書き換えればシナリオを変えられる ----
type Step = { artist: string; fans: number; each: number; verified?: boolean };

// 通常: 3組とも「直接の合計は0.1 SOL」で同じ。違うのは応援した人数だけ。（来場証明なし）
const PLAN_DEFAULT: Step[] = [
  { artist: "lumina", fans: 1, each: 0.1 }, //   大口1人
  { artist: "kagerou", fans: 20, each: 0.005 }, // 小口20人
  { artist: "shirokuma", fans: 5, each: 0.02 }, // 中口5人
];

// --attendees: 会場で来場証明を受け取った来場者の投げ銭（少額）
const PLAN_ATTENDEES: Step[] = [
  { artist: "shirokuma", fans: 6, each: 0.005, verified: true },
  { artist: "lumina", fans: 2, each: 0.005, verified: true },
];
// ------------------------------------------------

const DRY = process.argv.includes("--dry");
const PLAN = process.argv.includes("--attendees") ? PLAN_ATTENDEES : PLAN_DEFAULT;
const FUNDER_PATH = path.join(process.cwd(), "scripts", "funder.json");
const RPC = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOrCreateFunder(): Keypair | null {
  if (fs.existsSync(FUNDER_PATH)) {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(FUNDER_PATH, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  fs.writeFileSync(FUNDER_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log("\n資金係ウォレットを作りました（scripts/funder.json）。");
  console.log("このアドレスに devnet SOL を送ってから、もう一度 npm run seed を実行してください:\n");
  console.log("  " + kp.publicKey.toBase58() + "\n");
  console.log(`必要額の目安: ${(needed() + 0.01).toFixed(3)} SOL（Phantomの「送信」から送れます）`);
  return null;
}

function needed() {
  return PLAN.reduce((a, p) => a + p.fans * p.each, 0);
}

async function main() {
  console.log("=== 投げ銭シナリオ ===");
  for (const p of PLAN) {
    const name = ARTISTS.find((a) => a.id === p.artist)?.name ?? p.artist;
    console.log(
      `  ${name}: ${p.fans}人 × ${p.each} SOL = ${(p.fans * p.each).toFixed(3)} SOL` +
        (p.verified ? "（来場証明あり）" : "")
    );
  }
  console.log(`  合計: ${needed().toFixed(3)} SOL（＋手数料 少々）\n`);
  if (DRY) return;

  const funder = loadOrCreateFunder();
  if (!funder) return;

  const conn = new Connection(RPC, "confirmed");
  const bal = (await conn.getBalance(funder.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`資金係: ${funder.publicKey.toBase58()}  残高 ${bal} SOL`);
  if (bal < needed() + 0.005) {
    console.log(`残高が足りません。あと ${(needed() + 0.005 - bal).toFixed(3)} SOL ほど送ってください。`);
    return;
  }

  const venue = PLAN.some((p) => p.verified) ? loadVenueKey() : null;

  let n = 0;
  const total = PLAN.reduce((a, p) => a + p.fans, 0);
  for (const p of PLAN) {
    const artist = ARTISTS.find((a) => a.id === p.artist);
    if (!artist) throw new Error("unknown artist: " + p.artist);
    const lamports = Math.round(p.each * LAMPORTS_PER_SOL);

    for (let i = 0; i < p.fans; i++) {
      const fan = Keypair.generate();
      // 来場者なら、会場がこのファンのアドレスに来場証明を発行してメモに添える
      const pass =
        p.verified && venue ? ":" + issuePass(venue.secretKey, EVENT.id, fan.publicKey.toBase58()) : "";
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: fan.publicKey, lamports }),
        SystemProgram.transfer({ fromPubkey: fan.publicKey, toPubkey: new PublicKey(artist.wallet), lamports }),
        new TransactionInstruction({
          programId: new PublicKey(MEMO_PROGRAM_ID),
          keys: [{ pubkey: fan.publicKey, isSigner: true, isWritable: false }],
          data: Buffer.from(MEMO_PREFIX + artist.id + pass, "utf8"),
        })
      );
      tx.feePayer = funder.publicKey;

      // 公開RPCは不安定なことがあるので、失敗したら少し待って最大3回やり直す
      for (let attempt = 1; ; attempt++) {
        try {
          const sig = await sendAndConfirmTransaction(conn, tx, [funder, fan]);
          n++;
          console.log(
            `[${n}/${total}] ${artist.name} ← ${p.each} SOL${pass ? " ✓来場証明" : ""}  ${sig.slice(0, 12)}…`
          );
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          console.log(`  失敗したのでやり直します (${attempt}/3): ${(e as Error).message.slice(0, 80)}`);
          await sleep(2000 * attempt);
        }
      }
      await sleep(300);
    }
  }
  console.log("\n完了！ブラウザで「更新」を押すと反映されます。");
}

main().catch((e) => {
  console.error("\nエラー:", e);
  process.exit(1);
});
