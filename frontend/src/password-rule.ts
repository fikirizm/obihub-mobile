// Şifre kuralı (saf modül; birim testi dev/test-password-rule.mjs). Yalnız YENİ şifre belirlenirken (sıfırlama); girişte denetlenmez.
// 24 Kas 2026 Amazon DPP — sunucu backend/password_policy.py, web frontend/src/lib/passwordPolicy.js ile aynı kural:
// en az 12 karakter; büyük harf, küçük harf, rakam ve özel karakter; e-postanın yerel kısmı ya da adın (≥4 harf) bir parçası geçemez.
// Son 10 şifre denetimi yalnız sunucuda (400 PASSWORD_WEAK, Türkçe detail).

export const PASSWORD_HINT = "En az 12 karakter; büyük harf, küçük harf, rakam ve özel karakter içermeli";
export const MSG_WEAK = "Şifre en az 12 karakter olmalı; büyük harf, küçük harf, rakam ve özel karakter içermeli.";
export const MSG_CONTAINS_NAME = "Şifre e-posta adresinizin ya da adınızın bir bölümünü içeremez.";
const MIN_IDENTITY_LEN = 4;

const fold = (text: string) =>
  String(text || "").replace(/İ/g, "i").replace(/ı/g, "i").replace(/I/g, "i").toLowerCase().replace(/[^0-9a-zçğöşü]/g, "");

function identityTokens(email: string, fullName?: string): string[] {
  const local = String(email || "").trim().toLowerCase().split("@")[0];
  const tokens: string[] = [];
  if (local) {
    tokens.push(fold(local));
    local.split(/[^0-9a-zçğıöşüİ]+/).forEach((p) => tokens.push(fold(p)));
  }
  String(fullName || "").trim().toLowerCase().split(/\s+/).forEach((p) => tokens.push(fold(p)));
  return Array.from(new Set(tokens)).filter((t) => t.length >= MIN_IDENTITY_LEN);
}

export function passwordProblem(password: string, email: string, fullName?: string): string | null {
  const value = String(password ?? "");
  if (value.length < 12 || !/\p{Lu}/u.test(value) || !/\p{Ll}/u.test(value) || !/\p{Nd}/u.test(value) || !/[^\p{L}\p{Nd}]/u.test(value)) return MSG_WEAK;
  const folded = fold(value);
  if (identityTokens(email, fullName).some((t) => folded.includes(t))) return MSG_CONTAINS_NAME;
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
  if (e?.code === "PASSWORD_WEAK") return generic(msg) ? MSG_WEAK : msg;
  if (e?.code && CONFIRM_TEXT[e.code]) return generic(msg) ? CONFIRM_TEXT[e.code] : msg;
  return generic(msg) ? "Şifre sıfırlanamadı. Kodu kontrol edin." : msg;
}
