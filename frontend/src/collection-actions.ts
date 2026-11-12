// Aşama 4 / P11: tahsilat sil / düzenle (saf modül; birim testi dev/test-collection-actions.mjs).
// Web karşılığı: frontend/src/components/money/CollectionActions.jsx + lib/moneyKey.js.
//  • Sil: DELETE …/payments/{id} + Idempotency-Key.  Geri alınır: kasadan düşer, cari bakiyesi ve faturalar eski hâline döner.
//  • Düzenle: PATCH …/payments/{id}.  Yalnız not/yöntem değişirse yerinde; tutar/tarih/hesap değişirse eskisi geri alınıp yenisi yazılır.
//  • Ekstre satırında düğmeler YALNIZ sunucunun `actions: {edit, void}` alanına göre gösterilir.
//  • K5: Paraşüt'e işlenmiş tahsilatta Paraşüt'e dokunulmaz; yanıttaki `warning_texts` uyarı olarak gösterilir.

export type CollectionType = "customer" | "invoice";
export type Collection = {
  type: CollectionType;
  id: string;
  customer_id?: string;
  invoice_id?: string;
  invoice_number?: string;
  amount?: number | string;
  currency?: string;
  date?: string;
  method?: string;
  note?: string;
  account_id?: string;
  allocated_amount?: number | string;
  invoices?: { invoice_id: string; invoice_number?: string; amount?: number | string }[];
  parasut?: boolean;
};
export type RowActions = { edit: boolean; void: boolean };

export const VOID_TEXT = "Bu tahsilat geri alınır: kasadan düşer, carinin bakiyesi ve faturalar eski hâline döner.";
export const PARASUT_TEXT = "Bu tahsilat Paraşüt'e de işlenmiş. ObiHub Paraşüt'teki kaydı değiştirmez; gerekirse Paraşüt'te ayrıca düzeltin.";
export const EDIT_TEXT = "Tutar, tarih ya da hesap değişirse eski kayıt geri alınır ve yenisi yazılır; geçmişte iz kalır.";
const PARASUT_NOT_UPDATED_TEXT = "Bu tahsilat Paraşüt'e de işlenmişti; Paraşüt'teki kayıt değiştirilmedi.";
const REPLAYED_TEXT = "Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi.";

const enc = encodeURIComponent;
export function collectionPath(c: Collection): string {
  return c.type === "invoice"
    ? `/local-invoices/${enc(String(c.invoice_id || ""))}/payments/${enc(c.id)}`
    : `/customers/${enc(String(c.customer_id || ""))}/payments/${enc(c.id)}`;
}

// Ekstre satırı → gösterilecek düğmeler (yoksa null).  Değerler tam olarak `true` olmalı.
export function ledgerRowActions(row: { collection?: Collection | null; actions?: { edit?: unknown; void?: unknown } | null }): RowActions | null {
  if (!row?.collection || !row.actions) return null;
  const a = { edit: row.actions.edit === true, void: row.actions.void === true };
  return a.edit || a.void ? a : null;
}

// Ekstrenin tahsilatı; cari kimliği sunucu göndermezse ekranın carisi.
export function ledgerCollection(row: { collection?: Collection | null }, customerId: string): Collection {
  const c = row.collection as Collection;
  return { ...c, customer_id: c.customer_id || customerId };
}

type InvoiceLike = {
  id: string;
  invoice_number?: string;
  status?: string;
  invoice_type?: string;
  parasut_item_type?: string;
  money_state?: string;
  edoc_state?: string;
};
type InvoicePaymentLike = {
  id?: string;
  amount?: number | string;
  date?: string;
  method?: string;
  notes?: string;
  account_id?: string;
  source?: string;
  void_op?: unknown;
  parasut_sync_state?: string;
  parasut_synced?: boolean;
};

function parasutPayState(p: InvoicePaymentLike): string {
  if (p.parasut_sync_state) return p.parasut_sync_state;
  if (p.parasut_synced === true) return "synced";
  if (p.parasut_synced === false) return "uncertain"; // eski kayıt: sonucu bilinmiyor → güvenli taraf
  return "none";
}

