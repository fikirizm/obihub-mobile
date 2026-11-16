// Şifre sıfırlama kuralı (saf modül; birim testi dev/test-password-rule.mjs).
// Sunucu (POST /auth/password-reset/confirm): en az 8 karakter, en az bir harf ve bir rakam, e-postayla aynı olamaz;
// zayıf şifrede 400 {code: "PASSWORD_WEAK", detail: "<Türkçe metin>"}.  İstemci aynı kuralı göndermeden önce denetler.

export const PASSWORD_HINT = "En az 8 karakter, harf ve rakam";

export function passwordProblem(password: string, email: string): string | null {
  const pw = String(password ?? "");
  if (pw.length < 8) return "Şifre en az 8 karakter olmalıdır.";
  if (!/\p{L}/u.test(pw)) return "Şifre en az bir harf içermelidir.";
  if (!/\p{Nd}/u.test(pw)) return "Şifre en az bir rakam içermelidir.";
  const e = String(email ?? "").trim().toLocaleLowerCase("tr-TR");
  if (e && pw.trim().toLocaleLowerCase("tr-TR") === e) return "Şifre e-posta adresinizle aynı olamaz.";
  return null;
}

// 17 Kas 2026: mobil şifre sıfırlama kodu Turnstile'sız mobil uçtan istenir (web ucu Turnstile belirteci ister → 400 TURNSTILE_REQUIRED).
export const RESET_REQUEST_PATH = "/auth/mobile/password-reset/request-code";

const generic = (m: string) => !m || /^Sunucu hatası/.test(m);
const waitText = (sec: number) => (sec >= 120 ? `${Math.ceil(sec / 60)} dakika` : `${Math.round(sec)} saniye`);

// Kod isteme: 429 RATE_LIMITED (aynı adrese 45 sn, saatte 5, IP sınırı) + Retry-After; 422 biçim; 400 MAIL_UNAVAILABLE.
export function requestCodeErrorText(e: any): string {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  const status = Number(e?.status);
  if (status === 429) {
    const sec = Number(e?.retryAfter);
    if (Number.isFinite(sec) && sec > 0) return `Çok sık istek gönderildi. ${waitText(sec)} sonra yeniden deneyin.`;
    return generic(msg) ? "Çok sık istek gönderildi. Biraz sonra yeniden deneyin." : msg;
  }
  if (status === 422) return generic(msg) ? "Geçerli bir e-posta adresi girin." : msg;
  if (e?.code === "MAIL_UNAVAILABLE") return generic(msg) ? "E-posta gönderimi şu an kullanılamıyor. Biraz sonra yeniden deneyin." : msg;
  return generic(msg) ? "Kod gönderilemedi. Lütfen tekrar deneyin." : msg;
}

const CONFIRM_TEXT: Record<string, string> = {
  CODE_INVALID: "Kod hatalı. Kontrol edip yeniden deneyin.",
  CODE_LOCKED: "5 yanlış deneme yapıldı; bu kod kilitlendi. Yeni kod isteyin.",
  CODE_EXPIRED: "Kodun süresi doldu. Yeni kod isteyin.",
  CODE_NOT_FOUND: "Bu e-posta için geçerli kod yok. Yeni kod isteyin.",
};
export function resetErrorText(e: any): string {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (e?.code === "PASSWORD_WEAK") return msg || "Şifre en az 8 karakter olmalı, harf ve rakam içermeli ve e-posta adresinizle aynı olmamalıdır.";
  if (e?.code && CONFIRM_TEXT[e.code]) return generic(msg) ? CONFIRM_TEXT[e.code] : msg;
  return generic(msg) ? "Şifre sıfırlanamadı. Kodu kontrol edin." : msg;
}
