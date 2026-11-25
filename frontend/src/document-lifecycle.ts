// D-12 satış faturası yaşam döngüsü (saf modül; birim testi dev/test-document-lifecycle.mjs). Sözleşme: docs/pm/tasarim/D-12.md.
// Web: lib/documentLifecycle.js + components/sales/InvoiceLifecycle.jsx. Arayüz kapıları sunucunun `actions` alanından; yoksa durumdan türetilir.

type Inv = Record<string, any> | null | undefined;

// invoice-status.documentAxis ile aynı kural (saf modül; göreli içe aktarma yok).
const docAxis = (inv: Inv) => {
  const st = inv?.status;
  if (st === "taslak") return "draft";
  if (st === "iptal") return "cancelled";
  if (inv?.edoc_cancelled_at) return "issued";
  if (st === "resmilesti" || inv?.edoc_state === "done" || ["parasut_import", "parasut", "parasut_mirror"].includes(String(inv?.source || "")) || inv?.source_kind === "parasut")
    return "official";
  return "issued";
};
export const isMirror = (inv: Inv) => inv?.read_only === true || inv?.source === "parasut_mirror";

// 24 Kas 2026 mükerrer e-belge koruması (web lib/documentLifecycle.js canSendInvoice): "Resmileştir" yalnız Paraşüt'e hiç gitmemiş,
// e-belge süreci başlamamış, kilitsiz, resmileşmemiş faturada. Paraşüt kimliği ya da herhangi bir e-belge izi varsa Paraşüt'te belge
// oluşmuş olabilir: yeniden gönderilmez, yalnız durum sorgulanır / e-belge yeniden denenir.
export function canSendInvoice(inv: Inv): boolean {
  if (!inv) return true;
  if (isMirror(inv) || inv.source === "parasut_import") return false;
  const axis = docAxis(inv);
  if (axis === "cancelled" || axis === "official" || inv.status === "resmilesti") return false;
  return !inv.parasut_invoice_id && !inv.officialize_lock && !inv.edoc_state && !inv.edoc_requested && !inv.edoc_job_id;
}

// "E-belgeyi yeniden dene" (POST /local-invoices/{id}/edoc-retry): Paraşüt'te faturası OLUŞMUŞ ama e-belgesi düşmüş fatura.
// Yeni fatura açılmaz; Paraşüt'teki fatura korunur, yalnız e-belge yeniden denenir.
export function canRetryEdoc(inv: Inv): boolean {
  if (!inv || !inv.parasut_invoice_id || inv.edoc_state !== "failed") return false;
  if (isMirror(inv) || inv.source === "parasut_import" || inv.officialize_lock || inv.edoc_cancelled_at) return false;
  return docAxis(inv) === "issued" && inv.status !== "iptal" && inv.status !== "resmilesti";
}

export type LifecycleActions = {
  edit_amounts: boolean;
  delete: boolean;
  edit_meta: boolean;
  cancel: boolean;
  return: boolean;
  copy: boolean;
  archive: boolean;
  preview: boolean;
  share: boolean;
  open_in_parasut: boolean;
  cancel_edoc: boolean;
  official_pdf: boolean;
};

export function lifecycleActions(inv: Inv): LifecycleActions {
  const mirror = isMirror(inv);
  const axis = docAxis(inv);
  const draft = axis === "draft";
  const cancelled = axis === "cancelled";
  const imported = inv?.source === "parasut_import";
  const isReturn = inv?.invoice_type === "iade";
  const quote = inv?.invoice_type === "teklif";
  // 16 Kas (Paraşüt eşdeğeri): resmileşene kadar fatura düzenlenir ve silinir. Kapı: Paraşüt'e gitmemiş, e-belgesiz,
  // işlem kilidi yok, resmileşmemiş. Tahsilatlı/iadeli faturayı sunucu reddeder (actions bunu bildirir).
  const unofficial = !mirror && !imported && !cancelled && axis !== "official" && !inv?.parasut_invoice_id && !inv?.officialize_lock &&
    !["done", "pending", "sending", "blocked_mismatch", "blocked"].includes(String(inv?.edoc_state || ""));
  const derived: LifecycleActions = {
    edit_amounts: (!mirror && draft) || (unofficial && !isReturn && !quote && !(Number(inv?.paid_amount) > 0)),
    delete: unofficial && (draft || (!isReturn && !quote)),
    edit_meta: !mirror && !cancelled,
    cancel: !mirror && !imported && !draft && !cancelled,
    return: !mirror && !imported && !draft && !cancelled && inv?.invoice_type !== "iade" && inv?.invoice_type !== "teklif",
    copy: !mirror,
    archive: !mirror,
    preview: true,
    share: !mirror && !cancelled && (inv?.invoice_type === "teklif" || ((inv?.invoice_type || "satis") === "satis" && !draft)),
    open_in_parasut: mirror,
    // Dalga 1: yalnız sunucu verirse (e-belge iptali; resmi GİB PDF'i).
    cancel_edoc: false,
    official_pdf: false,
  };
  const server = inv?.actions && typeof inv.actions === "object" ? inv.actions : {};
  const out: any = { ...derived };
  for (const k of Object.keys(derived)) if (typeof server[k] === "boolean") out[k] = server[k];
  // PM kararı 25 Kas: tahsilatı olan fatura silinemez (sunucu HAS_PAYMENTS); "Faturayı sil" sunucu izin verse de gizlenir.
  const live = (Array.isArray(inv?.payments) ? inv.payments : []).filter((p: any) => !p?.voided);
  if (Number(inv?.paid_amount) > 0.004 || live.length > 0) out.delete = false;
  return out;
}

