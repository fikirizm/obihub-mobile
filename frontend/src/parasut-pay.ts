// C4 eki: fatura tahsilatının Paraşüt durumu ve eylemleri (saf modül; birim testi dev/test-parasut-pay.mjs).
// Web: frontend/src/components/sales/SalesInvoiceFormOS.jsx ParasutPayState + PaymentDialog/ParasutSync.
// Belirsiz sonuç (yanıt alınamadı) ASLA yeniden gönderilmez: kullanıcı Paraşüt'te kontrol edip "işlenmiş" / "yok" diye işaretler.
// Yalnız kesin ret ("Yeniden dene") ve resmileşmeden önce alınmış tahsilat ("Paraşüt'e gönder", hesap seçilerek) gönderilir.

export type ParasutPayLike = {
  parasut_sync_state?: string;
  parasut_synced?: boolean;
  parasut_sync_error?: string;
  parasut_out_of_sync?: boolean;
};
export type ParasutAction = "send" | "retry" | "resolve-synced" | "resolve-not-synced";
export type ParasutPayView = { state: string; label: string; tone: "good" | "muted" | "warn" | "bad"; actions: ParasutAction[]; detail?: string; note?: string };

export function parasutPayState(p: ParasutPayLike): string {
  if (p.parasut_sync_state) return p.parasut_sync_state;
  if (p.parasut_synced === true) return "synced";
  if (p.parasut_synced === false) return "uncertain"; // eski kayıt: sonucu bilinmiyor → güvenli taraf
  return "none";
}

export function parasutPayView(p: ParasutPayLike, o: { linked: boolean; locked: boolean; canSend: boolean }): ParasutPayView | null {
  if (!o.linked) return null;
  // Dalga 2: mahsup satırı Paraşüt'e gönderilmez (ObiHub'da kalır; Paraşüt'te kullanıcı kendisi yapar).
  if ((p as any).source === "offset" || (p as any).parasut_sync_state === "local_only")
    return { state: "local_only", label: "ObiHub'da mahsup · Paraşüt'te yapın", tone: "muted", actions: [] } as any;
  const state = parasutPayState(p);
  if (state === "none") return null;
  const extra = {
    ...(p.parasut_sync_error ? { detail: p.parasut_sync_error } : {}),
    ...(p.parasut_out_of_sync ? { note: "Paraşüt'teki kayıt güncellenmedi" } : {}),
  };
  if (state === "synced") return { state, label: "Paraşüt'e işlendi", tone: "good", actions: [], ...extra };
  if (state === "syncing") return { state, label: "Paraşüt'e gönderiliyor…", tone: "muted", actions: [], ...extra };
  if (state === "not_sent")
    return { state, label: "Paraşüt'e işlenmedi · Paraşüt'te açık görünür", tone: "warn", actions: !o.locked && o.canSend ? ["send"] : [], ...extra };
  if (state === "uncertain")
    return { state, label: "Sonuç belirsiz · Paraşüt'te kontrol edin", tone: "warn", actions: o.locked ? [] : ["resolve-synced", "resolve-not-synced"], ...extra };
  return { state, label: "Paraşüt'e yazılamadı", tone: "bad", actions: o.locked ? [] : ["retry"], ...extra };
}

export const PARASUT_ACTION_LABELS: Record<ParasutAction, string> = {
  send: "Paraşüt'e gönder",
  retry: "Yeniden dene",
  "resolve-synced": "Paraşüt'te işlenmiş",
  "resolve-not-synced": "Paraşüt'te yok",
};

export function parasutActionRequest(invoiceId: string, paymentId: string, action: ParasutAction, parasutAccountId?: string) {
  const base = `/local-invoices/${encodeURIComponent(invoiceId)}/payments/${encodeURIComponent(paymentId)}`;
  if (action === "send") return { path: `${base}/parasut-sync`, body: { parasut_account_id: parasutAccountId } as Record<string, unknown> };
  if (action === "retry") return { path: `${base}/parasut-sync`, body: {} as Record<string, unknown> };
  return { path: `${base}/parasut-resolve`, body: { outcome: action === "resolve-synced" ? "synced" : "not_synced" } as Record<string, unknown> };
}

const OK_TEXT: Record<ParasutAction, string> = {
  send: "Tahsilat Paraşüt'e işlendi",
  retry: "Tahsilat Paraşüt'e işlendi",
  "resolve-synced": "Paraşüt'te işlenmiş olarak işaretlendi",
  "resolve-not-synced": "Paraşüt'te yok olarak işaretlendi; yeniden gönderebilirsiniz",
};
const FAIL_TEXT: Record<ParasutAction, string> = {
  send: "Paraşüt'e yazılamadı",
  retry: "Paraşüt'e yazılamadı",
  "resolve-synced": "İşaretlenemedi",
  "resolve-not-synced": "İşaretlenemedi",
};
export function parasutActionResult(action: ParasutAction, r: any): { ok: boolean; text: string } {
  if (r?.ok) return { ok: true, text: OK_TEXT[action] };
  return { ok: false, text: (typeof r?.error === "string" && r.error) || FAIL_TEXT[action] };
}
export function parasutActionFailText(action: ParasutAction) {
  return FAIL_TEXT[action];
}

// Tahsilat alırken "Paraşüt'e de işle": fatura Paraşüt'te ve firmada tahsilat senkronu açıksa (sunucu ayrıca denetler).
export function canOfferParasutSync(inv: { parasut_invoice_id?: string | null }, caps: { payment_sync?: boolean } | null) {
  return Boolean(inv?.parasut_invoice_id) && caps?.payment_sync === true;
}
export function parasutCollectFields(parasutAccountId: string | null) {
  return { parasut_sync: Boolean(parasutAccountId), parasut_account_id: parasutAccountId || null };
}
export function collectResultText(res: any): { kind: "success" | "info"; text: string } {
  if (res?.parasut?.ok === false) return { kind: "info", text: `Tahsilat ObiHub'a kaydedildi, Paraşüt'e yazılamadı: ${res.parasut.error}` };
  if (res?.replayed) return { kind: "success", text: "Tahsilat zaten kaydedilmişti." };
  if (res?.parasut?.ok) return { kind: "success", text: "Tahsilat kaydedildi ve Paraşüt'e işlendi" };
  return { kind: "success", text: "Tahsilat kaydedildi" };
}
