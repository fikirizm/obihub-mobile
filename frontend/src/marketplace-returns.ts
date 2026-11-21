// Pazaryeri iade talepleri (ENT-1/S3; saf modül, birim testi dev/test-marketplace-returns.mjs). Trendyol ve Hepsiburada iadeleri
// yalnız okunur: stok KENDİLİĞİNDEN artmaz; "stoğa geri alın" önerisi gösterilir, "Yok say" yalnız öneriyi kapatır.
// Sunucu: routers/marketplace_returns.py (Satış modülü). Web: components/orders/MarketplaceReturnsModal.jsx.

export const FILTERS = [
  { id: "", label: "Tümü" },
  { id: "requested", label: "İade talebi" },
  { id: "approved", label: "Onaylandı" },
  { id: "rejected", label: "Reddedildi" },
];
const STATES = new Set(["requested", "approved", "rejected", "cancelled"]);
const CHANNEL: Record<string, string> = { trendyol: "Trendyol", hepsiburada: "Hepsiburada" };
const TONE: Record<string, "warning" | "info" | "neutral"> = { requested: "warning", approved: "info", rejected: "neutral", cancelled: "neutral" };

export function returnsPath(state: string) {
  const qs = new URLSearchParams({ limit: "100" });
  if (STATES.has(state)) qs.set("state", state);
  return `/marketplace-returns?${qs.toString()}`;
}
export const syncPath = "/marketplace-returns/sync";
export const dismissPath = (id: string) => `/marketplace-returns/${encodeURIComponent(id)}/dismiss-stock-advice`;

function claimDate(v: unknown) {
  const d = new Date(String(v || ""));
  if (Number.isNaN(d.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export type ReturnView = {
  id: string;
  title: string;
  sub: string;
  lines: string[];
  stateLabel: string;
  tone: "warning" | "info" | "neutral";
  advice: { message: string; dismissable: boolean } | null;
};
export function rowView(r: any): ReturnView {
  const adv = r?.stock_advice || {};
  const advState = String(adv.state || "");
  const message = String(adv.message || "");
  return {
    id: String(r?.id || ""),
    title: `Sipariş ${r?.order_number || "—"}`,
    sub: [CHANNEL[r?.provider] || r?.provider || "Pazaryeri", claimDate(r?.claimed_at), r?.reason].filter(Boolean).join(" · "),
    lines: (Array.isArray(r?.lines) ? r.lines : []).map((l: any) => `${l?.name || l?.sku || l?.barcode || "Ürün"} × ${l?.quantity ?? 1}`),
    stateLabel: String(r?.state_label || ""),
    tone: TONE[r?.state] || "neutral",
    advice:
      advState === "suggested"
        ? { message, dismissable: true }
        : (advState === "already_restored" || advState === "order_not_found") && message
          ? { message, dismissable: false }
          : null,
  };
}

export function afterDismiss(data: any, id: string) {
  if (!data) return data;
  let closed = 0;
  const items = (Array.isArray(data.items) ? data.items : []).map((x: any) => {
    if (x?.id !== id) return x;
    if (x?.stock_advice?.state === "suggested") closed = 1;
    return { ...x, stock_advice: { ...(x.stock_advice || {}), state: "dismissed" } };
  });
  const need = Math.max(0, Number(data?.summary?.stock_action_needed || 0) - closed);
  return { ...data, items, summary: { ...(data.summary || {}), stock_action_needed: need } };
}

export function syncResult(out: any): { text: string; kind: "success" | "info" | "error" } {
  if (Array.isArray(out?.errors) && out.errors.length) return { text: "Bazı mağazaların iadeleri okunamadı; hesabınızda iade (claims) izni olmayabilir.", kind: "error" };
  const fresh = Number(out?.new) || 0;
  return fresh ? { text: `${fresh} yeni iade talebi okundu.`, kind: "success" } : { text: "Yeni iade talebi yok.", kind: "info" };
}
export const alertText = (n: number) => (n > 0 ? `${n} iade için stoğa geri alma kararı bekliyor.` : "");
