// ===== 来場証明（Proof of Attendance）=====
//
// 会場（主催者）は ed25519 の鍵ペアを持ち、入場ゲートでファンのウォレットアドレスに対して
//   message = "oshipool:attend:v1:<eventId>:<ファンのアドレス>"
// に署名する。この署名（base58文字列）が「来場証明」。
//
// ・署名はアドレスに紐づくので、他人の証明をコピーしても使えない
//   （投げ銭のメモにはファン本人の署名も必要なため、なりすましもできない）
// ・会場の公開鍵さえあれば、誰でもオンチェーンのデータから検証できる
// ・1枚のチケットにつき1回しか発行されないので、ウォレットを大量に作っても証明は増えない
//   → 二次ファンディングのシビル攻撃対策になる

import nacl from "tweetnacl";
import bs58 from "bs58";

export function passMessage(eventId: string, wallet: string): Uint8Array {
  return new TextEncoder().encode(`oshipool:attend:v1:${eventId}:${wallet}`);
}

// 会場側：来場証明を発行する（秘密鍵が必要。サーバーやゲート端末でのみ使う）
export function issuePass(venueSecretKey: Uint8Array, eventId: string, wallet: string): string {
  return bs58.encode(nacl.sign.detached(passMessage(eventId, wallet), venueSecretKey));
}

// 誰でも：来場証明を検証する（公開鍵だけで可能）
export function verifyPass(
  venuePubkey: string,
  eventId: string,
  wallet: string,
  pass: string
): boolean {
  if (!venuePubkey || !pass) return false;
  try {
    return nacl.sign.detached.verify(
      passMessage(eventId, wallet),
      bs58.decode(pass),
      bs58.decode(venuePubkey)
    );
  } catch {
    return false;
  }
}
