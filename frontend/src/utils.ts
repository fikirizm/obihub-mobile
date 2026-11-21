import type { Order } from "./types";

export const PLATFORM_LOGOS = {
  woo: require("../assets/obihub/platform-woo.png"),
  trendyol: require("../assets/obihub/platform-trendyol.png"),
  hepsiburada: require("../assets/obihub/platform-hepsiburada.png"),
  n11: require("../assets/obihub/platform-n11.png"),
};

export function formatTry(amount: number | string | undefined | null) {
  const v = Number(amount || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `₺${v.toFixed(2)}`;
  }
}

export function formatNumber(n: number | string | undefined | null, fractionDigits = 0) {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: fractionDigits }).format(v);
  } catch {
    return v.toFixed(fractionDigits);
  }
}

export function formatCompact(n: number | string | undefined | null) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1).replace(".0", "")}K`;
  return formatNumber(v, 0);
}

export function cleanOrderNo(raw: unknown) {
  return String(raw || "")
    .trim()
    .replace(/^(WC|TY|HB)[-_]/i, "")
    .replace(/^HB\s*#/i, "")
    .replace(/^#/i, "");
}

export function displayOrderNo(order: Order) {
  const candidates = [
    order.trendyol_order_number,
    order.hepsiburada_order_number,
    order.channel_order_id,
    order.id,
  ];
  for (const c of candidates) {
    const val = cleanOrderNo(c);
    if (val) return val;
  }
  return "-";
}

const trendyolStatusMap: Record<string, string> = {
  created: "Onay Bekliyor",
  unpacked: "Hazırlık Öncesi",
  picking: "Hazırlanıyor",
  invoiced: "Faturalandı",
  readyforshipment: "Kargoya Hazır",
  shipped: "Kargoda",
  atcollectionpoint: "Toplama Noktasında",
  atdistributioncenter: "Dağıtım Merkezinde",
  delivered: "Teslim Edildi",
  undelivered: "Teslim Edilemedi",
  cancelled: "İptal Edildi",
  unsupplied: "Tedarik Edilemedi",
  returned: "İade Edildi",
  intransit: "Kargoda",
  outfordelivery: "Dağıtımda",
  packageintransit: "Kargoda",
};

export function trStatus(status: string) {
  const key = String(status || "").trim().toLowerCase();
  const compact = key.replace(/\s+/g, "").replace(/_/g, "").replace(/-/g, "");
  const map: Record<string, string> = {
    delivered: "Tamamlandı",
    completed: "Tamamlandı",
    processing: "Hazırlanıyor",
    created: "Hazırlanıyor",
    new: "Hazırlanıyor",
    pending: "Ödeme Bekleniyor",
    shipped: "Kargoda",
    cargo: "Kargoda",
    kargoda: "Kargoda",
    intransit: "Kargoda",
    outfordelivery: "Kargoda",
    ontheway: "Kargoda",
    inshipping: "Kargoda",
    cancelled: "İptal",
    deleted: "Silinmiş",
    refunded: "İade Edildi",
    failed: "Başarısız",
    on_hold: "Bekletiliyor",
  };
  return map[key] || map[compact] || status;
}

// Web IntegrationOrdersPage ile aynı: tüm kanallarda (WooCommerce dahil) ObiHub'ın iç durumu gösterilir
// (pending → Bekleyen, processing → Gönderime Hazır, shipped → Kargoda, delivered/completed → Tamamlandı,
// cancelled → İptal, deleted → Silinmiş). Woo'nun kendi durumu (wc_status) kullanılmaz; Trendyol'da kendi durumu.
export function displayOrderStatus(order: Order, providerHint?: string) {
  const provider = String(providerHint || order.channel || "").toLowerCase();
  if (provider.includes("trendyol") && order.trendyol_status) {
    const known = trendyolStatusMap[compactStatus(order.trendyol_status)];
    if (known) return known;
  }
  const internal = compactStatus(order.status);
  if (internal === "pending") return "Bekleyen";
  if (internal === "processing") return "Gönderime Hazır";
  return trStatus(order.status);
}

function compactStatus(raw: unknown) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export type StatusKind = "success" | "info" | "warning" | "error" | "neutral";

// Renk ve sayım sunucunun iç durumundan (status) türetilir; Panel ve süzgeçler de aynı alana bakar.
// Kargo gönderisinin durumu (cargo_status) siparişin durumu değildir, hesaba katılmaz.
export function statusKindFromOrder(order: Order, providerHint?: string): StatusKind {
  const provider = String(providerHint || order.channel || "").toLowerCase();
  if (provider.includes("trendyol")) {
    const ty = compactStatus(order.trendyol_status);
    if (ty === "undelivered" || ty === "unsupplied" || ty === "returned") return "error";
  }
  switch (compactStatus(order.status)) {
    case "pending":
    case "processing":
    case "onhold":
    case "created":
    case "new":
      return "warning";
    case "shipped":
      return "info";
    case "delivered":
    case "completed":
      return "success";
    case "cancelled":
    case "refunded":
    case "failed":
      return "error";
    default:
      return "neutral";
  }
}

// Bekleyen sipariş: sunucunun "pending" veya "processing" saydığı, sorunlu olmayan sipariş.
export function isNewOrderStatus(order: Order, providerHint?: string): boolean {
  if (statusKindFromOrder(order, providerHint) === "error") return false;
  const internal = compactStatus(order.status);
  return internal === "pending" || internal === "processing";
}

export function providerKey(s: unknown): "woo" | "trendyol" | "hepsiburada" | "n11" | "website" | "other" {
  const v = String(s || "").toLowerCase();
  // Faz A: ObiHub web mağaza siparişi (channel "website").
  if (v === "website" || v.startsWith("website:")) return "website";
  if (v.includes("woo")) return "woo";
  if (v.includes("trendyol")) return "trendyol";
  if (v.includes("hepsiburada")) return "hepsiburada";
  if (v.includes("n11")) return "n11";
  return "other";
}

// Sipariş alan entegrasyon (mağaza ya da pazaryeri) mi? Kargo ve muhasebe bağlantıları mağaza sayılmaz.
export function isStoreIntegration(it: { kind?: string | null; provider?: string | null }): boolean {
  const kind = String(it.kind || "").trim().toLowerCase();
  if (kind) return kind === "store" || kind === "marketplace";
  return !/(hepsijet|yurtici|aras|mng|surat|ptt|parasut|bizimhesap)/.test(String(it.provider || "").toLowerCase());
}

export function providerLabel(p: string): string {
  switch (providerKey(p)) {
    case "woo":
      return "WooCommerce";
    case "trendyol":
      return "Trendyol";
    case "hepsiburada":
      return "Hepsiburada";
    case "n11":
      return "n11";
    case "website":
      return "Web Mağaza";
    default:
      return p || "Diğer";
  }
}

export function providerColor(p: string, fallback: string): string {
  switch (providerKey(p)) {
    case "woo":
      return "#7F54B3";
    case "trendyol":
      return "#FF671B";
    case "hepsiburada":
      return "#FF6000";
    case "n11":
      return "#4F46E5";
    default:
      return fallback;
  }
}

export function orderTimestamp(order: Order) {
  // n11'de sipariş tarihi her durum değişikliğinde yenilenir; ilk kayıt anı daha eskiyse o esas alınır.
  if (String(order.channel || "").toLowerCase() === "n11" && order.order_date && order.created_at) {
    const modified = Date.parse(String(order.order_date));
    const first = Date.parse(String(order.created_at));
    if (!Number.isNaN(modified) && !Number.isNaN(first)) return Math.min(modified, first);
  }
  const candidates = [order.order_date, order.created_at, order.updated_at];
  for (const c of candidates) {
    if (!c) continue;
    const ms = Date.parse(String(c));
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

export function relativeDateLabel(order: Order) {
  const ts = orderTimestamp(order);
  if (!ts) return "-";
  const dt = new Date(ts);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startGiven = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((startToday.getTime() - startGiven.getTime()) / 86400000);
  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Dün";
  const trMonths = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ];
  return `${dt.getDate()} ${trMonths[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function formatOrderDateTime(order: Order): string {
  const candidates = [order.order_date, order.created_at, order.updated_at];
  let dt: Date | null = null;
  for (const c of candidates) {
    if (!c) continue;
    const parsed = new Date(String(c));
    if (!Number.isNaN(parsed.getTime())) {
      dt = parsed;
      break;
    }
  }
  if (!dt) return "-";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return dt.toISOString().slice(0, 16).replace("T", " ");
  }
}

// Yalnızca sunucunun gerçekten kargo takip numarası olarak döndürdüğü alanlara bakılır.
// Numara yoksa boş döner; sipariş numarası ya da başka bir alan takip numarası gibi gösterilmez.
export function getOrderTrackingNo(order: Order): string {
  const candidates = [
    order.cargo_tracking,
    order.n11_cargo_tracking,
    Array.isArray(order.cargo_barcodes) ? order.cargo_barcodes[0]?.barcode : undefined,
    order.cargo_tracking_number,
    order.tracking_number,
  ];
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (v) return v;
  }
  return "";
}

// Para birimiyle tutar. Backend bazı uçlarda TL için "TRL" döndürür.
export function formatMoney(amount: number | string | undefined | null, currency?: string | null) {
  const cur = String(currency || "TRY").toUpperCase().replace("TRL", "TRY");
  if (cur === "TRY") return formatTry(amount);
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${formatNumber(n, 2)} ${cur}`;
  }
}

// "2026-11-11" veya ISO tarihini "11 Kas 2026" biçiminde gösterir.
export function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