// Fatura "Tahsilatlar" satırı → düğmeler.  Web SalesInvoiceFormOS.payRowActions ile aynı kural:
// iptal/taslak/teklif/iade faturada ve e-belge uyuşmazlığında yalnız sil; cari tahsilatından dağıtılan satır cariden silinir.
export function invoicePaymentActions(inv: InvoiceLike, p: InvoicePaymentLike): (RowActions & { customerPayment: boolean }) | null {
  if (!p?.id || p.void_op) return null;
  if (p.source === "customer_payment") return { edit: false, void: false, customerPayment: true };
  const editable =
    !["iptal", "taslak"].includes(String(inv.status || "")) &&
    inv.invoice_type !== "teklif" &&
    inv.parasut_item_type !== "refund" &&
    inv.money_state !== "refund" &&
    inv.edoc_state !== "blocked_mismatch";
  return { edit: editable, void: true, customerPayment: false };
}

export function invoicePaymentCollection(inv: InvoiceLike, p: InvoicePaymentLike): Collection {
  return {
    type: "invoice",
    id: String(p.id || ""),
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    amount: p.amount,
    date: p.date,
    method: p.method,
    note: p.notes || "",
    account_id: p.account_id,
    parasut: ["synced", "syncing", "uncertain"].includes(parasutPayState(p)),
  };
}

export const CUSTOMER_METHODS = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart" },
  { value: "havale", label: "Havale / EFT" },
  { value: "çek", label: "Çek" },
];
export const INVOICE_METHODS = [
  { value: "nakit", label: "Nakit" },
  { value: "havale", label: "Havale / EFT" },
  { value: "kredi_karti", label: "Kredi kartı" },
  { value: "cek", label: "Çek" },
  { value: "diger", label: "Diğer" },
];
export function collectionMethods(type: CollectionType) {
  return type === "invoice" ? INVOICE_METHODS : CUSTOMER_METHODS;
}

export type EditInput = { amount: string; date: string; method: string; note: string; accountId: string };
export function collectionEditBody(c: { type: CollectionType }, f: EditInput): Record<string, string> {
  const acc: Record<string, string> = f.accountId ? { account_id: f.accountId } : {};
  return c.type === "invoice"
    ? { amount: f.amount, date: f.date, method: f.method, notes: f.note, ...acc }
    : { amount: f.amount, payment_date: f.date, payment_method: f.method, note: f.note, ...acc };
}

// Ondalık metin/sayı → kuruş (float karşılaştırması yok).
function minorOf(v: unknown): number | null {
  const s = typeof v === "number" ? v.toFixed(2) : String(v ?? "").trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  return m ? Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0") || "0") : null;
}

// Para kaydı aynı mı kalıyor (yalnız not/yöntem)?  Değilse sunucu eskisini geri alıp yenisini yazar.
export function collectionEditInPlace(c: Collection, f: { amount: string; date: string; accountId: string }): boolean {
  const a = minorOf(f.amount);
  return a !== null && a === minorOf(c.amount) && f.date === String(c.date || "").slice(0, 10) && (f.accountId || "") === (c.account_id || "");
}

// "uncertain" (aynı anahtarla yeniden gönder) | "pending" | "partial" | "conflict" | "rejected" (yeni anahtar)
export type WriteKind = "uncertain" | "pending" | "partial" | "conflict" | "rejected";
export function collectionWriteKind(e: any): WriteKind {
  const code = e?.code;
  if (code === "MONEY_PARTIAL") return "partial";
  if (code === "MONEY_PENDING" || code === "OPERATION_PENDING") return "pending";
  if (code === "IDEMPOTENCY_CONFLICT") return "conflict";
  const status = Number(e?.status);
  return !Number.isFinite(status) || status === 0 || status >= 500 || code === "MONEY_INCOMPLETE" ? "uncertain" : "rejected";
}

