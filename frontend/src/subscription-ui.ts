// Abonelik ekranı kuralları (saf modül; birim testi dev/test-subscription-ui.mjs).
// PM 13 Kas 2026: yenileme dönemi bitişe 14 gün kala açılır. Mobilde ödeme alınmaz; App Store kuralı gereği
// ödeme bağlantısı ya da fiyat çağrısı YOK, yalnız bilgi metni.
// Sözleşme (docs/mobil-oturum-icin-notlar.md): GET /billing/trial-status → renewal {kind, phase, can_renew, window_days,
// days_left, expires_at}; usage / limits {products, orders_monthly, integrations}. renewal yoksa (eski sunucu) expires_at'ten.

export const RENEWAL_WINDOW_DAYS = 14;
const DAY = 86400000;
const WEB_TEXT = "Yenilemeyi app.obihub.app üzerinden yapabilirsiniz.";

export type RenewalNotice = { title: string; body: string; tone: "info" | "warning" | "error" };

type Renewal = { kind?: string | null; phase?: string | null; days_left?: number | null } | null | undefined;
type Status = { expires_at?: string | null; subscription_status?: string | null; renewal?: Renewal } | null | undefined;

function windowNotice(trial: boolean, days: number, endsToday: boolean): RenewalNotice {
  const who = trial ? "Deneme sürenizin" : "Aboneliğinizin";
  const when = endsToday ? `${trial ? "Deneme süreniz" : "Aboneliğiniz"} bugün sona eriyor.` : `${who} bitmesine ${days} gün kaldı.`;
  return { title: trial ? "Deneme süreniz bitiyor" : "Yenileme dönemi açıldı", body: `${when} ${WEB_TEXT}`, tone: days <= 3 ? "warning" : "info" };
}

function expiredNotice(trial: boolean): RenewalNotice {
  return { title: trial ? "Deneme süreniz doldu" : "Aboneliğinizin süresi doldu", body: WEB_TEXT, tone: "error" };
}

export function renewalNotice(s: Status, now = Date.now()): RenewalNotice | null {
  const r = s?.renewal;
  if (r && typeof r === "object" && r.phase) {
    const trial = r.kind === "trial";
    if (r.phase === "expired") return expiredNotice(trial);
    if (r.phase !== "window") return null; // none: pencere kapalı; suspended: ödeme yok, gösterilmez
    const days = Math.max(0, Math.floor(Number(r.days_left) || 0));
    return windowNotice(trial, days, days === 0);
  }
  // Eski sunucu: expires_at'ten hesap.
  const status = String(s?.subscription_status || "").toLowerCase();
  if (status === "cancelled" || status === "suspended") return null;
  const end = Date.parse(String(s?.expires_at || ""));
  if (!Number.isFinite(end)) return null;
  const left = end - now;
  if (left <= 0 || status === "expired") return expiredNotice(false);
  const days = Math.ceil(left / DAY);
  if (days > RENEWAL_WINDOW_DAYS) return null;
  return windowNotice(false, days, left < DAY);
}

// ---- Kullanım çubukları ----
export type UsageBar = { key: string; label: string; used: number; limit: number; ratio: number; tone: "ok" | "warning" | "error" };
type UsageSrc = { usage?: Record<string, unknown> | null; limits?: Record<string, unknown> | null } | null | undefined;

const ROWS: { key: string; label: string; summaryKey?: string }[] = [
  { key: "integrations", label: "Entegrasyon", summaryKey: "billable_integrations" },
  { key: "products", label: "Ürün" },
  { key: "orders_monthly", label: "Aylık sipariş" },
];

export function usageBars(status: UsageSrc, summary: UsageSrc): UsageBar[] {
  const fromStatus = Boolean(status?.limits && typeof status.limits === "object" && Object.keys(status.limits).length);
  const src = fromStatus ? status : summary;
  const out: UsageBar[] = [];
  for (const r of ROWS) {
    const limit = Number(src?.limits?.[r.key]);
    if (!Number.isFinite(limit) || limit <= 0) continue; // sınırsız ya da bilinmeyen limit çubuk olarak gösterilmez
    // Entegrasyon sınırına tabi sayaç /usage/summary'de billable_integrations (muhasebe bağlantıları sayılmaz).
    const rawUsed = !fromStatus && r.summaryKey ? src?.usage?.[r.summaryKey] ?? src?.usage?.[r.key] : src?.usage?.[r.key];
    const used = Math.max(0, Number(rawUsed) || 0);
    const ratio = Math.min(1, Math.round((used / limit) * 100) / 100);
    out.push({ key: r.key, label: r.label, used, limit, ratio, tone: used >= limit ? "error" : ratio >= 0.8 ? "warning" : "ok" });
  }
  return out;
}
