// Yeni cihazda e-posta kodu ile giriş (saf modül; birim testi dev/test-mobile-auth.mjs). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md §1.
// Cihaz kimliği bir kez üretilir ve SecureStore'da kalır (çıkışta silinmez); uygulama silinip kurulursa yeni cihaz = yeniden kod.

export type DeviceCtx = { deviceId: string; deviceName: string; platform: string; appVersion: string };

// UUID v4 biçimi (gizli değildir; yalnız cihazı ayırt eder).
export function newDeviceId(rand: () => number = Math.random): string {
  const h = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16));
  h[12] = "4";
  h[16] = "89ab"[Math.floor(rand() * 4)];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export const deviceIdValid = (id: unknown) => typeof id === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(id);

const base = (ctx: DeviceCtx) => ({ device_id: ctx.deviceId, device_name: ctx.deviceName, platform: ctx.platform, app_version: ctx.appVersion });

export function requestCodeBody(email: string, password: string, ctx: DeviceCtx, trustedToken: string | null) {
  return { email: email.trim().toLowerCase(), password, ...base(ctx), ...(trustedToken ? { device_token: trustedToken } : {}) };
}
export function verifyCodeBody(email: string, code: string, ctx: DeviceCtx) {
  return { email: email.trim().toLowerCase(), code, ...base(ctx) };
}

export type LoginStep = { kind: "session" } | { kind: "verify"; expiresIn: number; resendAfter: number; message: string | null };
export function loginStep(res: any): LoginStep {
  if (res?.access_token) return { kind: "session" };
  return {
    kind: "verify",
    expiresIn: Number(res?.expires_in) > 0 ? Number(res.expires_in) : 300,
    resendAfter: Number(res?.resend_after) > 0 ? Number(res.resend_after) : 45,
    message: typeof res?.message === "string" ? res.message : null,
  };
}

const CODE_TEXT: Record<string, string> = {
  CODE_INVALID: "Kod hatalı. Tekrar deneyin.",
  CODE_EXPIRED: "Kodun süresi doldu. Yeni kod isteyin.",
  CODE_LOCKED: "Çok fazla hatalı deneme. Yeni kod isteyin.",
  CODE_USED: "Bu kod zaten kullanıldı. Yeni kod isteyin.",
  CODE_NOT_FOUND: "Kod bulunamadı. Yeni kod isteyin.",
  CODE_COOLDOWN: "Yeni kod için biraz bekleyin.",
};
export function codeErrorText(e: any): string {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (msg && !/^Sunucu hatası \(\d+\)$/.test(msg) && !CODE_TEXT[msg]) return msg;
  return CODE_TEXT[e?.code] || "Kod doğrulanamadı. Tekrar deneyin.";
}
export const codeNeedsNew = (e: any) => ["CODE_LOCKED", "CODE_EXPIRED", "CODE_USED", "CODE_NOT_FOUND"].includes(e?.code);

// Yeni uçlar henüz canlıda yoksa (404/405) eski kodsuz girişe düşülür.
export const fallbackToLegacy = (e: any) => [404, 405].includes(Number(e?.status));
