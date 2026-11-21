// Yurtiçi Kargo gönderi eylemleri (Dalga 5b; saf modül, birim testi dev/test-yurtici.mjs). Sipariş detayında tek sipariş için:
// POST /yurtici/shipments, /yurtici/shipments/cancel {order_ids} ve /yurtici/labels {order_ids, format: pdf|zpl}. Bağlı mı: GET /yurtici/config.
// Pazaryeri siparişleri ve başka kargo takipli siparişler sunucuda Türkçe gerekçeyle reddedilir; iptalde "istendi ama doğrulanamadı"
// (cancel_requested / yurtici_cancel_status=requested) olabilir, iptal yeniden denenir. Web: components/orders/yurticiShipping.js.

const MARKETPLACE_OWN_CARGO = ["trendyol", "hepsiburada", "idefix", "pazarama"];

export function hasActiveShipment(order: any) {
  return String(order?.cargo_provider || "").toLowerCase() === "yurtici" && order?.cargo_status === "created" && Boolean(String(order?.cargo_tracking || "").trim());
}
export function createBlockReason(order: any) {
  const status = String(order?.status || "").toLowerCase();
  if (["cancelled", "canceled", "deleted"].includes(status)) return "iptal edilmiş ya da silinmiş sipariş";
  const channel = String(order?.channel || "").toLowerCase();
  if (MARKETPLACE_OWN_CARGO.includes(channel)) return "pazaryerinin kendi kargosuyla gider";
  if (String(order?.n11_cargo_tracking || "").trim()) return "N11 kargo takibi var";
  if (String(order?.idefix_cargo_tracking || "").trim() || String(order?.pazarama_cargo_tracking || "").trim()) return "pazaryeri kargo takibi var";
  if (String(order?.cargo_tracking || "").trim() && String(order?.cargo_provider || "").toLowerCase() !== "yurtici") return "başka bir kargo takibi var";
  return "";
}
export const cancelRequested = (order: any) => order?.yurtici_cancel_status === "requested";

export function actions(order: any, ctx: { connected: boolean; canEdit: boolean; canView: boolean }) {
  if (!ctx.connected) return { create: false, cancel: false, label: false, blockReason: "" };
  const active = hasActiveShipment(order);
  const blockReason = active ? "" : createBlockReason(order);
  return {
    create: ctx.canEdit && !active && !blockReason,
    cancel: ctx.canEdit && (active || cancelRequested(order)),
    label: ctx.canView && active,
    blockReason,
  };
}

export function resultText(res: any, doneText: string): { kind: "success" | "error" | "info"; text: string } {
  const r = Array.isArray(res?.results) ? res.results[0] : null;
  if (!r) return { kind: "error", text: "Yurtiçi Kargo yanıt vermedi. Biraz sonra yeniden deneyin." };
  if (r.success) return { kind: "success", text: r.message || doneText };
  if (r.status === "cancel_requested") return { kind: "info", text: r.message || "İptal istendi; Yurtiçi'de doğrulanamadı. Yeniden deneyebilirsiniz." };
  return { kind: "error", text: r.message || "İşlem tamamlanamadı." };
}

export const orderBody = (orderId: string) => ({ order_ids: [orderId] });
export const labelBody = (orderId: string, format: "pdf" | "zpl") => ({ order_ids: [orderId], format });
export function labelFile(res: any): { ok: true; kind: "pdf"; name: string; base64: string } | { ok: true; kind: "zpl"; name: string; text: string } | { ok: false; text: string } {
  if (!res?.success) return { ok: false, text: res?.message || "Etiket üretilemedi." };
  if (res.format === "zpl") return { ok: true, kind: "zpl", name: res.filename || "yurtici-etiket.zpl", text: String(res.text || "") };
  return { ok: true, kind: "pdf", name: res.filename || "yurtici-etiket.pdf", base64: String(res.data || "") };
}
