// İrsaliye (saf modül; birim testi dev/test-dispatch.mjs). Dalga 5a (P5.1): /dispatch-notes (giden/gelen). Siparişe bağlı irsaliye
// stoğa dokunmaz (sipariş stoğu zaten düştü); faturalanmış ya da e-İrsaliyesi gönderilmiş irsaliye düzenlenmez/silinmez (409).
// e-İrsaliye yalnız kullanıcı onayıyla (confirm:true); belirsiz sonuçta Paraşüt'te kontrol edildikten sonra retry_uncertain.

export type Direction = "out" | "in";
export function listPath(o: { direction: Direction; status?: string; q?: string; cursor?: string | null; limit?: number }) {
  const qs = new URLSearchParams({ direction: o.direction, limit: String(o.limit || 50) });
  if (o.status) qs.set("status", o.status);
  if (o.q && o.q.trim()) qs.set("q", o.q.trim());
  if (o.cursor) qs.set("cursor", o.cursor);
  return `/dispatch-notes?${qs.toString()}`;
}

type Kind = "success" | "info" | "warning" | "error" | "neutral";
const EDOC: Record<string, [string, Kind]> = {
  sending: ["e-İrsaliye gönderiliyor", "info"],
  sent: ["e-İrsaliye gönderildi", "success"],
  uncertain: ["e-İrsaliye sonucu belirsiz", "warning"],
  failed: ["e-İrsaliye gönderilemedi", "error"],
};
export function statusBadges(n: { invoice_status?: string; edoc?: { status?: string } | null }) {
  const out: { label: string; kind: Kind }[] = [n?.invoice_status === "invoiced" ? { label: "Faturalandı", kind: "success" } : { label: "Faturalanmadı", kind: "neutral" }];
  const e = EDOC[String(n?.edoc?.status || "none")];
  if (e) out.push({ label: e[0], kind: e[1] });
  return out;
}

export function noteActions(n: { deletable?: boolean; can_invoice?: boolean; can_send_edoc?: boolean; edoc?: { status?: string } | null }) {
  return {
    remove: n?.deletable === true,
    invoice: n?.can_invoice === true,
    edoc: n?.can_send_edoc === true,
    retryUncertain: n?.edoc?.status === "uncertain",
  };
}

// GET /dispatch-notes/prefill → POST gövdesi; kullanıcı yalnız takip no ve notu değiştirir (satırlar sunucunun ön doldurması).
export function prefillBody(p: any, edit: { tracking?: string; notes?: string; carrier?: string }) {
  const cargo = { ...(p?.cargo || {}) };
  if (edit.carrier !== undefined && edit.carrier.trim()) cargo.carrier = edit.carrier.trim();
  if (edit.tracking !== undefined) cargo.tracking_no = edit.tracking.trim();
  return {
    ...p,
    shipment_method: p?.shipment_method || "cargo",
    cargo,
    notes: edit.notes !== undefined ? edit.notes.trim() : p?.notes || "",
    lines: Array.isArray(p?.lines) ? p.lines : [],
  };
}

export function invoiceSelection(notes: { id: string; party_name?: string; direction?: string; can_invoice?: boolean }[], ids: string[]) {
  const picked = notes.filter((n) => ids.includes(n.id));
  if (!picked.length) return { ok: false, ids: [], error: "Faturaya çevrilecek irsaliyeleri seçin." };
  if (picked.some((n) => n.direction !== "out" || !n.can_invoice)) return { ok: false, ids: [], error: "Yalnız faturalanmamış giden irsaliyeler faturaya çevrilir." };
  if (new Set(picked.map((n) => String(n.party_name || "").trim().toLocaleLowerCase("tr-TR"))).size > 1)
    return { ok: false, ids: [], error: "Tek faturaya yalnız aynı cariye ait irsaliyeler çevrilebilir." };
  return { ok: true, ids: picked.map((n) => n.id), error: null };
}

export const edocBody = (retryUncertain: boolean) => (retryUncertain ? { confirm: true, retry_uncertain: true } : { confirm: true });

const TEXT: Record<string, string> = {
  DISPATCH_INVOICED: "Faturalanmış irsaliye değiştirilemez ve silinemez. Önce bağlı faturayı silin.",
  DISPATCH_EDOC_SENT: "e-İrsaliyesi gönderilmiş irsaliye değiştirilemez ve silinemez.",
  INVOICE_MOVES_STOCK: "Bu faturada stok çıkışı faturayla yapıldı; faturadan irsaliye oluşturulamaz.",
  E_DISPATCH_PROVIDER_MISSING: "e-İrsaliye göndermek için Paraşüt bağlantısı gerekir.",
};
export function dispatchErrorText(e: { code?: string; message?: string } | null | undefined) {
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m) && m !== e?.code) return m;
  return (e?.code && TEXT[e.code]) || "İşlem yapılamadı.";
}
