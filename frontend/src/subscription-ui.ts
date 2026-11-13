// Abonelik yenileme bilgisi (saf modül; birim testi dev/test-subscription-ui.mjs).
// PM 13 Kas 2026: yenileme dönemi bitişe 14 gün kala açılır. Mobilde ödeme alınmaz; App Store kuralı gereği
// ödeme bağlantısı ya da fiyat çağrısı YOK, yalnız bilgi metni.

export const RENEWAL_WINDOW_DAYS = 14;
const DAY = 86400000;
const WEB_TEXT = "Yenilemeyi app.obihub.app üzerinden yapabilirsiniz.";

export type RenewalNotice = { title: string; body: string; tone: "info" | "warning" | "error" };

export function renewalNotice(s: { expires_at?: string | null; subscription_status?: string | null } | null | undefined, now = Date.now()): RenewalNotice | null {
  const status = String(s?.subscription_status || "").toLowerCase();
  if (status === "cancelled" || status === "suspended") return null;
  const end = Date.parse(String(s?.expires_at || ""));
  if (!Number.isFinite(end)) return null;
  const left = end - now;
  if (left <= 0 || status === "expired") return { title: "Aboneliğinizin süresi doldu", body: WEB_TEXT, tone: "error" };
  const days = Math.ceil(left / DAY);
  if (days > RENEWAL_WINDOW_DAYS) return null;
  const when = left < DAY ? "Aboneliğiniz bugün sona eriyor." : `Aboneliğinizin bitmesine ${days} gün kaldı.`;
  return { title: "Yenileme dönemi açıldı", body: `${when} ${WEB_TEXT}`, tone: days <= 3 ? "warning" : "info" };
}
