// Satış faturası formu: ekran durumu ↔ sunucu sözleşmesi (docs/pm/tasarim/g2-satis-faturasi-sozlesmesi.md).
// Saf modül (birim testi dev/test-document-form.mjs); web frontend/src/lib/documentForm.js ile aynı gövde ve doğrulama.
// Tutarlar POST /documents/preview'dan gelir (sunucu = kayıt); FLOAT YOK: tutarlar noktalı metin olarak taşınır.

export const STOPAJ_RATES = ["20", "17", "15", "10", "5", "3"];
export const ACCOMMODATION_RATES = ["1", "0"];
export const WITHHOLDING_RATES = [20, 30, 40, 50, 70, 90, 100].map((rate) => ({ rate, label: `${rate / 10}/10` }));
export const TAX_LABEL: Record<string, string> = { "0071": "ÖTV", "4080": "ÖİV", "0059": "Konaklama vergisi" };

export type Discount = { type: "percentage" | "amount"; value: string } | null;
export type Withholding = { rate: number; code: string } | null;
export type OtherTax = { code: string; type: "rate" | "amount"; value: string };
export type DocLine = {
  line_key: string;
  kind: "text" | "product" | "service";
  product_id: string | null;
  product_name: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
  vat_rate: number;
  // E-46: %0 KDV'li satırda istisna / ihraç kayıtlı kodu (kesmede zorunlu; sunucu LINE_EXEMPTION_INVALID).
  vat_exemption_code: string;
  tracks_stock: boolean | null;
  discount: Discount;
  withholding: Withholding;
  other_taxes: OtherTax[];
  warehouse_id: string | null;
};
export type DocForm = {
  customer_id: string | null;
  customer_name: string;
  customer_tax_no: string;
  customer_tax_office: string;
  customer_address: string;
  document_name: string;
  issue_date: string;
  due_date: string;
  stock_mode: "with_document" | "none" | null;
  lines: DocLine[];
  doc_discount: Discount;
  stopaj_rate: string;
  accommodation_rate: string;
  withholding_all: Withholding;
  notes: string;
  // G2 §4: not seçenekleri (IBAN ve müşteri bakiyesi yazdırma/PDF'te nottan üretilir).
  include_iban: boolean;
  iban: string;
  include_balance: boolean;
  // Teklif (WP-21): geçerlilik tarihi; teklifte vade, stok ve tahsilat yoktur.
  valid_until: string;
};
export type DocType = "sales" | "quote";

const rid = () => Math.random().toString(16).slice(2, 14).padEnd(12, "0");
export const newLineKey = () => `l-${rid()}`;
export const newCreateKey = () => `frm-${rid()}${rid()}`;

const trim0 = (v: unknown) => {
  const t = String(v ?? "");
  return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
};
export const toTr = (v: unknown) => (v === null || v === undefined || v === "" ? "" : trim0(String(v)).replace(".", ","));

// Web parseTrAmount: "1.250,50" → "1250.50", "1.250" → "1250" (binlik), "12.5" → "12.5"; negatif ve fazla ondalık geçersiz.
export function dotAmount(input: unknown, maxDecimals: number): string | null {
  let t = String(input ?? "").trim().replace(/\s/g, "");
  if (!t || t.startsWith("-") || t.startsWith("−")) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m || (m[2] && m[2].length > maxDecimals)) return null;
  return t;
}
const dot = (text: unknown, max: number) => dotAmount(text, max) ?? String(text ?? "").trim();
const has = (v: unknown) => String(v ?? "").trim() !== "";

export function blankLine(key?: string): DocLine {
  return {
    line_key: key || newLineKey(), kind: "text", product_id: null, product_name: "", description: "", quantity: "1", unit: "ADET", price: "",
    vat_rate: 20, vat_exemption_code: "", tracks_stock: false, discount: null, withholding: null, other_taxes: [], warehouse_id: null,
  };
}

export function blankForm(today: string): DocForm {
  return {
    customer_id: null, customer_name: "", customer_tax_no: "", customer_tax_office: "", customer_address: "",
    document_name: "", issue_date: today, due_date: today, stock_mode: null, lines: [], doc_discount: null, stopaj_rate: "", accommodation_rate: "",
    withholding_all: null, notes: "", include_iban: false, iban: "", include_balance: false, valid_until: "",
  };
}

