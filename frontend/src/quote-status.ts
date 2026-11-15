// Teklif durumu (saf modül; birim testi dev/test-quote-status.mjs). Web: frontend/src/lib/quoteStatus.js + QuotesOS menüsü.
// Saklı `quote_outcome` (open | accepted | rejected | expired) + geçerlilik tarihi + faturaya çevrilme. Süresi dolma okuma anında hesaplanır.
export type QuoteKind = "success" | "info" | "warning" | "error" | "neutral";

export const OUTCOME_TABS: [string, string][] = [
  ["", "Tümü"],
  ["open", "Açık"],
  ["accepted", "Kabul edildi"],
  ["rejected", "Reddedildi"],
  ["expired", "Süresi doldu"],
];

type Q = Record<string, any> | null | undefined;

export function effectiveOutcome(q: Q, today: string): string {
  if (q?.converted_invoice_id) return "accepted";
  const stored = q?.quote_outcome || "open";
  if (stored !== "open") return stored;
  const until = String(q?.valid_until || "");
  return until && today && until < today ? "expired" : "open";
}

const VIEWS: Record<string, { key: string; label: string; kind: QuoteKind }> = {
  open: { key: "open", label: "Açık", kind: "info" },
  accepted: { key: "accepted", label: "Kabul edildi", kind: "success" },
  rejected: { key: "rejected", label: "Reddedildi", kind: "error" },
  expired: { key: "expired", label: "Süresi doldu", kind: "warning" },
  cancelled: { key: "cancelled", label: "İptal", kind: "neutral" },
};

export function quoteOutcomeView(q: Q, today: string) {
  if (q?.status === "iptal") return VIEWS.cancelled;
  return VIEWS[effectiveOutcome(q, today)] || VIEWS.open;
}

// Web QuotesOS menüsü + QuoteFormOS editable kuralı: çevrilmiş teklif değişmez (sunucu 409), iptal edilmiş yalnız silinebilir.
export function quoteActions(q: Q) {
  const converted = Boolean(q?.converted_invoice_id);
  const cancelled = q?.status === "iptal";
  const live = !converted && !cancelled;
  return { edit: live && (!q?.status || q.status === "taslak"), convert: live, mark: live, remove: !converted, openInvoice: converted };
}

export const convertText = (inv: Q) => (inv?.replayed ? "Bu teklif daha önce faturaya çevrilmişti; mevcut fatura açıldı." : "Satış faturası taslağı oluşturuldu");