const TEXTS: Record<string, string> = {
  CANCEL_REASON_REQUIRED: "İptal için gerekçe yazın (en az 3 karakter).",
  HAS_PAYMENTS: "Bu faturaya tahsilat bağlı. Önce tahsilatı iptal edin ya da faturadan ayırın, sonra faturayı iptal edin.",
  EDOC_CANCEL_REQUIRED: "Fatura e-belge olarak düzenlenmiş. Önce e-belgenin ayrıca iptal edilmesi gerekir.",
  INVOICE_BUSY: "Fatura şu an başka bir işlemde; birazdan tekrar deneyin.",
  ALREADY_CANCELLED: "Bu fatura zaten iptal edilmiş.",
  READ_ONLY_MIRROR: "Bu belge Paraşüt'ten aynalandı ve Paraşüt'te yönetilir; ObiHub'da değiştirilemez.",
  RETURN_QTY_EXCEEDS_REMAINING: "İade miktarı kalan miktarı aşıyor.",
  RETURN_LINES_REQUIRED: "İade için en az bir kalem seçin.",
  SOURCE_NOT_ISSUED: "İade yalnız kesilmiş faturadan oluşturulur.",
  HAS_RETURNS: "Bu faturanın iadesi var; iade belgeleri kaldırılmadan fatura değiştirilemez ya da silinemez.",
  MIRROR_READ_ONLY: "Bu kayıt Paraşüt'ten geliyor; değişikliği Paraşüt'te yapın",
  COLLECT_IN_PARASUT: "Bu faturanın tahsilatını Paraşüt'te girin; ObiHub'a otomatik eşitlenir",
  INVOICE_HAS_PAYMENTS: "Faturaya tahsilat bağlı. Önce faturanın tahsilatlarını silin.",
  INVOICE_OFFICIALIZED: "Resmileşmiş fatura silinemez; iptal ya da iade oluşturun.",
  INVOICE_SENT_TO_PARASUT: "Fatura Paraşüt'e gönderilmiş; silinemez. İptal ya da iade oluşturun.",
  INVOICE_OFFICIALIZING: "Fatura şu an resmileştiriliyor; işlem bitince tekrar deneyin.",
  INVOICE_OFFICIALIZE_UNCERTAIN: "Resmileştirme sonucu belirsiz; Paraşüt'te doğrulanana kadar fatura silinemez.",
  QUOTE_CONVERTED_LOCKED: "Faturaya çevrilmiş teklif değiştirilemez.",
  INVOICE_NOT_EDITABLE: "Bu fatura artık düzenlenemez.",
  NOT_SHAREABLE: "Bu belge türü e-posta ile paylaşılmaz; yalnız satış faturası ve teklif paylaşılır.",
  NOT_ISSUED_FOR_SHARE: "Yalnız kesilmiş fatura paylaşılır. Taslak ve iptal edilmiş faturalar gönderilmez.",
  RATE_LIMITED: "Saatte en fazla 30 paylaşım yapılabilir. Daha sonra tekrar deneyin.",
  EMAIL_NOT_CONFIGURED: "E-posta gönderimi bu ortamda etkin değil; belgeyi PDF olarak indirip kendiniz paylaşabilirsiniz.",
  EMAIL_SEND_FAILED: "E-posta gönderilemedi; biraz sonra yeniden deneyin.",
  EDOC_CANCEL_NOT_SUPPORTED: "e-Fatura (kurumsal alıcıya giden belge) iptal edilemez; alıcının reddi ya da iade faturası gerekir. Bu fatura için iade faturası oluşturabilirsiniz.",
  EDOC_CANCEL_FAILED: "e-Belge Paraşüt'te iptal edilemedi; hiçbir değişiklik yapılmadı. Biraz sonra yeniden deneyin ya da Paraşüt'ten iptal edin.",
  EDOC_CANCEL_WINDOW_CLOSED: "Bu e-Arşiv belgenin iptal süresi dolmuş. Düzeltme için iade faturası ya da gider pusulası oluşturun.",
  EDOC_REMOTE_MISSING: "Paraşüt'te bu fatura için aktif bir e-belge bulunamadı. Durumu Paraşüt'te kontrol edin.",
  EDOC_NOT_FINAL: "e-Belge henüz kesinleşmedi; sonuç bekleniyor ya da hata verdi. Önce e-belge durumunu sorgulayın.",
  PARASUT_NOT_CONNECTED: "Paraşüt bağlantısı kurulu değil ya da kopmuş; e-belge iptali için bağlantıyı yenileyin.",
  OFFICIAL_PDF_UNAVAILABLE: "Resmi fatura PDF'i Paraşüt'ten şu an alınamadı. Biraz sonra yeniden deneyin.",
  CONFIRM_REQUIRED: "Bu işlem onay gerektirir.",
  RECIPIENT_REQUIRED: "En az bir alıcı e-posta adresi girin.",
  NOT_A_QUOTE: "Paylaşım yalnız teklif ve proforma belgelerinde kullanılır.",
  IDEMPOTENCY_MISMATCH: "Aynı işlem anahtarı farklı bilgiyle kullanıldı; ekranı kapatıp yeniden deneyin.",
};
export function lifecycleErrorText(err: any, fallback = "İşlem tamamlanamadı."): string {
  const msg = typeof err?.message === "string" ? err.message.trim() : "";
  if (err?.code === "ISSUED_AMOUNTS_LOCKED") {
    // Gerçek neden sunucuda (detail); "Resmileşmiş" metni yalnız reason doluysa.
    if (msg && !/^Sunucu hatası \(\d+\)$/.test(msg)) return msg;
    return err.reason ? "Resmileşmiş fatura değiştirilemez; iptal ya da iade oluşturun." : "Kesilmiş belgede tutar alanları değiştirilemez; iptal ya da iade oluşturun.";
  }
  if (err?.code && TEXTS[err.code]) return TEXTS[err.code];
  if (Number(err?.status) === 429) return TEXTS.RATE_LIMITED;
  return msg && !/^Sunucu hatası \(\d+\)$/.test(msg) ? msg : fallback;
}