function lineBody(l: DocLine, stockMode: string | null) {
  const out: Record<string, unknown> = { line_key: l.line_key, kind: l.product_id ? (l.kind === "service" ? "service" : "product") : "text" };
  if (l.product_id) {
    out.product_id = l.product_id;
    if (l.product_name) out.product_name = l.product_name;
  }
  if (has(l.description)) out.description = l.description.trim();
  out.quantity = dot(l.quantity, 3);
  out.unit = l.unit || "ADET";
  out.unit_price = has(l.price) ? dot(l.price, 4) : "0";
  out.price_basis = "net";
  out.vat_rate = Number(l.vat_rate);
  if (Number(l.vat_rate) === 0 && has(l.vat_exemption_code)) out.vat_exemption_code = String(l.vat_exemption_code).trim();
  if (l.discount && has(l.discount.value)) out.discount = { type: l.discount.type, value: dot(l.discount.value, 2) };
  if (l.withholding) out.withholding = { rate: Number(l.withholding.rate), code: String(l.withholding.code || "").trim() };
  if (l.other_taxes?.length) out.other_taxes = l.other_taxes.map((t) => ({ code: t.code, type: t.type, value: dot(t.value, 2) }));
  if (stockMode === "with_document" && l.product_id && l.warehouse_id) out.warehouse_id = l.warehouse_id;
  return out;
}

export function buildBody(f: DocForm, opts: { action?: "save_draft" | "issue"; createKey?: string; stockMode?: string | null; docType?: DocType } = {}) {
  const quote = opts.docType === "quote";
  const stockMode = quote ? null : opts.stockMode || null;
  const body: Record<string, any> = {
    customer_id: f.customer_id || null, customer_name: String(f.customer_name || "").trim(), customer_tax_no: f.customer_tax_no, customer_tax_office: f.customer_tax_office,
    customer_address: f.customer_address, issue_date: f.issue_date, due_date: quote ? null : f.due_date || null, currency: "TRY", notes: f.notes,
    invoice_type: quote ? "teklif" : "satis", action: opts.action || "save_draft", items: f.lines.map((l) => lineBody(l, stockMode)),
  };
  if (opts.createKey) body.create_key = opts.createKey;
  if (quote && f.valid_until) body.valid_until = f.valid_until;
  if (stockMode) body.stock_mode = stockMode;
  if (has(f.document_name)) body.document_name = f.document_name.trim();
  const dd = f.doc_discount;
  if (dd && has(dd.value)) {
    body.invoice_discount_type = dd.type;
    body.invoice_discount_value = dot(dd.value, 2);
  }
  if (f.stopaj_rate) body.stopaj_rate = f.stopaj_rate;
  if (f.accommodation_rate !== "" && f.accommodation_rate != null) body.accommodation_tax_rate = f.accommodation_rate;
  if (f.withholding_all) body.withholding_all = { rate: Number(f.withholding_all.rate), code: String(f.withholding_all.code || "").trim() };
  if (f.include_iban || f.include_balance) {
    body.note_options = { include_iban: Boolean(f.include_iban), include_customer_balance: Boolean(f.include_balance) };
    if (f.include_iban) body.note_options.iban = String(f.iban || "").trim().toUpperCase();
  }
  return body;
}

export function previewBody(f: DocForm, stockMode: string | null, docType: DocType = "sales") {
  const b = buildBody(f, { stockMode, docType });
  const out: Record<string, any> = { type: docType === "quote" ? "quote" : "sales", lines: b.items, currency: "TRY" };
  if (b.invoice_discount_type) out.doc_discount = { type: b.invoice_discount_type, value: b.invoice_discount_value };
  for (const k of ["stopaj_rate", "accommodation_tax_rate", "withholding_all", "note_options", "stock_mode"]) if (b[k] !== undefined) out[k] = b[k];
  if (b.customer_name) {
    out.customer_name = b.customer_name;
    if (b.customer_id) out.customer_id = b.customer_id;
  }
  return out;
}

