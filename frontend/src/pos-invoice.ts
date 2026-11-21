// Fişten fatura ve fiş silme (saf modül; birim testi dev/test-pos-invoice.mjs). Faz A M3a/M3b.
// Sunucu: routers/pos_receipts.py (DELETE /pos/receipts/{id}, POST /pos/receipts/{id}/invoice), orchestration/pos_invoice.py ensure_unchanged.
// Fişe bağlı taslakta kalem, miktar, fiyat, KDV, indirim ve stok fişten korunur (değişirse 409); tahsilat yeniden işlenmez;
// açık hesap satışında cari değişmez. Mobil formu kalemleri net fiyatla yeniden kurar; taslak brüt fiyat taşır. Bu yüzden kalemler
// kayıttaki haliyle (sunucunun imza alanları) gönderilir. Web: SalesInvoiceFormOS (financialLocked), POSReceiptsPage.

const SIGNATURE_KEYS = ["line_key", "kind", "product_id", "product_name", "description", "quantity", "unit", "unit_price", "price_basis", "gross_unit_price", "vat_rate", "discount", "withholding", "other_taxes"];

export const isPosLocked = (record: any) => Boolean(record?.pos_sale_id);
export const canChangeCustomer = (record: any) => !(isPosLocked(record) && record?.pos_payment_type === "acik_hesap");

export function posLockedBody(body: Record<string, any>, record: any): Record<string, any> {
  const out: Record<string, any> = { ...body };
  delete out.collection;
  // %0 KDV'li satırın istisna kodu fiyat imzasına girmez; formda seçilen kod (aynı line_key) kayıt kalemine eklenir (web financialLocked).
  const codes = new Map<string, string>();
  for (const b of Array.isArray(body?.items) ? body.items : []) if (b?.line_key && b?.vat_exemption_code) codes.set(String(b.line_key), String(b.vat_exemption_code));
  out.items = (Array.isArray(record?.items) ? record.items : []).map((it: any) => {
    const line: Record<string, any> = {};
    for (const k of SIGNATURE_KEYS) if (it && k in it) line[k] = it[k];
    const code = codes.get(String(it?.line_key || ""));
    if (code && Number(it?.vat_rate) === 0) line.vat_exemption_code = code;
    return line;
  });
  out.stock_mode = "none";
  delete out.invoice_discount_type;
  delete out.invoice_discount_value;
  if (record?.invoice_discount_type && record?.invoice_discount_value != null && Number(record.invoice_discount_value) !== 0) {
    out.invoice_discount_type = record.invoice_discount_type;
    out.invoice_discount_value = record.invoice_discount_value;
  }
  if (!canChangeCustomer(record)) {
    out.customer_id = record.customer_id ?? null;
    out.customer_name = record.customer_name ?? out.customer_name;
  }
  return out;
}

export const posLockNote = (record: any) =>
  `Bu fatura ${record?.pos_sale_number || "bir"} numaralı satış fişinden oluşturuldu. Ürünler, tutarlar ve stok fişten korunur. Tahsilat tekrar işlenmez.`;

export function receiptActions(s: any): { convert: string | null; remove: boolean; removeNote: string | null } {
  if (s?.deleted) return { convert: null, remove: false, removeNote: null };
  const convertible = s?.status === "completed" && !s?.receipt_delete_started;
  const linked = Boolean(s?.invoice_id);
  return {
    convert: convertible ? (linked ? "Bağlı faturayı aç" : "Faturaya dönüştür") : null,
    remove: !linked,
    removeNote: linked ? "Bu satış bir faturaya bağlıdır. Fişi silmeden önce bağlı faturanın işlemlerini tamamlayın." : null,
  };
}

export const deleteConfirmText = (s: any, totalText: string) =>
  `${s?.sale_number || "Bu"} numaralı ${totalText} tutarındaki satış aktif listeden kaldırılacak. Bağlı kasa/kart tahsilatı geri alınacak, varsa açık hesap borcu kapatılacak ve satılan ürünler stoğa iade edilecek. İşlem geçmişi korunur.`;

export function deleteResult(r: any): { done: boolean; text: string } {
  if (r?.deleted)
    return {
      done: true,
      text: Array.isArray(r?.warnings) && r.warnings.length
        ? "Satış fişi silindi ve kasa tahsilatı geri alındı. Katalogda artık bulunmayan ürünlerin stok iadesi atlandı."
        : "Satış fişi silindi. Kasa tahsilatı geri alındı ve stok iadesi tamamlandı.",
    };
  return { done: false, text: "Silme işlemi kaydedildi. Kasa veya cari işlemi tamamlanıyor; aynı fişten yeniden deneyebilirsiniz." };
}

export function receiptErrorText(e: { status?: number; message?: string } | null | undefined, op: "convert" | "delete") {
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m)) return m;
  return op === "convert" ? "Fatura taslağı oluşturulamadı. Yeniden deneyin." : "Satış fişi silinemedi. Yeniden deneyin.";
}

// Ödemesi fişte alınmış satış (nakit/kart/karma): faturada yeniden tahsilat alınmaz (sunucu kesimde fiş tutarını ödenmiş sayar).
// Açık hesap satışında borç caride durur; tahsilat fatura üzerinden alınabilir.
export const posPrepaid = (inv: any) => isPosLocked(inv) && inv?.pos_payment_type !== "acik_hesap";
export const POS_PREPAID_NOTE = "Bu satışın tahsilatı satış fişinde kayıtlı; fatura üzerinden yeniden tahsilat alınmaz.";
