// ===== ライブ設定（ここを書き換えればイベントを差し替えられる） =====

export const EVENT = {
  id: "tdlive2026",
  title: "TOKYO DOME LIVE 2026",
  subtitle: "架空のライブイベント（デモ）",
  sponsor: "東京ドーム（想定スポンサー）",
  // スポンサーが用意するマッチングプール（SOL）。デモでは表示上の金額。
  matchingPoolSol: 2,
};

export type Artist = {
  id: string;
  name: string;
  tagline: string;
  color: string;
  wallet: string; // 投げ銭の受け取りアドレス（devnet）
};

// 受け取りアドレスはデモ用に生成したもの。自分で作ったウォレットに差し替えてOK。
export const ARTISTS: Artist[] = [
  {
    id: "lumina",
    name: "ルミナ・ソワレ",
    tagline: "光で歌うドリームポップ",
    color: "#ff5fa2",
    wallet: "BJyP8cAzBVojyRX72VuEN2XwNthkkzFTiVarp5y4bkm5",
  },
  {
    id: "kagerou",
    name: "KAGEROU 404",
    tagline: "ノイズと轟音のロックバンド",
    color: "#38d9ff",
    wallet: "H4TJfHVhw6vm6csdqnFQnHNFppxmwyVSeAqLEtr1puz6",
  },
  {
    id: "shirokuma",
    name: "しろくまオーケストラ",
    tagline: "ゆるふわ大編成インスト",
    color: "#ffd166",
    wallet: "FKyEw77xm3PFdE5KE8hRPmiFVZ1JsyfPuCapS4gz1aSC",
  },
];

// メモに埋め込むタグ。このアプリ経由の投げ銭だけを数えるために使う。
export const MEMO_PREFIX = `oshipool:v1:${EVENT.id}:`;
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