// Web useDocumentMeta DEFAULT_EXEMPTIONS; sunucu /documents/meta `exemptions` gönderirse o kullanılır.
export type Exemption = { code: string; label: string; group?: string };
export const DEFAULT_EXEMPTIONS: Exemption[] = [
  { code: "301", label: "Mal ihracatı (KDV 11/1-a)", group: "exemption" },
  { code: "302", label: "Hizmet ihracatı (KDV 11/1-a)", group: "exemption" },
  { code: "351", label: "İstisna olmayan diğer", group: "exemption" },
  { code: "701", label: "İhraç kayıtlı · 3065 s. KDV Kanunu", group: "export_registered" },
  { code: "702", label: "İhraç kayıtlı · DİİB / geçici kabul", group: "export_registered" },
  { code: "703", label: "İhraç kayıtlı · 4760 s. ÖTV Kanunu", group: "export_registered" },
  { code: "704", label: "İhraç kayıtlı · 3065 s. KDV Kanunu (diğer)", group: "export_registered" },
];
export const isExportCode = (code: unknown) => /^70[1-4]$/.test(String(code || ""));
// Fişe bağlı (kilitli) faturada KDV oranı ve tevkifat fiş imzasındadır (orchestration/pos_invoice.py); ihraç kayıtlı kod bunları
// değiştireceği için yalnız tüm satırlar zaten %0 ve tevkifatsızsa seçilebilir. İstisna kodunun kendisi imzada değildir.
export const LOCKED_VAT_TEXT = "Fişten gelen faturada KDV oranı değiştirilemez.";
export const exportCodesAllowed = (lines: DocLine[]) => lines.every((l) => Number(l.vat_rate) === 0 && !l.withholding);
export function exemptionChoices(list: Exemption[], lines: DocLine[], locked: boolean) {
  return locked && !exportCodesAllowed(lines) ? list.filter((x) => !isExportCode(x.code)) : list;
}
// KDV oranı değişimi: %0 dışında istisna kodu, %0'da tevkifat düşer.
export function vatPatch(l: DocLine, v: number): Pick<DocLine, "vat_rate" | "vat_exemption_code" | "withholding"> {
  return { vat_rate: v, vat_exemption_code: v === 0 ? l.vat_exemption_code || "" : "", withholding: v > 0 ? l.withholding : null };
}
// İhraç kayıtlı kod (701-704) tüm satırlara uygulanır ve KDV'yi %0'a çeker; diğer kodlar yalnız o satırı etkiler (web DocumentLines).
export function setExemption(lines: DocLine[], key: string, code: string): DocLine[] {
  return lines.map((l) => {
    if (l.line_key === key) return { ...l, vat_exemption_code: code };
    return isExportCode(code) ? { ...l, vat_rate: 0, vat_exemption_code: code, withholding: null } : l;
  });
}

export function validateForm(f: DocForm, opts: { stockMode?: string | null; docType?: DocType; action?: "save_draft" | "issue" } = {}): Record<string, string> {
  const e: Record<string, string> = {};
  const quote = opts.docType === "quote";
  if (!String(f.customer_name || "").trim()) e.customer = "Müşteri zorunludur.";
  if (!f.issue_date) e.issue = quote ? "Teklif tarihi zorunludur." : "Fatura tarihi zorunludur.";
  if (!quote && f.due_date && f.issue_date && f.due_date < f.issue_date) e.due = "Vade, fatura tarihinden önce olamaz.";
  if (quote && f.valid_until && f.issue_date && f.valid_until < f.issue_date) e.valid = "Geçerlilik tarihi, teklif tarihinden önce olamaz.";
  f.lines.forEach((l, i) => {
    if (!l.product_id && !has(l.description)) e[`line${i}`] = "Bir ürün seçin ya da açıklama yazın.";
    const q = dotAmount(l.quantity, 3);
    if (q === null || !(Number(q) > 0)) e[`qty${i}`] = "Geçerli bir miktar girin.";
    else if (opts.stockMode === "with_document" && l.product_id && l.tracks_stock && !Number.isInteger(Number(q))) e[`qty${i}`] = "Stoklu üründe miktar tam sayı olmalı.";
    if (dotAmount(l.price, 4) === null) e[`price${i}`] = "Geçerli bir fiyat girin.";
    if (l.discount && has(l.discount.value) && dotAmount(l.discount.value, 2) === null) e[`discount${i}`] = "İskonto değeri geçerli değil.";
    if (l.withholding && !has(l.withholding.code)) e[`withholding${i}`] = "Tevkifat kodunu girin.";
    if ((l.other_taxes || []).some((t) => dotAmount(t.value, 2) === null)) e[`tax${i}`] = "Vergi değeri geçerli değil.";
    if (!quote && opts.action === "issue" && Number(l.vat_rate) === 0 && !has(l.vat_exemption_code)) e[`exemption${i}`] = "%0 KDV'li satırda istisna kodu seçin.";
  });
  const dd = f.doc_discount;
  if (dd && has(dd.value) && dotAmount(dd.value, 2) === null) e.doc_discount = "Ara toplam indirimi geçerli değil.";
  if (f.withholding_all && !has(f.withholding_all.code)) e.withholding_all = "Tevkifat kodunu girin.";
  if (f.include_iban && !/^TR\d{24}$/.test(String(f.iban || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))) e.iban = "Geçerli bir IBAN girin (TR ile başlayan 26 karakter).";
  return e;
}

