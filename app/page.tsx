"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ARTISTS, EVENT } from "../lib/config";
import { computeQf } from "../lib/qf";
import { aggregate, buildTipTx, fetchTips, Tip } from "../lib/tips";
import Simulator from "../components/Simulator";

// ウォレットボタンはブラウザでのみ描画（SSRとの不一致を避ける）
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const AMOUNTS = [0.01, 0.05, 0.1];
const short = (s: string) => s.slice(0, 4) + "…" + s.slice(-4);
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; sig?: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTips(await fetchTips(connection));
    } catch (e) {
      setToast({ text: "履歴の取得に失敗しました（RPCの混雑かも）: " + (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    reload();
  }, [reload]);

  const rows = useMemo(() => {
    const r = computeQf(aggregate(tips), EVENT.matchingPoolSol);
    return Object.fromEntries(r.map((x) => [x.id, x]));
  }, [tips]);
  const maxMatch = Math.max(0.0001, ...Object.values(rows).map((r) => r.match));

  async function tip(artistId: string, sol: number) {
    if (!publicKey) return;
    setSending(true);
    setToast({ text: "ウォレットで承認してください…" });
    try {
      const tx = buildTipTx(publicKey, artistId, sol);
      const sig = await sendTransaction(tx, connection);
      setToast({ text: "送信しました。確定を待っています…", sig });
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      setToast({ text: `${sol} SOL の投げ銭が確定しました！`, sig });
      await reload();
    } catch (e) {
      const msg = (e as Error).message;
      setToast({
        text: /reject/i.test(msg) ? "投げ銭をキャンセルしました" : "失敗しました: " + msg,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main>
      <header className="top">
        <div className="logo">
          Oshi<span>Pool</span>
        </div>
        <WalletMultiButton />
      </header>

      <div className="hero">
        <h1>{EVENT.title}</h1>
        <p>
          {EVENT.subtitle} ・ 投げ銭の「額」ではなく「応援する人の多さ」でスポンサー資金が配分されます。
        </p>
        <div className="pool">
          <span className="muted">マッチングプール</span>
          <b>{EVENT.matchingPoolSol} SOL</b>
          <span className="muted">by {EVENT.sponsor}</span>
        </div>
      </div>

      {toast && (
        <div className="toast">
          {toast.text}{" "}
          {toast.sig && (
            <a href={explorer(toast.sig)} target="_blank" rel="noreferrer">
              Explorerで見る ↗
            </a>
          )}
        </div>
      )}

      <div className="grid">
        {ARTISTS.map((a) => {
          const r = rows[a.id];
          return (
            <div className="card" key={a.id} style={{ ["--c" as string]: a.color }}>
              <div className="tag">{a.tagline}</div>
              <h3>{a.name}</h3>
              <div className="stats">
                <div className="stat">
                  <small>応援した人数</small>
                  <b>{r?.supporters ?? 0}人</b>
                </div>
                <div className="stat">
                  <small>直接の投げ銭</small>
                  <b>{(r?.total ?? 0).toFixed(3)}</b>
                </div>
                <div className="stat match" style={{ gridColumn: "1 / -1" }}>
                  <small>マッチング配分（二次ファンディング）</small>
                  <b>{(r?.match ?? 0).toFixed(3)} SOL</b>
                  <div className="bar">
                    <div style={{ width: `${((r?.match ?? 0) / maxMatch) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="tipRow">
                {AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    className="tip"
                    disabled={!publicKey || sending}
                    onClick={() => tip(a.id, amt)}
                  >
                    {amt} SOL
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!publicKey && (
        <p className="muted" style={{ fontSize: 13 }}>
          右上からウォレット（Devnet）を接続すると投げ銭できます。
        </p>
      )}

      <section>
        <h2>しくみ</h2>
        <p className="lead">
          各推しへのマッチング額は、ファン i の投げ銭を cᵢ として次の式で決まります（合計がプールを超えたら按分）。
        </p>
        <div className="formula">マッチング ∝ (Σ√cᵢ)² − Σcᵢ</div>
        <p className="lead" style={{ marginTop: 12 }}>
          1人の大口より、大勢の小口の方が大きく報われます。下の計算機で試せます。
        </p>
        <Simulator pool={EVENT.matchingPoolSol} />
      </section>

      <section>
        <h2>
          最近の投げ銭{" "}
          <button className="ghost" onClick={reload} disabled={loading}>
            {loading ? "読み込み中…" : "更新"}
          </button>
        </h2>
        <p className="lead">すべてSolana devnet上の実トランザクションです。</p>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ファン</th>
                <th>推し</th>
                <th className="num">額 (SOL)</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {tips.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {loading ? "読み込み中…" : "まだ投げ銭はありません"}
                  </td>
                </tr>
              )}
              {tips.slice(0, 30).map((t) => (
                <tr key={t.sig + t.artistId}>
                  <td>{short(t.donor)}</td>
                  <td>{ARTISTS.find((a) => a.id === t.artistId)?.name}</td>
                  <td className="num">{t.sol}</td>
                  <td>
                    <a href={explorer(t.sig)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                      {short(t.sig)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
