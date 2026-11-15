// D-12 satış faturası yaşam döngüsü (saf modül; birim testi dev/test-document-lifecycle.mjs). Sözleşme: docs/pm/tasarim/D-12.md.
// Web: lib/documentLifecycle.js + components/sales/InvoiceLifecycle.jsx. Arayüz kapıları sunucunun `actions` alanından; yoksa durumdan türetilir.

type Inv = Record<string, any> | null | undefined;

const docAxis = (inv: Inv) => {
  const st = inv?.status;
  if (st === "taslak") return "draft";
  if (st === "iptal") return "cancelled";
  return "issued";
};
export const isMirror = (inv: Inv) => inv?.read_only === true || inv?.source === "parasut_mirror";

export type LifecycleActions = {
  edit_amounts: boolean;
  edit_meta: boolean;
  cancel: boolean;
  return: boolean;
  copy: boolean;
  archive: boolean;
  preview: boolean;
  share: boolean;
  open_in_parasut: boolean;
};

export function lifecycleActions(inv: Inv): LifecycleActions {
  const mirror = isMirror(inv);
  const axis = docAxis(inv);
  const draft = axis === "draft";
  const cancelled = axis === "cancelled";
  const imported = inv?.source === "parasut_import";
  const derived: LifecycleActions = {
    edit_amounts: !mirror && draft,
    edit_meta: !mirror && !cancelled,
    cancel: !mirror && !imported && !draft && !cancelled,
    return: !mirror && !imported && !draft && !cancelled && inv?.invoice_type !== "iade" && inv?.invoice_type !== "teklif",
    copy: !mirror,
    archive: !mirror,
    preview: true,
    share: !mirror && !cancelled && inv?.invoice_type === "teklif",
    open_in_parasut: mirror,
  };
  const server = inv?.actions && typeof inv.actions === "object" ? inv.actions : {};
  const out: any = { ...derived };
  for (const k of Object.keys(derived)) if (typeof server[k] === "boolean") out[k] = server[k];
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
  HAS_RETURNS: "Bu faturanın iadesi var; önce iade belgesini iptal edin.",
  ISSUED_AMOUNTS_LOCKED: "Kesilmiş faturada tutar alanları değiştirilemez. Düzeltme için faturayı iptal edip yenisini oluşturun.",
  CONFIRM_REQUIRED: "Bu işlem onay gerektirir.",
  RECIPIENT_REQUIRED: "En az bir alıcı e-posta adresi girin.",
  NOT_A_QUOTE: "Paylaşım yalnız teklif ve proforma belgelerinde kullanılır.",
  IDEMPOTENCY_MISMATCH: "Aynı işlem anahtarı farklı bilgiyle kullanıldı; ekranı kapatıp yeniden deneyin.",
};
export function lifecycleErrorText(err: any, fallback = "İşlem tamamlanamadı."): string {
  if (err?.code && TEXTS[err.code]) return TEXTS[err.code];
  const msg = typeof err?.message === "string" ? err.message.trim() : "";
  return msg && !/^Sunucu hatası \(\d+\)$/.test(msg) ? msg : fallback;
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
  archived: "Arşivlendi",
  unarchived: "Arşivden çıkarıldı",
  shared: "Paylaşıldı",
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