const CODE_TEXT: Record<string, string> = {
  PARASUT_FIELD_UNSUPPORTED: "Bu faturadaki bazı vergiler Paraşüt'e henüz aktarılamıyor; fatura Paraşüt'e gönderilmedi.",
  FX_RATE_REQUIRED: "Dövizli fatura için kur gerekli; belge tarihinin TCMB kuru alınamadı. Biraz sonra yeniden deneyin.",
  IDEMPOTENCY_CONFLICT: "Bu işlem daha önce farklı bilgilerle gönderilmiş. Formu yenileyip tekrar deneyin.",
  LINE_EXEMPTION_INVALID: "%0 KDV'li satırda istisna kodu gerekli.",
};
export function documentErrorText(err: any): string {
  const raw = typeof err?.message === "string" ? err.message.trim() : "";
  const msg = /^Sunucu hatası \(\d+\)$/.test(raw) ? "" : raw;
  const base = msg || CODE_TEXT[err?.code] || "Kaydedilemedi. Lütfen tekrar deneyin.";
  const n = Number(err?.line);
  return Number.isInteger(n) && n > 0 && !new RegExp(`^${n}\\. satır`).test(base) ? `${n}. satır: ${base}` : base;
}

const applyWithholdingAll = (lines: DocLine[], all: Withholding) =>
  !all ? lines : lines.map((l) => (l.withholding || !(Number(l.vat_rate) > 0) ? l : { ...l, withholding: { rate: all.rate, code: all.code } }));

export function parasutBlockedFields(f: DocForm): string[] {
  const hit: string[] = [];
  const nonZero = (v: unknown) => {
    const x = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) && x > 0;
  };
  if (applyWithholdingAll(f.lines, f.withholding_all).some((l) => l.withholding)) hit.push("KDV tevkifatı");
  const tax = (code: string) => f.lines.some((l) => (l.other_taxes || []).some((t) => t.code === code && nonZero(t.value)));
  if (tax("0071")) hit.push("ÖTV");
  if (tax("4080")) hit.push("ÖİV");
  if (tax("0059") || f.accommodation_rate === "1") hit.push("konaklama vergisi");
  if (f.stopaj_rate) hit.push("stopaj");
  return hit;
}

function lineFromItem(x: any): DocLine {
  const pid = x?.product_id || null;
  const pct = Number(x?.discount_percent || 0);
  let discount: Discount = null;
  if (x?.discount && typeof x.discount === "object" && String(x.discount.value ?? "") !== "") discount = { type: x.discount.type, value: toTr(x.discount.value) };
  else if (pct > 0) discount = { type: "percentage", value: toTr(pct) };
  const text = [x?.product_name || x?.name, x?.description].filter(Boolean).join(" — ");
  return {
    ...blankLine(x?.line_key || undefined),
    kind: pid ? (x.kind === "service" ? "service" : "product") : "text",
    product_id: pid,
    product_name: pid ? String(x.product_name || x.name || "") : "",
    description: pid ? String(x.description || "") : text,
    quantity: toTr(x?.quantity ?? 1),
    unit: x?.unit || "ADET",
    price: toTr(x?.unit_price),
    vat_rate: x?.vat_rate == null ? 20 : Number(x.vat_rate),
    vat_exemption_code: x?.vat_exemption_code ? String(x.vat_exemption_code) : "",
    tracks_stock: pid ? null : false,
    discount,
    withholding: x?.withholding && typeof x.withholding === "object" ? { rate: Number(x.withholding.rate), code: String(x.withholding.code || "") } : null,
    other_taxes: Array.isArray(x?.other_taxes) ? x.other_taxes.map((t: any) => ({ code: String(t.code), type: t.type, value: toTr(t.value) })) : [],
    warehouse_id: x?.warehouse_id || null,
  };
}

