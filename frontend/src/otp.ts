// İlk girişte e-posta doğrulama kodu (saf modül; birim testi dev/test-otp.mjs). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md.
export const OTP_LENGTH = 6;

// Yalnız rakamlar, en çok 6 hane (yapıştırılan ya da e-postadan otomatik doldurulan metinden ayıklanır).
export const normalizeOtp = (text: unknown) => String(text ?? "").replace(/\D/g, "").slice(0, OTP_LENGTH);
export const otpComplete = (code: string) => new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
export const otpBoxes = (code: string) => Array.from({ length: OTP_LENGTH }, (_, i) => code[i] || "");
export const activeBox = (code: string) => Math.min(code.length, OTP_LENGTH - 1);

export const secondsLeft = (untilMs: number, now = Date.now()) => Math.max(0, Math.ceil((untilMs - now) / 1000));
export function resendLabel(seconds: number) {
  if (seconds <= 0) return "Kodu yeniden gönder";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `Yeniden gönder (${m}:${s})`;
}

export function maskEmail(email: string) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return String(email || "");
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}${"•".repeat(Math.max(1, local.length - keep))}@${domain}`;
}
