// C8 — yeni satış teklifi formu (saf modül; birim testi dev/test-offer-form.mjs).
// Web: frontend/src/pages/TekliflerPage.js OfferForm + CreateModal.  Sunucu: POST /parasut/sales-offers
//   {contact_id, description, issue_date?, due_date?, currency, note?, items: [{description, quantity, unit_price, vat_rate, discount_type, discount_value, product_id?}]}
// Teklif Paraşüt'te oluşturulur; toplamları Paraşüt hesaplar.  Buradaki toplam yalnız ÖNİZLEMEDİR (kuruş, yarım yukarı).
// İşlem anahtarlı (13 Kas 2026): belirsiz sonuçta aynı anahtarla güvenli yeniden gönderim; kurallar offerWriteKind.

export const OFFER_CURRENCIES = ["TRL", "USD", "EUR", "GBP"] as const;
export const VAT_RATES = [0, 1, 8, 10, 18, 20] as const;

export type DiscountType = "percentage" | "amount";
export type OfferLine = {
  description: string;
  product_id: string;
  quantity: string;
  unit_price: string;
  vat_rate: number;
  discount_type: DiscountType;
  discount_value: string;
};
export type OfferForm = {
  contact_id: string;
  contact_name: string;
  description?: string;
  issue_date?: string;
  due_date?: string;
  currency?: string;
  note?: string;
  items: OfferLine[];
};

export function blankLine(): OfferLine {
  return { description: "", product_id: "", quantity: "1", unit_price: "", vat_rate: 20, discount_type: "percentage", discount_value: "" };
}

// Türkçe ondalık ("1.250,50", "2,5", "1250.5") → sayı; negatif, geçersiz ya da fazla ondalık → null.
export function trNumber(text: string, maxDecimals: number): number | null {
  const raw = String(text ?? "").trim().replace(/\s/g, "");
  if (!raw) return null;
  let n: string;
  if (raw.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(raw)) return null;
    n = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d+$/.test(raw) && !/^\d{1,3}\.\d{3}$/.test(raw)) {
    n = raw;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    n = raw.replace(/\./g, "");
  } else if (/^\d+$/.test(raw)) {
    n = raw;
  } else return null;
  const frac = n.split(".")[1] || "";
  if (frac.length > maxDecimals) return null;
  return Number(n);
}

const trMoney = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};

// Paraşüt ürün listesinden seçim (web ProductRowInput.handlePick): ad, kimlik, liste fiyatı (yoksa satış fiyatı), KDV.
export function lineFromProduct(p: { id?: unknown; name?: unknown; list_price?: unknown; sales_price?: unknown; vat_rate?: unknown }, prev: OfferLine): OfferLine {
  const price = p.list_price || p.sales_price;
  const vat = p.vat_rate != null && p.vat_rate !== "" ? parseInt(String(p.vat_rate), 10) : NaN;
  return {
    ...prev,
    description: String(p.name || ""),
    product_id: String(p.id || ""),
    unit_price: price ? trMoney(price) : prev.unit_price,
    vat_rate: Number.isFinite(vat) ? vat : prev.vat_rate,
  };
}

// --- tahmini toplamlar (kuruş, BigInt, yarım yukarı) ---
const scaled = (v: number | null, digits: number) => (v === null ? null : BigInt(Math.round(v * 10 ** digits)));
const divHalfUp = (n: bigint, d: bigint) => (n <= 0n ? 0n : (2n * n + d) / (2n * d));

export function offerTotals(lines: OfferLine[]) {
  let subtotal = 0n;
  let discount = 0n;
  let vat = 0n;
  for (const l of lines) {
    const q = scaled(trNumber(l.quantity, 4), 4);
    const p = scaled(trNumber(l.unit_price, 2), 2);
    if (q === null || p === null || q <= 0n) continue;
    const gross = divHalfUp(q * p, 10000n);
    const dv = trNumber(l.discount_value, 2) ?? 0;
    let disc = l.discount_type === "amount" ? scaled(dv, 2)! : divHalfUp(gross * scaled(dv, 2)!, 10000n);
    if (disc > gross) disc = gross;
    const net = gross - disc;
    subtotal += gross;
    discount += disc;
    vat += divHalfUp(net * BigInt(l.vat_rate || 0), 100n);
  }
  return { subtotal, discount, vat, total: subtotal - discount + vat };
}

export function validateOffer(f: OfferForm): { ok: boolean; form: string; lines: Record<number, string> } {
  const lines: Record<number, string> = {};
  let form = "";
  if (!f.contact_id) form = "Müşteri seçin.";
  else if (!f.items.length) form = "En az bir satır ekleyin.";
  f.items.forEach((l, i) => {
    const q = trNumber(l.quantity, 4);
    const p = trNumber(l.unit_price, 2);
    const dv = l.discount_value.trim() ? trNumber(l.discount_value, 2) : 0;
    if (!l.description.trim()) lines[i] = "Ürün / hizmet adını yazın.";
    else if (p === null) lines[i] = "Birim fiyat girin (ör. 1.250,50).";
    else if (q === null || q <= 0) lines[i] = "Adet sıfırdan büyük olmalı.";
    else if (dv === null) lines[i] = "İndirim değeri geçersiz.";
    else if (l.discount_type === "percentage" && dv > 100) lines[i] = "Yüzde indirim %100'ü aşamaz.";
    else if (l.discount_type === "amount" && Math.round(dv * 100) > Math.round(q * p * 100)) lines[i] = "İndirim satır tutarını aşamaz.";
  });
  return { ok: !form && Object.keys(lines).length === 0, form, lines };
}