const TEXTS: Record<string, string> = {
  COLLECTION_NOT_FOUND: "Tahsilat bulunamadı; silinmiş ya da değiştirilmiş olabilir. Liste yenilendi.",
  COLLECTION_VOIDED: "Bu tahsilat zaten silinmiş. Liste yenilendi.",
  OPERATION_PENDING: "Bu kayıt hâlâ tamamlanıyor; birazdan tekrar deneyin.",
  INVOICE_BUSY: "Fatura şu anda başka bir işlemde. Birazdan tekrar deneyin.",
  INVOICE_BLOCKED: "Fatura e-belge ya da Paraşüt durumu nedeniyle kilitli; bu tahsilat şu anda değiştirilemez.",
  PAYMENT_EXCEEDS_REMAINING: "Yeni tutar faturanın kalan borcundan büyük olamaz.",
  COLLECTION_IS_CUSTOMER_PAYMENT: "Bu tutar bir cari tahsilatından faturaya dağıtılmış. Silmek ya da düzenlemek için carinin ekstresini kullanın.",
  COLLECTION_EDIT_NOT_ALLOWED: "Bu faturadaki tahsilat düzenlenemez, yalnız silinebilir (iptal, taslak, teklif ya da iade faturası).",
  COLLECTION_AMOUNT_INCONSISTENT: "Faturanın ödenen tutarı bu tahsilattan küçük görünüyor; kayıt değiştirilmedi. Web panelinden kontrol edin.",
  COLLECTION_REPLACE_FAILED: "Tahsilat aynı anda başka bir işlemle değişti; kayıt değiştirilmedi. Listeyi yenileyip tekrar deneyin.",
  CURRENCY_MISMATCH: "Seçilen hesabın para birimi tahsilatın para biriminden farklı. Aynı para biriminde bir hesap seçin.",
  METHOD_INVALID: "Ödeme yöntemi geçersiz. Listeden bir yöntem seçin.",
  ACCOUNT_INACTIVE: "Seçilen hesap pasif. Başka bir hesap seçin.",
  MONEY_PENDING: "İşlem sunucuda tamamlanıyor; yeniden göndermeyin. Kayıt birkaç dakika içinde listeye düşer.",
  MONEY_PARTIAL: "İşlem yarım kaldı ve geri alınamadı. Yeniden göndermeyin; önce Kasa hareketlerini kontrol edin.",
  MONEY_INCOMPLETE: "İşlem tamamlanamadı. Aynı bilgilerle yeniden gönderebilirsiniz; ikinci kez işlenmez.",
  IDEMPOTENCY_CONFLICT: "Bu işlem daha önce farklı bilgilerle gönderilmiş. Ekranı kapatıp kayıtları kontrol edin.",
};
const UNCERTAIN_TEXT =
  "Bağlantı koptu ya da sunucu yanıt vermedi; işlem kaydedilmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz, ikinci kez kaydedilmez.";

export function collectionErrorText(e: any): string {
  const code = e?.code;
  if (code && TEXTS[code]) return TEXTS[code];
  if (collectionWriteKind(e) === "uncertain") return UNCERTAIN_TEXT;
  return (typeof e?.message === "string" && e.message.trim()) || "İşlem kaydedilemedi.";
}

export function collectionWarnings(res: any): string[] {
  const texts = Array.isArray(res?.warning_texts) ? res.warning_texts.filter((t: unknown) => typeof t === "string" && t.trim()) : [];
  if (texts.length) return texts;
  const codes = Array.isArray(res?.warnings) ? res.warnings : [];
  return codes.includes("PARASUT_NOT_UPDATED") ? [PARASUT_NOT_UPDATED_TEXT] : [];
}

export function collectionDoneText(kind: "void" | "edit", res: any): string {
  if (res?.replayed === true) return REPLAYED_TEXT;
  if (kind === "void") return "Tahsilat silindi; bakiye ve faturalar güncellendi.";
  return res?.mode === "in_place" ? "Tahsilat güncellendi." : "Tahsilat güncellendi; eski kayıt geri alınıp yenisi yazıldı.";
}

// Cari siparişleri: fatura no → Paraşüt fatura no → null ("Faturalanmadı").
export function orderInvoiceLabel(o: { invoice_number?: unknown; parasut_invoice_id?: unknown }): string | null {
  for (const v of [o?.invoice_number, o?.parasut_invoice_id]) {
    const s = v === null || v === undefined ? "" : String(v).trim();
    if (s) return s;
  }
  return null;
}
