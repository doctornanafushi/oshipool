import { Buffer } from "buffer";
import {
  Connection,
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { ARTISTS, EVENT, MEMO_PREFIX, MEMO_PROGRAM_ID } from "./config";
import { verifyPass } from "./pass";
import { VENUE_PUBKEY } from "./venue";
import type { Contributions } from "./qf";

// 投げ銭トランザクション = SOL送金 + メモ（どの推しへの応援か＋来場証明があればそれも）
export function buildTipTx(
  from: PublicKey,
  artistId: string,
  sol: number,
  pass?: string
): Transaction {
  const artist = ARTISTS.find((a) => a.id === artistId);
  if (!artist) throw new Error("unknown artist");
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: new PublicKey(artist.wallet),
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    })
  );
  tx.add(
    new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [{ pubkey: from, isSigner: true, isWritable: false }],
      data: Buffer.from(MEMO_PREFIX + artistId + (pass ? ":" + pass : ""), "utf8"),
    })
  );
  return tx;
}

export type Tip = {
  donor: string;
  artistId: string;
  sol: number;
  sig: string;
  time: number;
  verified: boolean; // 有効な来場証明つきか
};

const txCache = new Map<string, ParsedTransactionWithMeta>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isParsed(ix: ParsedInstruction | PartiallyDecodedInstruction): ix is ParsedInstruction {
  return "parsed" in ix;
}

// オンチェーンの履歴を読み、このアプリ経由の投げ銭だけを抽出する
export async function fetchTips(conn: Connection, limitPerArtist = 100): Promise<Tip[]> {
  const tips: Tip[] = [];
  for (const artist of ARTISTS) {
    const sigs = await conn.getSignaturesForAddress(new PublicKey(artist.wallet), {
      limit: limitPerArtist,
    });
    const ok = sigs.filter((s) => !s.err);
    // 公開RPCのレート制限(429)を避けるため、2件ずつ間をあけて取得する。
    // 一度読んだ取引はキャッシュするので、「更新」では新しい分だけ読みに行く。
    for (let i = 0; i < ok.length; i += 2) {
      const chunk = ok.slice(i, i + 2);
      const txs = await Promise.all(
        chunk.map(async (s) => {
          if (txCache.has(s.signature)) return txCache.get(s.signature)!;
          const tx = await conn.getParsedTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (tx) txCache.set(s.signature, tx);
          await sleep(250);
          return tx;
        })
      );
      txs.forEach((tx, j) => {
        if (!tx) return;
        const ixs = tx.transaction.message.instructions;
        const memo = ixs.find(
          (ix) => ix.programId.toBase58() === MEMO_PROGRAM_ID && isParsed(ix)
        ) as ParsedInstruction | undefined;
        const memoText = typeof memo?.parsed === "string" ? memo.parsed : "";
        // メモの形式: "<prefix><推し>" または "<prefix><推し>:<来場証明>"
        const head = MEMO_PREFIX + artist.id;
        if (memoText !== head && !memoText.startsWith(head + ":")) return;
        const pass = memoText.slice(head.length + 1);
        for (const ix of ixs) {
          if (!isParsed(ix) || ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
          const info = ix.parsed.info;
          if (info.destination !== artist.wallet) continue;
          tips.push({
            donor: info.source,
            artistId: artist.id,
            sol: info.lamports / LAMPORTS_PER_SOL,
            sig: chunk[j].signature,
            time: (chunk[j].blockTime ?? 0) * 1000,
            // 証明が「この送金元アドレス宛て」に会場が署名したものかを検証
            verified: verifyPass(VENUE_PUBKEY, EVENT.id, info.source, pass),
          });
        }
      });
    }
  }
  return tips.sort((a, b) => b.time - a.time);
}

// 来場証明が確認できたファン（ウォレット）の一覧
export function verifiedDonors(tips: Tip[]): Set<string> {
  return new Set(tips.filter((t) => t.verified).map((t) => t.donor));
}

// 推しごと・ファンごとに合計する（同じ人の複数回の投げ銭は合算）
// onlyVerified = true のときは、来場証明のあるファンだけを数える
export function aggregate(tips: Tip[], onlyVerified = false): Record<string, Contributions> {
  const ok = verifiedDonors(tips);
  const out: Record<string, Contributions> = {};
  for (const a of ARTISTS) out[a.id] = {};
  for (const t of tips) {
    if (onlyVerified && !ok.has(t.donor)) continue;
    out[t.artistId][t.donor] = (out[t.artistId][t.donor] ?? 0) + t.sol;
  }
  return out;
}
