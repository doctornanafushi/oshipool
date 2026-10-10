import { Buffer } from "buffer";
import {
  Connection,
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { ARTISTS, MEMO_PREFIX, MEMO_PROGRAM_ID } from "./config";
import type { Contributions } from "./qf";

// 投げ銭トランザクション = SOL送金 + メモ（どの推しへの応援かをタグ付け）
export function buildTipTx(from: PublicKey, artistId: string, sol: number): Transaction {
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
      data: Buffer.from(MEMO_PREFIX + artistId, "utf8"),
    })
  );
  return tx;
}

export type Tip = { donor: string; artistId: string; sol: number; sig: string; time: number };

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
    // 公開RPCのレート制限を避けるため、少しずつ取得する
    for (let i = 0; i < ok.length; i += 5) {
      const chunk = ok.slice(i, i + 5);
      const txs = await Promise.all(
        chunk.map((s) =>
          conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
        )
      );
      txs.forEach((tx, j) => {
        if (!tx) return;
        const ixs = tx.transaction.message.instructions;
        const memo = ixs.find(
          (ix) => ix.programId.toBase58() === MEMO_PROGRAM_ID && isParsed(ix)
        ) as ParsedInstruction | undefined;
        const memoText = typeof memo?.parsed === "string" ? memo.parsed : "";
        if (memoText !== MEMO_PREFIX + artist.id) return;
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
          });
        }
      });
    }
  }
  return tips.sort((a, b) => b.time - a.time);
}

// 推しごと・ファンごとに合計する（同じ人の複数回の投げ銭は合算）
export function aggregate(tips: Tip[]): Record<string, Contributions> {
  const out: Record<string, Contributions> = {};
  for (const a of ARTISTS) out[a.id] = {};
  for (const t of tips) {
    out[t.artistId][t.donor] = (out[t.artistId][t.donor] ?? 0) + t.sol;
  }
  return out;
}