export const deleteConfirmText = (inv: Inv) =>
  docAxis(inv) === "draft" ? "Taslak fatura kalıcı olarak silinir. Geri alınamaz." : "Fatura silinecek; stok ve cari bakiyesi geri alınır.";

// Tutar alanları kilitliyken gerçek neden (web SalesInvoiceFormOS lockNote ile aynı sıra).
export function amountsLockNote(inv: Inv) {
  const paid = Number(inv?.paid_amount) > 0;
  const official = inv?.status === "resmilesti" || ["done", "pending", "sending", "blocked_mismatch"].includes(String(inv?.edoc_state || ""));
  const sent = Boolean(inv?.parasut_invoice_id);
  const tail = " Not, fatura ismi ve vade değiştirilebilir.";
  if (paid && !official && !sent) return "Tahsilatı olan faturada tutar alanları kilitli. Tutarı değiştirmek için önce faturanın tahsilatlarını silin;" + tail.replace(" Not", " not");
  if (official) return "Resmileşmiş faturada tutar alanları kilitli; iptal ya da iade oluşturun." + tail;
  if (sent) return "Paraşüt'e gönderilmiş faturada tutar alanları kilitli; iptal ya da iade oluşturun." + tail;
  if (inv?.has_returns) return "İadesi olan faturada tutar alanları kilitli; önce iade belgelerini iptal edin ya da silin." + tail;
  return "Kesilmiş faturada tutar alanları kilitli; iptal ya da iade oluşturun." + tail;
}

// EDOC_CANCEL_FAILED: Paraşüt sonucu alınamadı → aynı işlem anahtarıyla yeniden denenir (sunucu çift iptal göndermez).
export const edocCancelUncertain = (err: any) => err?.code === "EDOC_CANCEL_FAILED" || err?.code === "INVOICE_BUSY";

