// ===== 二次ファンディング（Quadratic Funding）の計算 =====
//
// 各推し k について、ファン i の合計投げ銭額を c_i とすると
//   理想マッチング額 raw_k = (Σ√c_i)² − Σc_i
// raw_k の合計がプールを超える場合は、プールを raw_k の比で按分する。
//
// 直感: 同じ合計額でも「少数の大口」より「多数の小口」の方が (Σ√c_i)² が大きくなる。

export type Contributions = Record<string, number>; // donor -> 合計額

export type QfRow = {
  id: string;
  total: number; // 直接の投げ銭合計
  supporters: number; // 応援した人数（ユニークウォレット数）
  sqrtSum: number; // Σ√c_i
  raw: number; // (Σ√c_i)² − Σc_i
  match: number; // 実際に配分されるマッチング額
  proportionalMatch: number; // 比較用: 合計額に比例して配分した場合
};

export function computeQf(
  byProject: Record<string, Contributions>,
  pool: number
): QfRow[] {
  const rows = Object.entries(byProject).map(([id, contribs]) => {
    const amounts = Object.values(contribs).filter((c) => c > 0);
    const total = amounts.reduce((a, b) => a + b, 0);
    const sqrtSum = amounts.reduce((a, c) => a + Math.sqrt(c), 0);
    const raw = Math.max(0, sqrtSum * sqrtSum - total);
    return { id, total, supporters: amounts.length, sqrtSum, raw, match: 0, proportionalMatch: 0 };
  });

  const rawSum = rows.reduce((a, r) => a + r.raw, 0);
  const totalSum = rows.reduce((a, r) => a + r.total, 0);
  const scale = rawSum > pool && rawSum > 0 ? pool / rawSum : 1;

  for (const r of rows) {
    r.match = r.raw * scale;
    r.proportionalMatch = totalSum > 0 ? (pool * r.total) / totalSum : 0;
  }
  return rows;
}
