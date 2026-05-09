import type { Order } from "../types";

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

export function cleanOrderNo(raw: any) {
  return String(raw || "")
    .trim()
    .replace(/^(WC|TY|HB)[-_]/i, "")
    .replace(/^HB\s*#/i, "")
    .replace(/^#/i, "");
}

export function displayOrderNo(order: Order) {
  const candidates = [
    (order as any)?.trendyol_order_number,
    (order as any)?.hepsiburada_order_number,
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

export function displayOrderStatus(order: Order, providerHint?: string) {
  const provider = String(providerHint || order.channel || "").toLowerCase();
  if (provider.includes("woo")) {
    return trStatus(String((order as any)?.wc_status || order.status || ""));
  }
  if (provider.includes("trendyol")) {
    const raw = String((order as any)?.trendyol_status || order.status || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "");
    return trendyolStatusMap[raw] || trStatus((order as any)?.trendyol_status || order.status);
  }
  if (provider.includes("hepsiburada")) {
    return trStatus(String((order as any)?.hepsiburada_status || order.status || ""));
  }
  return trStatus(order.status);
}

export type StatusKind = "success" | "info" | "warning" | "error" | "neutral";

export function statusKindFromOrder(order: Order, providerHint?: string): StatusKind {
  const shown = String(displayOrderStatus(order, providerHint) || "").toLowerCase();
  const raw = String(
    (order as any)?.hepsiburada_status ||
      (order as any)?.trendyol_status ||
      (order as any)?.wc_status ||
      (order as any)?.cargo_status ||
      order.status ||
      ""
  )
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "");
  if (shown.includes("kargo") || raw.includes("cargo") || raw.includes("ship") || raw.includes("transit")) return "info";
  if (shown.includes("tamam") || shown.includes("teslim")) return "success";
  if (
    shown.includes("hazır") ||
    shown.includes("hazırlan") ||
    shown.includes("bekliyor") ||
    raw.includes("new") ||
    raw.includes("created") ||
    raw.includes("pending")
  )
    return "warning";
  if (shown.includes("iptal") || shown.includes("iade") || shown.includes("başarısız")) return "error";
  return "neutral";
}

export function providerKey(s: any): "woo" | "trendyol" | "hepsiburada" | "n11" | "other" {
  const v = String(s || "").toLowerCase();
  if (v.includes("woo")) return "woo";
  if (v.includes("trendyol")) return "trendyol";
  if (v.includes("hepsiburada")) return "hepsiburada";
  if (v.includes("n11")) return "n11";
  return "other";
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
  const candidates = [(order as any)?.order_date, (order as any)?.created_at, (order as any)?.updated_at];
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
