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

export function resetErrorText(e: any): string {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (e?.code === "PASSWORD_WEAK") return msg || "Şifre en az 8 karakter olmalı, harf ve rakam içermeli ve e-posta adresinizle aynı olmamalıdır.";
  return msg || "Şifre sıfırlanamadı. Kodu kontrol edin.";
}