// Dalga 1: GET /local-invoices/{id}/share-preview → formun ön bilgisi (alıcı = cari e-postası, konu, gönderilebilirlik).
export function sharePrefill(p: any) {
  return {
    to: Array.isArray(p?.to) ? p.to.filter(Boolean).join(", ") : "",
    subject: typeof p?.subject === "string" ? p.subject : "",
    canSend: p?.can_send !== false,
    official: p?.attachment?.official === true,
    kind: p?.kind === "quote" ? "quote" : "invoice",
  };
}

export const cancelReasonProblem = (reason: string) => (String(reason || "").trim().length < 3 ? "İptal gerekçesi zorunlu (en az 3 karakter)." : null);

export const EVENT_LABEL: Record<string, string> = {
  created: "Oluşturuldu",
  updated: "Güncellendi",
  issued: "Kesildi",
  sent: "Gönderildi",
  officialized: "Resmileştirildi",
  payment_added: "Tahsilat eklendi",
  payment_voided: "Tahsilat geri alındı",
  cancelled: "İptal edildi",
  returned: "İade oluşturuldu",
  copied: "Kopyalandı",
  deleted: "Silindi",
  archived: "Arşivlendi",
  unarchived: "Arşivden çıkarıldı",
  shared: "Paylaşıldı",
  edoc_cancelled: "e-Belge iptal edildi",
};
export const eventLabel = (e: { type?: string; summary?: string }) => EVENT_LABEL[String(e?.type)] || String(e?.summary || "İşlem");

export function parseQty(text: unknown): string | null {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  return String(Number(t));
}
const qtyText = (n: number) => String(Math.round(n * 1e6) / 1e6).replace(".", ",");

export type ReturnRow = { key: string; name: string; total: number; done: number; left: number };
// Yalnız sunucudan gelen line_key'li kalem iade edilir (uydurma anahtar yanlış satıra eşlenir).
export function returnRows(lines: any[], returned: Record<string, unknown>): { rows: ReturnRow[]; unkeyed: number } {
  const all = Array.isArray(lines) ? lines : [];
  const rows = all
    .filter((x) => x?.line_key)
    .map((x) => {
      const key = String(x.line_key);
      const total = Number(x.quantity) || 0;
      const done = Number(returned?.[key]) || 0;
      return { key, name: String(x.product_name || x.description || x.name || "Kalem"), total, done, left: Math.max(0, Math.round((total - done) * 1e6) / 1e6) };
    });
  return { rows, unkeyed: all.length - rows.length };
}

export function returnLines(rows: ReturnRow[], qty: Record<string, string>) {
  const errors: Record<string, string> = {};
  const lines: { source_line_key: string; quantity: string }[] = [];
  for (const r of rows) {
    const raw = qty[r.key];
    if (raw === undefined || String(raw).trim() === "") continue;
    const q = parseQty(raw);
    if (q === null || Number(q) <= 0) errors[r.key] = "Geçerli bir miktar girin.";
    else if (Number(q) > r.left) errors[r.key] = `Kalan miktarı (${qtyText(r.left)}) aşıyor.`;
    else lines.push({ source_line_key: r.key, quantity: q });
  }
  const error = !Object.keys(errors).length && !lines.length ? "En az bir kalem için iade miktarı girin." : null;
  return { lines, errors, error };
}

// S-4: kesilmiş faturada yalnız izinli alanlar kısmi PUT ile değişir (not, fatura ismi, sipariş no, vade; kategori/etiket ayrı).
export type MetaForm = { document_name: string; notes: string; order_no: string; due_date: string };
export function metaBody(f: MetaForm) {
  return {
    document_name: String(f.document_name || "").trim(),
    notes: String(f.notes || ""),
    order_no: String(f.order_no || "").trim(),
    due_date: f.due_date ? f.due_date : null,
  };
}
export const metaProblem = (f: Partial<MetaForm>, issueDate: string) =>
  f.due_date && issueDate && f.due_date < issueDate ? "Vade, fatura tarihinden önce olamaz." : null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function shareRecipients(text: string): { list: string[]; error: string | null } {
  const list = String(text || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return { list, error: "En az bir alıcı e-posta adresi girin." };
  const bad = list.find((a) => !EMAIL.test(a));
  return { list, error: bad ? `Geçersiz e-posta adresi: ${bad}` : null };
}