export function offerPayload(f: OfferForm) {
  return {
    contact_id: f.contact_id,
    description: (f.description || "").trim(),
    ...(f.issue_date ? { issue_date: f.issue_date } : {}),
    ...(f.due_date ? { due_date: f.due_date } : {}),
    currency: f.currency || "TRL",
    ...(f.note && f.note.trim() ? { note: f.note.trim() } : {}),
    items: f.items.map((l) => ({
      description: l.description.trim(),
      quantity: trNumber(l.quantity, 4) || 1,
      unit_price: trNumber(l.unit_price, 2) ?? 0,
      vat_rate: Number(l.vat_rate) || 0,
      discount_type: l.discount_type || "percentage",
      discount_value: trNumber(l.discount_value, 2) ?? 0,
      ...(l.product_id ? { product_id: l.product_id } : {}),
    })),
  };
}

// 13 Kas 2026 sözleşmesi (docs/mobil-oturum-icin-notlar.md): POST /parasut/sales-offers Idempotency-Key alır.
//  • retry-same: ağ hatası / kodsuz 5xx — AYNI anahtarla yeniden gönderilir (sunucu ikinci teklif açmaz).
//  • pending: 409 OPERATION_PENDING — form kilitli, aynı anahtarla birkaç saniye sonra yeniden gönderilir.
//  • check: PARASUT_RESULT_UNCERTAIN / PARASUT_UNAVAILABLE / PARASUT_TIMEOUT / IDEMPOTENCY_CONFLICT — teklif oluşmuş olabilir;
//    yeniden gönderim YOK, "Teklifleri kontrol et".
//  • rejected: kesin ret (PARASUT_VALIDATION, PARASUT_AUTH, PARASUT_RATE_LIMITED, PARASUT_PRESEND_UNAVAILABLE, PARASUT_NOT_FOUND, 400…) — yeni anahtar.
export type OfferWriteKind = "retry-same" | "pending" | "check" | "rejected";
const CHECK_CODES = new Set(["PARASUT_RESULT_UNCERTAIN", "PARASUT_UNAVAILABLE", "PARASUT_TIMEOUT", "IDEMPOTENCY_CONFLICT"]);

export function offerWriteKind(e: any): OfferWriteKind {
  const code = typeof e?.code === "string" ? e.code : "";
  if (code === "OPERATION_PENDING") return "pending";
  if (CHECK_CODES.has(code)) return "check";
  const s = Number(e?.status);
  if (!code && (!Number.isFinite(s) || s === 0 || s >= 500)) return "retry-same";
  return "rejected";
}

const OFFER_TEXTS: Record<string, string> = {
  PARASUT_RATE_LIMITED: "Paraşüt şu anda çok fazla istek alıyor. Birkaç dakika sonra yeniden deneyin.",
  PARASUT_NOT_FOUND: "Paraşüt'te ilgili kayıt bulunamadı (müşteri ya da ürün silinmiş olabilir). Seçimleri kontrol edin.",
  PARASUT_RESULT_UNCERTAIN: "Önceki gönderimin sonucu Paraşüt'ten alınamadı; teklif oluşmuş olabilir. Paraşüt'teki Teklifler listesini kontrol edin; yoksa formu yeniden açıp gönderin.",
  PARASUT_UNAVAILABLE: "Paraşüt'ten geçerli yanıt alınamadı; teklif oluşmuş olabilir. Teklifler listesini kontrol edin; yoksa formu yeniden açıp gönderin.",
  PARASUT_TIMEOUT: "Paraşüt zamanında yanıt vermedi; teklif oluşmuş olabilir. Teklifler listesini kontrol edin; yoksa formu yeniden açıp gönderin.",
  IDEMPOTENCY_CONFLICT: "Bu teklif daha önce farklı bilgilerle gönderilmiş. Formu kapatıp Teklifler listesini kontrol edin.",
  OPERATION_PENDING: "Teklif hâlâ Paraşüt'e gönderiliyor; birkaç saniye içinde aynı teklif yeniden denenecek.",
};

export function offerErrorText(e: any): string {
  const code = typeof e?.code === "string" ? e.code : "";
  const detail = typeof e?.message === "string" ? e.message.trim() : "";
  if (code === "PARASUT_AUTH") return `${detail || "Paraşüt yetkisi reddedildi."} Paraşüt bağlantısını yenileyin (web paneli > Entegrasyonlar).`;
  if (OFFER_TEXTS[code]) return OFFER_TEXTS[code];
  if (offerWriteKind(e) === "retry-same")
    return "Bağlantı koptu ya da sunucu yanıt vermedi; teklif oluşmuş olabilir. Bilgiler kilitlendi: aynı teklifi yeniden gönderebilirsiniz, ikinci kez oluşturulmaz.";
  return detail || "Teklif oluşturulamadı.";
}

export function offerDoneText(r: any): string {
  return r?.replayed === true ? "Bu teklif zaten oluşturulmuştu; ikinci kez gönderilmedi." : "Teklif oluşturuldu";
}

export function addDays(iso: string, days: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}
