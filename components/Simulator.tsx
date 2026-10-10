"use client";

import { useMemo, useState } from "react";
import { computeQf, Contributions } from "../lib/qf";

// ピッチ用: 「クジラ1人 vs 小口の大勢」をその場で比べられる計算機（オンチェーンとは無関係）
const PRESET = {
  A: "2",
  B: "0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1",
};

function parse(s: string): Contributions {
  const out: Contributions = {};
  s.split(/[,\s]+/).forEach((v, i) => {
    const n = parseFloat(v);
    if (n > 0) out["fan" + i] = n;
  });
  return out;
}

export default function Simulator({ pool }: { pool: number }) {
  const [a, setA] = useState(PRESET.A);
  const [b, setB] = useState(PRESET.B);
  const rows = useMemo(() => computeQf({ A: parse(a), B: parse(b) }, pool), [a, b, pool]);

  return (
    <div className="sim card">
      <label>推しA へのファンごとの投げ銭（SOL, カンマ区切り）</label>
      <textarea rows={2} value={a} onChange={(e) => setA(e.target.value)} />
      <label>推しB へのファンごとの投げ銭（SOL, カンマ区切り）</label>
      <textarea rows={3} value={b} onChange={(e) => setB(e.target.value)} />
      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>推し</th>
              <th className="num">人数</th>
              <th className="num">直接の合計</th>
              <th className="num">単純比例の配分</th>
              <th className="num">二次ファンディング</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td className="num">{r.supporters}</td>
                <td className="num">{r.total.toFixed(2)}</td>
                <td className="num">{r.proportionalMatch.toFixed(2)}</td>
                <td className="num">
                  <b>{r.match.toFixed(2)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        直接の合計が同じ 2 SOL でも、20人に支えられた推しBの方がマッチングを多く受け取ります。
      </p>
    </div>
  );
}