export function fromInvoice(inv: any, today: string): DocForm {
  const b = blankForm(today);
  const dd: Discount =
    inv?.invoice_discount_type && inv.invoice_discount_value != null && Number(inv.invoice_discount_value) > 0 ? { type: inv.invoice_discount_type, value: toTr(inv.invoice_discount_value) } : null;
  return {
    ...b,
    customer_id: inv?.customer_id || null, customer_name: inv?.customer_name || "", customer_tax_no: inv?.customer_tax_no || "", customer_tax_office: inv?.customer_tax_office || "",
    customer_address: inv?.customer_address || "", document_name: inv?.document_name || "", issue_date: String(inv?.issue_date || today).slice(0, 10),
    due_date: String(inv?.due_date || "").slice(0, 10), stock_mode: inv?.stock_mode === "none" || inv?.stock_mode === "with_document" ? inv.stock_mode : null,
    lines: (Array.isArray(inv?.items) ? inv.items : []).map(lineFromItem), doc_discount: dd,
    stopaj_rate: inv?.stopaj_rate ? String(inv.stopaj_rate) : "", accommodation_rate: inv?.accommodation_tax_rate == null ? "" : String(inv.accommodation_tax_rate),
    withholding_all: null, notes: inv?.notes || "",
    include_iban: Boolean(inv?.note_options?.include_iban), iban: String(inv?.note_options?.iban || ""), include_balance: Boolean(inv?.note_options?.include_customer_balance),
    valid_until: String(inv?.valid_until || "").slice(0, 10),
  };
}

// Önizleme `totals` → ekran satırları (web DocumentTotalsPanel sırası). Tutarlar sunucunun 2 haneli dizeleri; eksi işaretli olanlar düşülür.
export type TotalRow = { key: string; label: string; amount: string; strong?: boolean };
const zero = (v: unknown) => v == null || Number(v) === 0;
const neg = (v: unknown) => `-${String(v)}`;
export function totalsRows(t: Record<string, any> | null | undefined, f: { stopaj_rate?: string; accommodation_rate?: string }): TotalRow[] {
  if (!t) return [];
  const rows: TotalRow[] = [];
  if (!zero(t.line_discount) || !zero(t.doc_discount)) rows.push({ key: "gross", label: "Brüt tutar", amount: String(t.gross) });
  if (!zero(t.line_discount)) rows.push({ key: "line_discount", label: "Satır indirimleri", amount: neg(t.line_discount) });
  if (!zero(t.doc_discount)) rows.push({ key: "doc_discount", label: "Ara toplam indirimi", amount: neg(t.doc_discount) });
  rows.push({ key: "subtotal", label: "Ara toplam", amount: String(t.subtotal) });
  if (t.accommodation_tax !== undefined && f.accommodation_rate !== "" && f.accommodation_rate != null)
    rows.push({ key: "accommodation", label: `%${f.accommodation_rate} Konaklama vergisi`, amount: String(t.accommodation_tax) });
  if (!zero(t.other_taxes)) rows.push({ key: "other_taxes", label: "ÖTV / ÖİV / satır vergileri", amount: String(t.other_taxes) });
  rows.push({ key: "vat", label: "Toplam KDV", amount: String(t.vat) });
  if (!zero(t.withholding)) rows.push({ key: "withholding", label: "KDV tevkifatı", amount: neg(t.withholding) });
  if (t.stopaj !== undefined && f.stopaj_rate) rows.push({ key: "stopaj", label: `%${f.stopaj_rate} Stopaj`, amount: neg(t.stopaj) });
  rows.push({ key: "total", label: "Genel toplam", amount: String(t.total), strong: true });
  if (t.payable !== undefined && t.payable !== t.total) rows.push({ key: "payable", label: "Tahsil edilecek", amount: String(t.payable), strong: true });
  return rows;
}

// Dalga 5a (P5.4): POST /price-lists/resolve {customer_id, product_ids, date, currency} → müşterinin listesindeki ürün fiyatı
// (net birim fiyat; form price_basis "net"). Liste yoksa / süresi dolmuşsa / ürün listede değilse null (ürün kartı fiyatı kalır).
export function listPrice(resp: any, productId: string): { price: string; listName: string } | null {
  const p = resp?.prices?.[productId];
  if (!resp?.price_list || !p || p.unit_price == null) return null;
  const n = Number(p.unit_price);
  if (!Number.isFinite(n)) return null;
  return { price: n.toFixed(2).replace(".", ","), listName: String(resp.price_list.name || "Fiyat listesi") };
}
