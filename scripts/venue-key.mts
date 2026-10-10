// 会場（主催者）の ed25519 鍵ペアを読み込む。なければ作成して、公開鍵を lib/venue.ts に書き込む。
// 秘密鍵は scripts/venue-secret.json に保存（.gitignore 済み。絶対に公開しない）。

import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
import bs58 from "bs58";

const SECRET_PATH = path.join(process.cwd(), "scripts", "venue-secret.json");
const PUB_TS_PATH = path.join(process.cwd(), "lib", "venue.ts");

export function loadVenueKey(): nacl.SignKeyPair {
  let kp: nacl.SignKeyPair;
  if (fs.existsSync(SECRET_PATH)) {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(SECRET_PATH, "utf8")));
    kp = nacl.sign.keyPair.fromSecretKey(secret);
  } else {
    kp = nacl.sign.keyPair();
    fs.writeFileSync(SECRET_PATH, JSON.stringify(Array.from(kp.secretKey)));
    console.log("会場の鍵ペアを新しく作りました（scripts/venue-secret.json）。");
  }

  // アプリが検証に使う公開鍵を lib/venue.ts に反映
  const pub = bs58.encode(kp.publicKey);
  const current = fs.existsSync(PUB_TS_PATH) ? fs.readFileSync(PUB_TS_PATH, "utf8") : "";
  if (!current.includes(`"${pub}"`)) {
    fs.writeFileSync(
      PUB_TS_PATH,
      `// 会場（主催者）の公開鍵。scripts/venue-key.mts が自動で書き込む。\n` +
        `// 空のあいだは来場証明の検証が無効（全員「証明なし」扱い）。\n` +
        `export const VENUE_PUBKEY = "${pub}";\n`
    );
    console.log(`会場の公開鍵を lib/venue.ts に書き込みました: ${pub}`);
  }
  return kp;
}
