// Dalga 3 / C1 — gelen e-fatura "İçeri Al" (quick import). Web: components/QuickImportWorkspace.jsx,
// components/quickImport/{model.js, useQuickImportPreview.js, useImportStatus.js}, pages/IncomingEInvoicesPage.js.
// Sunucu: backend/routers/quick_import.py. Her seçim yeni önizleme ister; kayıt yalnız son BAŞARILI önizlemenin özetleriyle yapılır.
import { request } from "./api";

export type QuickImportProvider = "parasut" | "turkcell-efatura";

// GET /incoming-invoices/quick-import/capability?provider= → {enabled, preview, confirm, wizard, workspace, ...}; kapalıysa 404.
export type QuickImportCapability = { enabled: boolean; confirm: boolean };

export async function getQuickImportCapability(token: string, provider: string): Promise<QuickImportCapability | null> {
  if (provider !== "parasut" && provider !== "turkcell-efatura") return null;
  try {
    const d = await request<any>(`/incoming-invoices/quick-import/capability?provider=${encodeURIComponent(provider)}`, { method: "GET" }, token);
    if (d?.enabled !== true || d?.preview !== true) return null;
    return { enabled: true, confirm: d?.confirm === true };
  } catch {
    return null;
  }
}

// Satırın durumu yalnız gösterilir (İçeri Al yok): işleniyor / incelemede / alındı / geri alındı (yeniden alınamazsa).
export function isStatusOnly(importStatus?: string, reimportable?: boolean) {
  const s = String(importStatus || "none");
  if (s === "reversed") return reimportable !== true;
  return ["in_progress", "needs_review", "applied"].includes(s);
}

export type LineChoice = { kind: "product" | "service" | null; product_id: string | null; new_product_draft: boolean; stock: boolean | null; vat_exemption_code: null };
export const EMPTY_CHOICE: LineChoice = { kind: null, product_id: null, new_product_draft: false, stock: null, vat_exemption_code: null };
// İçeri Al 2 (D-14b): Ödenecek · Ödendi (hesap + ödeme tarihi) · Çalışan cebinden (kapalı).
export type ImportForm = {
  payment_state: "payable" | "paid" | "employee";
  payment_account_id: string | null;
  payment_date: string | null;
  due_date: string | null;
  expense_category_id: string | null;
};
export const EMPTY_FORM: ImportForm = { payment_state: "payable", payment_account_id: null, payment_date: null, due_date: null, expense_category_id: null };
export const paymentComplete = (f: Partial<ImportForm> | null | undefined) =>
  f?.payment_state === "paid" && Boolean(f.payment_account_id) && /^\d{4}-\d{2}-\d{2}$/.test(String(f.payment_date || ""));
export const paymentMissing = (f: Partial<ImportForm> | null | undefined) => f?.payment_state === "paid" && !paymentComplete(f);
export type ImportArgs = {
  mode: "expense_only" | "expense_and_stock";
  lineChoices: LineChoice[];
  createSupplier: boolean;
  supplierId: string | null;
  warehouseId: string | null;
  form: ImportForm;
  // POSSIBLE_LEGACY_DUPLICATE uyarısının açık kabulü ("Bu farklı bir fatura"); seçim özetinin parçası, yalnız true iken gönderilir.
  legacyAck: boolean;
  // Kıyas 2: "Hayır" = hızlı gider (kalemsiz; tutarlar belge toplamından), yalnız gider modunda gönderilir.
  quickExpense?: boolean;
};
export const INITIAL_ARGS: ImportArgs = { mode: "expense_only", lineChoices: [], createSupplier: false, supplierId: null, warehouseId: null, form: EMPTY_FORM, legacyAck: false, quickExpense: false };

// web model.js payload()
export function importPayload(a: ImportArgs, withForm: boolean) {
  const body: Record<string, unknown> = {
    mode: a.mode,
    warehouse_id: a.mode === "expense_and_stock" ? a.warehouseId : null,
    supplier_id: a.supplierId,
    create_supplier: a.supplierId ? false : a.createSupplier,
    line_choices: a.lineChoices,
  };
  if (a.legacyAck === true) body.legacy_duplicate_ack = true;
  if (a.quickExpense === true && a.mode === "expense_only") body.quick_expense = true;
  if (withForm) {
    // Ödendi: hesap + tarih tamamsa gönderilir; eksikken önizleme Ödenecek gibi istenir (ödeme alanları özete girmez), kayıt kapalı kalır.
    if (paymentComplete(a.form)) {
      body.payment_state = "paid";
      body.payment_account_id = a.form.payment_account_id;
      body.payment_date = a.form.payment_date;
    } else body.payment_state = a.form.payment_state === "paid" ? "payable" : a.form.payment_state || "payable";
    body.due_date = a.form.due_date || null;
    body.expense_category_id = a.form.expense_category_id || null;
  }
  return body;
}

export async function previewQuickImport(token: string, id: string, a: ImportArgs, withForm: boolean) {
  return request<any>(`/incoming-invoices/${encodeURIComponent(id)}/quick-import/preview`, { method: "POST", body: JSON.stringify(importPayload(a, withForm)) }, token);
}

export async function confirmQuickImport(token: string, id: string, d: any, a: ImportArgs, withForm: boolean) {
  const body = {
    preview_fingerprint: d.preview_fingerprint,
    choices_digest: d.choices_digest,
    decision_digest: d.decision_digest,
    ...importPayload(a, withForm),
    ...(d.reimport?.allowed === true && Number.isInteger(d.reimport.generation) ? { reimport_generation: d.reimport.generation } : {}),
  };
  return request<any>(`/incoming-invoices/${encodeURIComponent(id)}/quick-import/confirm`, { method: "POST", body: JSON.stringify(body) }, token);
}

export async function getQuickImportStatus(token: string, id: string) {
  return request<any>(`/incoming-invoices/${encodeURIComponent(id)}/quick-import/status`, { method: "GET" }, token);
}

// {items:[{id, name, system}]}: sistem kategorisi boş seçenektir (null gönderilir), etiketi "Gelen fatura gideri".
export async function getQuickImportCategories(token: string): Promise<{ id: string | null; name: string }[]> {
  const d = await request<any>("/incoming-invoices/quick-import/expense-categories", { method: "GET" }, token);
  const items: any[] = Array.isArray(d?.items) ? d.items : [];
  const sys = items.find((c) => c?.system === true);
  return [{ id: null, name: String(sys?.name || "Gelen fatura gideri") }, ...items.filter((c) => c?.id && c.system !== true).map((c) => ({ id: String(c.id), name: String(c.name || "Kategori") }))];
}

// ---- Sorunlar: sunucu kodları arayüze çıkmaz; her kod bir sınıfa düşer (web model.js classifyIssue). ----
const INVENTORY_OWNED_TEXT = "Stok sahibi muhasebe programınız; mal girişini orada yapın.";
const FIX: Record<string, [number, string]> = {
  LINE_CLASS_UNRESOLVED: [1, "Ürün mü hizmet mi olduğunu seçin."],
  LINE_CLASS_REQUIRED: [1, "Ürün mü hizmet mi olduğunu seçin."],
  PRODUCT_KIND_REQUIRED: [1, "Ürün mü hizmet mi olduğunu seçin."],
  PRODUCT_NOT_MATCHED: [1, "Bu satır için ürünü seçin ya da hizmet olarak işaretleyin."],
  STOCK_PRODUCT_UNRESOLVED: [1, "Stoğa girmesi için listeden ürünü seçin."],
  PRODUCT_MATCH_AMBIGUOUS: [1, "Birden fazla ürün uyuyor; doğru ürünü seçin."],
  PRODUCT_DRAFT_CANNOT_BE_STOCKED: [1, "Hatırlanacak yeni ürün stoğa alınamaz; mevcut ürünü seçin ya da stok girişini kapatın."],
  CATALOG_DUPLICATE: [1, "Bu ürün katalogda zaten var; listeden mevcut ürünü seçin."],
  PRODUCT_DRAFT_DUPLICATE: [1, "Bu ürün katalogda zaten var; listeden mevcut ürünü seçin."],
  PRODUCT_CHOICE_INVALID: [1, "Seçtiğiniz ürün artık geçerli değil; yeniden seçin."],
  REFERENCE_INVALID: [1, "Seçtiğiniz kayıt artık geçerli değil; yeniden seçin."],
  SUPPLIER_NOT_MATCHED: [0, "Tedarikçiyi seçin."],
  SUPPLIER_MATCH_AMBIGUOUS: [0, "Birden fazla tedarikçi uyuyor; doğru tedarikçiyi seçin."],
  SUPPLIER_CHOICE_INVALID: [0, "Seçilen tedarikçi bu faturaya uymuyor; yeniden seçin."],
  WAREHOUSE_REQUIRED: [1, "Stoğa girecek ürün satırları için depo seçin."],
  WAREHOUSE_INVALID: [1, "Seçilen depo kullanılamıyor; başka bir depo seçin."],
  STOCK_NOT_APPLICABLE: [1, "Stoğa girecek ürün satırı yok; stok girişini kapatın."],
  SOURCE_CHANGED: [0, "Fatura sağlayıcıda güncellendi; ekranı kapatıp yeniden açın."],
  PREVIEW_EXPIRED: [0, "Önizlemenin süresi doldu; ekranı kapatıp yeniden açın."],
  DUE_DATE_INVALID: [0, "Vade tarihi fatura tarihinden önce olamaz."],
  STOCK_REQUIRES_EXACT_LINES: [1, "Bu faturanın satır tutarları fatura toplamlarından farklı; yalnız gider olarak içeri alınabilir. Stok girişini kapatın."],
  INVENTORY_OWNED_BY_ACCOUNTING: [1, `${INVENTORY_OWNED_TEXT} Faturayı gider olarak işleyin.`],
  STOCK_QUANTITY_FRACTIONAL: [1, "Stoğa girecek bir satırın miktarı tam sayı değil; stok girişini kapatıp faturayı gider olarak işleyin."],
  STOCK_ALREADY_RECEIVED: [1, "Bu fatura daha önce “Stoğa işle” ile stoğa girdi; stok girişini kapatıp faturayı gider olarak işleyin."],
};
const DOCUMENT: Record<string, string> = {
  TOTAL_MISMATCH: "Fatura toplamı satırlardan hesaplanan tutarla uyuşmuyor.",
  PROVIDER_TOTAL_MISSING: "Faturada ödenecek toplam yok.",
  TOTALS_INVALID: "Fatura tutarları hesaplanamadı.",
  LINE_TOTAL_MISMATCH: "Satır tutarı miktar × fiyat − iskonto ile uyuşmuyor.",
  LINE_VAT_MISMATCH: "Satırın KDV tutarı faturadakiyle uyuşmuyor.",
  WITHHOLDING_UNSUPPORTED: "Faturadaki KDV tevkifatı bu akışta desteklenmiyor; bu fatura içeri alınamaz.",
  LINE_FIELD_MISSING: "Satırda miktar, fiyat, KDV veya açıklama eksik.",
  LINE_DISCOUNT_UNREADABLE: "Satırdaki iskonto okunamadı.",
  EXEMPTION_REQUIRED: "KDV istisna kodu gerekiyor; bu ekranda girilemez.",
  EXEMPTION_CODE_REQUIRED: "KDV istisna kodu gerekiyor; bu ekranda girilemez.",
  DOCUMENT_NUMBER_REQUIRED: "Faturada numara yok.",
  DOCUMENT_NUMBER_MISSING: "Faturada numara yok.",
  CURRENCY_NOT_SUPPORTED: "Faturanın para birimi bu akışta desteklenmiyor.",
  DOCUMENT_INVALID: "Fatura bu akışla okunamadı.",
  LINE_DESCRIPTION_UNREADABLE: "Satır açıklaması boş, çok uzun ya da okunamayan karakter içeriyor.",
  ISSUE_DATE_MISSING: "Faturada düzenleme tarihi yok ya da okunamadı.",
  LINES_MISSING: "Faturada kalem yok.",
  TOO_MANY_LINES: "Faturadaki kalem sayısı bu akışın sınırını aşıyor.",
  LINE_VALUE_UNSUPPORTED: "Satırda desteklenmeyen bir miktar, birim fiyat ya da iskonto var.",
  VAT_RATE_UNSUPPORTED: "Faturadaki KDV oranı tanımlı oranlardan biri değil ya da fatura tarihinde geçerli değil.",
  INVOICE_TYPE_UNSUPPORTED: "Bu fatura türü (iade, istisna, özel matrah, ihraç kayıtlı gibi) içeri alınamıyor.",
  TOTALS_INCONSISTENT: "Faturanın toplamları kendi içinde tutarsız.",
  PAYABLE_DIFFERS_FROM_TOTAL: "Faturanın ödenecek tutarı vergiler dahil toplamından farklı (mahsup ya da ön ödeme olabilir).",
  VAT_INCONSISTENT: "Faturadaki KDV tutarı matrah ve oranla uyuşmuyor.",
  VAT_EXEMPT_UNSUPPORTED: "Faturada KDV'siz (istisna) kalem var; bu faturalar henüz içeri alınamıyor.",
  TAX_TYPE_UNSUPPORTED: "Bu faturada desteklenmeyen vergi türü var.",
  AMOUNT_ZERO: "Faturanın gider tutarı sıfır; gider kaydı oluşturulamaz.",
  LINE_AMOUNT_UNREADABLE: "Satırda miktar, birim fiyat, tutar ya da iskonto okunamadı.",
  LINE_AMOUNT_BEYOND_TOLERANCE: "Satır tutarı miktar × fiyat − iskonto ile 1 kuruştan fazla farklı.",
  LINE_VAT_BEYOND_TOLERANCE: "Satırdaki KDV tutarı satırın matrahı ve oranıyla 1 kuruştan fazla farklı.",
  LINE_DIFFERENCE_CAP: "Satırlardaki yuvarlama farklarının toplamı 0,50 TL sınırını aşıyor.",
  SUPPLIER_DATA_INVALID: "Faturadaki tedarikçi bilgileri eksik veya geçersiz.",
};
const IMPORT_STATE: Record<string, string> = {
  DUPLICATE_DOCUMENT: "Bu fatura için daha önce oluşturulmuş bir kayıt var; ikinci kez içeri alınamaz.",
  OPEN_IMPORT_EXISTS: "Bu fatura için daha önce açılmış bir içeri alma kaydı var; durumu netleşmeden yeniden alınamaz.",
  LEGACY_DEBT_EXISTS: "Bu fatura için ObiHub'da daha önce açılmış bir borç kaydı var. İkinci kez borç oluşturulmaz; mevcut gider faturası kaydını kullanın.",
  // 14 Kas 2026 sözleşmesi: ödenmiş eski Paraşüt aktarımı satırı (web reasonTexts.js LEGACY_RECORD).
  LEGACY_RECORD_EXISTS: "Bu fatura daha önce eski aktarımla ObiHub'a kaydedilmiş ve ödenmiş. İkinci kez borç ve gider oluşturulmaz; mevcut gider faturası kaydını kullanın.",
  // Muhasebe kapısı (web reasonTexts.js ACCOUNTING_GATE): sistem hazırlığı değil, firmanın durumu.
  ACCOUNTING_NOT_ACTIVE: "Muhasebe ayarlarınız bu firmada henüz etkin değil; fatura önizlenebilir ama içeri alınamaz. Destek ekibimizle iletişime geçin.",
  EXPENSE_MODULE_DISABLED: "ObiHub ön muhasebesi bu firmada kapalı; fatura gider ve borç olarak içeri alınamaz. Ayarlar'dan açabilirsiniz.",
  DUPLICATE_MANUAL_DOCUMENT: "Bu fatura elle girilmiş; önce o kaydı ters kaydedin ya da bu faturayı atlayın.",
  PRIOR_IMPORT_FAILED: "Bu fatura için önceki içeri alma denemesi tamamlanamadı; inceleme bitene kadar yeniden alınamaz.",
};
const NOTICE: Record<string, string> = {
  LINE_VAT_DIFFERS_FROM_UBL: "Satır KDV'si faturadaki tutardan farklı hesaplandı.",
  LINE_NET_DIFFERS_FROM_UBL: "Satır tutarı faturadaki tutardan farklı hesaplandı.",
};
const SYSTEM_HINT: Record<string, string> = {
  CANDIDATE_INDEX_NOT_READY: "Ürün ve tedarikçi eşleştirmesi şu an kullanılamıyor.",
  CANDIDATES_INCOMPLETE: "Ürün ve tedarikçi eşleştirmesi şu an kullanılamıyor.",
  WAREHOUSE_INDEX_NOT_READY: "Depo listesi şu an kullanılamıyor.",
};

export type Issue = { kind: "fix" | "document" | "state" | "notice" | "warning" | "ack" | "system"; text: string; line: number | null; step?: number };

// Olası mükerrer (POSSIBLE_LEGACY_DUPLICATE, review_items): onayı engeller, açık kabulle kalkar (web reasonTexts.js LEGACY_DUPLICATE).
export const LEGACY_DUPLICATE = {
  key: "POSSIBLE_LEGACY_DUPLICATE",
  text: "Aynı tedarikçiden aynı gün aynı tutarda eski aktarımla kaydedilmiş, numarası farklı bir fatura var. Farklı bir faturaysa onaylayıp devam edin.",
  ackLabel: "Bu farklı bir fatura; içeri almaya devam et",
};
export const hasLegacyDuplicate = (items: unknown) =>
  Array.isArray(items) && items.some((i: any) => String(i?.key || "") === LEGACY_DUPLICATE.key);
// Elle alış: kabul, verildiği andaki belge alanlarıyla geçerlidir; alanlar değişince düşer.
export const legacyAckValid = (ack: boolean, ackKey: string, currentKey: string) => ack === true && ackKey === currentKey;

// Onay (confirm) 409 ret kodları: sunucu Türkçe açıklama göndermediyse ya da açıklama genelse (web reasonTexts.js CONFIRM_REASON_TEXT).
const CONFIRM_REASON_TEXT: Record<string, string> = {
  EXPENSE_MODULE_DISABLED: "ObiHub ön muhasebesi bu firmada kapalı; fatura içeri alınmadı. Ayarlar'dan açabilirsiniz.",
  APPLY_OWNERSHIP_UNKNOWN: "Muhasebe ayarlarınız bu işlem için henüz hazır değil. Destek ekibimizle iletişime geçin.",
  ACCOUNTING_NOT_ACTIVE: "Muhasebe ayarlarınız bu firmada henüz etkin değil; fatura içeri alınmadı. Destek ekibimizle iletişime geçin.",
};

function classifyIssue(key: string, detail: unknown): Omit<Issue, "line"> {
  if (key === "TAX_TYPE_UNSUPPORTED" && /^[0-9]{4}$/.test(String(detail || ""))) return { kind: "document", text: `Bu faturada desteklenmeyen vergi türü var: vergi kodu ${detail}.` };
  if (key === "POSSIBLE_MANUAL_DUPLICATE") {
    const d = typeof detail === "string" ? detail.trim() : "";
    return { kind: "warning", text: /[ığüşöçİĞÜŞÖÇ]|[.!?]$/.test(d) && d.length < 240 ? d : "Aynı numaralı elle girilmiş bir fatura olabilir; kontrol edin." };
  }
  if (key === LEGACY_DUPLICATE.key) return { kind: "ack", text: LEGACY_DUPLICATE.text };
  if (FIX[key]) return { kind: "fix", step: FIX[key][0], text: FIX[key][1] };
  if (IMPORT_STATE[key]) return { kind: "state", text: IMPORT_STATE[key] };
  if (DOCUMENT[key]) return { kind: "document", text: DOCUMENT[key] };
  if (NOTICE[key]) return { kind: "notice", text: NOTICE[key] };
  return { kind: "system", text: SYSTEM_HINT[key] || "İçeri alma altyapısı bu fatura için henüz hazır değil." };
}

export function collectIssues(decision: any, view: any): Issue[] {
  const raw: { key: string; line: number | null; detail: unknown; info?: boolean }[] = [...(decision?.blocker_items || []), ...(decision?.review_items || [])].map((i: any) => ({
    key: String(i?.key || ""),
    line: Number.isInteger(i?.line_index) ? i.line_index : null,
    detail: i?.detail ?? null,
  }));
  for (const key of view?.document?.document_issues || []) raw.push({ key, line: null, detail: null });
  for (const key of view?.supplier?.issues || []) raw.push({ key, line: null, detail: null });
  // Faz A M7 (web model.js): tutarlar belge toplamından geldiyse satır tutar notları yalnız bilgi; hızlı giderde tüm satır notları bilgi.
  const documentTotals = view?.document?.totals_basis === "document";
  const quickTotals = view?.document?.quick_expense === true && documentTotals;
  const amountNotes = new Set(["LINE_NET_DIFFERS_FROM_UBL", "LINE_VAT_DIFFERS_FROM_UBL", "LINE_DISCOUNT_UNREADABLE", "LINE_DISCOUNT_DECLARATION_DIFFERS"]);
  for (const l of view?.lines || []) for (const key of l.issues || []) raw.push({ key, line: l.index, detail: null, info: quickTotals || (documentTotals && amountNotes.has(key)) });
  const supplierActionable = (view?.supplier?.candidates || []).length > 0 || view?.decisions?.supplier?.create_new?.available === true;
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const { key, line, detail, info } of raw) {
    let c = classifyIssue(key, detail);
    if (info && c.kind !== "notice") c = { kind: "notice", text: c.text } as Issue;
    if (c.kind === "fix" && c.step === 0 && /^SUPPLIER_/.test(key) && !supplierActionable) c = { kind: "system", text: "Tedarikçi bu hesapta eşleştirilemedi." };
    const id = `${c.kind}|${line}|${c.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...c, line });
  }
  return out;
}

// ---- Kayıt sonucu (web model.js confirmOutcome / confirmErrorOutcome / statusOutcome / RESULT_TEXT) ----
export type ImportPayment = { status: "recorded" | "pending" | "failed"; code: string | null; detail: string | null; accountName: string | null };
export type ImportOutcome = {
  status: "APPLIED" | "IN_PROGRESS" | "NEEDS_REVIEW" | "REJECTED" | "REVERSED" | "UNKNOWN" | "NONE";
  detail: string | null;
  alreadyImported: boolean;
  reimportable?: boolean;
  payment?: ImportPayment | null;
};
const GENERIC = /status code|network|request failed|bir hata oluştu/i;
const turkish = (t: unknown) => typeof t === "string" && t.trim().length > 3 && !/^[A-Z0-9_]+$/.test(t.trim()) && !GENERIC.test(t);

export function confirmOutcome(res: any): ImportOutcome {
  const status = String(res?.status || "").toUpperCase();
  if (!["APPLIED", "IN_PROGRESS", "NEEDS_REVIEW", "REJECTED"].includes(status)) return { status: "UNKNOWN", detail: null, alreadyImported: false };
  return {
    status: status as ImportOutcome["status"],
    detail: turkish(res?.detail) ? String(res.detail).trim() : null,
    alreadyImported: res?.already_imported === true,
    payment: cleanPayment(res?.payment),
  };
}

// İçeri Al 2: onay/durum yanıtındaki ödeme bölümü (yalnız Ödendi seçildiyse).
export function cleanPayment(p: any): ImportPayment | null {
  if (!p || typeof p !== "object" || !["recorded", "pending", "failed"].includes(p.status)) return null;
  const pay = p.payment && typeof p.payment === "object" ? p.payment : {};
  return {
    status: p.status,
    code: typeof p.code === "string" ? p.code : null,
    detail: turkish(p.detail) ? String(p.detail).trim() : null,
    accountName: typeof pay.account_name === "string" ? pay.account_name : null,
  };
}
export function paymentResultText(p: ImportPayment | null | undefined): string | null {
  if (!p) return null;
  if (p.status === "recorded") return `Fatura kaydedildi ve ödendi${p.accountName ? ` (${p.accountName})` : ""}.`;
  if (p.status === "pending") return p.detail || "Ödeme, içeri alma tamamlanınca kaydedilecek.";
  return p.detail || 'Fatura kaydedildi ancak ödeme yazılamadı. Gider Faturaları\'ndan "Ödeme ekle" ile girebilirsiniz.';
}

// Ağ hatası / 5xx: istek sunucuya ulaşmış olabilir → "başarısız" denmez, durum sorulur.
export function confirmErrorOutcome(err: any): ImportOutcome {
  const status = Number(err?.status || 0);
  if (status === 409 || status === 422) {
    // Sunucunun Türkçe açıklaması önceliklidir (bilinmeyen kodda da); yoksa bilinen ret kodunun sabit metni; ham kod asla.
    let detail: string | null = turkish(err?.message) ? String(err.message).trim() : null;
    if (!detail) for (const c of [err?.reason, err?.code]) if (typeof c === "string" && CONFIRM_REASON_TEXT[c]) { detail = CONFIRM_REASON_TEXT[c]; break; }
    return { status: "REJECTED", detail, alreadyImported: false };
  }
  if (status === 429) return { status: "REJECTED", detail: "Çok sık deneme yapıldı; biraz bekleyip yeniden deneyin.", alreadyImported: false };
  if (status === 404) return { status: "REJECTED", detail: "İçeri alma bu hesapta şu an kullanılamıyor.", alreadyImported: false };
  return { status: "UNKNOWN", detail: null, alreadyImported: false };
}

const STATUS_MAP: Record<string, ImportOutcome["status"]> = { in_progress: "IN_PROGRESS", applied: "APPLIED", needs_review: "NEEDS_REVIEW", rejected: "REJECTED", reversed: "REVERSED", none: "NONE" };
export function statusOutcome(res: any): ImportOutcome | null {
  const key = typeof res?.status === "string" ? STATUS_MAP[res.status] : undefined;
  if (!key) return null;
  return {
    status: key,
    detail: turkish(res?.detail) ? String(res.detail).trim() : null,
    alreadyImported: false,
    reimportable: key === "REVERSED" && res?.reimportable === true,
    payment: cleanPayment(res?.payment),
  };
}

export const RESULT_TEXT: Record<string, [string, string]> = {
  APPLIED: ["Fatura kaydedildi", "Gider faturası ve bağlı kayıtlar oluşturuldu."],
  APPLIED_ALREADY: ["Bu fatura zaten içeri alınmış", "Aynı fatura ikinci kez kaydedilmedi; mevcut kayıt geçerli."],
  IN_PROGRESS: ["İşlem sürüyor", "Sonuç birkaç dakika içinde netleşir. Bu sırada faturayı yeniden içeri almayın."],
  IN_PROGRESS_LONG: ["İşlem hâlâ sürüyor", "Sonuç henüz netleşmedi. Biraz sonra durumu yenileyin; gerekirse destek ekibimiz işlemi tamamlar."],
  NEEDS_REVIEW: ["Fatura incelemeye alındı", "Kayıt tamamlanmadı. Destek ekibi inceliyor; inceleme bitene kadar fatura yeniden içeri alınamaz."],
  REJECTED: ["Fatura içeri alınamadı", "Kayıt oluşturulmadı. Önizlemeyi yenileyip yeniden deneyin."],
  REVERSED: ["Bu faturanın kaydı geri alındı", "Önceki kayıt karşı kayıtlarla geri alındı; silinmedi."],
  REVERSED_REIMPORTABLE: ["Bu faturanın kaydı geri alındı", "Faturayı doğru bilgilerle yeniden içeri alabilirsiniz."],
  REVERSED_FINAL: ["Bu faturanın kaydı geri alındı", "Aynı fatura yeniden içeri alınamaz; gerekiyorsa destek ekibimizle iletişime geçin."],
  UNKNOWN: ["Sonuç alınamadı", "İşlem sunucuda tamamlanmış olabilir. Yeniden kaydetmeden önce durumu yenileyin."],
};

export function resultTextKey(o: ImportOutcome, expired = false) {
  if (o.status === "APPLIED" && o.alreadyImported) return "APPLIED_ALREADY";
  if (o.status === "IN_PROGRESS" && expired) return "IN_PROGRESS_LONG";
  if (o.status === "REVERSED") return o.reimportable ? "REVERSED_REIMPORTABLE" : o.detail ? "REVERSED" : "REVERSED_FINAL";
  return RESULT_TEXT[o.status] ? o.status : "UNKNOWN";
}

// Önizleme reddi (409/422/503 + {code, detail}): yalnız kod ve Türkçe açıklama birlikteyse gösterilir.
export function rejectionOf(e: any): { code: string; detail: string } | null {
  if (![409, 422, 503].includes(Number(e?.status)) || typeof e?.code !== "string" || !e.code) return null;
  const d = typeof e?.message === "string" ? e.message.trim() : "";
  return d ? { code: e.code, detail: d } : null;
}

// ---- 15 Kas 2026: Paraşüt akışı (docs/pm/tasarim/iceri-al-parasut-akisi.md; web iceriAl/IceriAlAkis.jsx, SoruPencereleri.jsx) ----
// Tek soru "Ürün kalemleri hatırlansın mı?" → (Evet) depo → POST …/remember-products → dolu gider formu. KDV/tutar sorulmaz.
export const REMEMBER_TEXT = {
  question: "Ürün kalemleri hatırlansın mı?",
  yes: "Evet derseniz faturadaki ürünler ürün kartı olarak kaydedilir ve adetleri seçeceğiniz depoya girer; aynı ürün varsa üzerine eklenir.",
  no: "Hayır derseniz fatura yalnızca gider ve cari borç olarak işlenir; ürün kartı açılmaz, stok değişmez.",
  warehouse: "Faturadaki ürünlerin adetleri seçtiğiniz depoya girer.",
  noWarehouse: "Tanımlı depo yok; ürünler “Ana depo”ya girer.",
  ownerAccounting: "Stok sahibi muhasebe programınız; mal girişini orada yapın. Bu fatura gider olarak işlenir.",
  notRemembered: "Ürünler hatırlanmadı: stok takibi yapılmaz, fatura gider ve cari borç olarak işlenir.",
  fromInvoice: "Kalemler, KDV ve toplam faturanın kendisinden okunur; sizden tutar ya da KDV oranı istenmez.",
};
const REMEMBER_FALLBACK = "Ürünler şu an hatırlanamadı. Biraz sonra yeniden deneyin.";

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
// D-18k: VKN ile eşleşen kayıtlı cariler (sunucu adayları VKN ile aranmıştır; adayda başka VKN yazıyorsa sayılmaz).
export function supplierVkn(supplier: any): { id: string; label?: string }[] {
  const own = digitsOnly(supplier?.tax_number);
  return (supplier?.candidates || []).filter(
    (c: any) => c?.id && ((own && (!digitsOnly(c.tax_number) || digitsOnly(c.tax_number) === own)) || c.match === "tax_number")
  );
}
export const canCreateSupplier = (view: any) => view?.decisions?.supplier?.create_new?.available === true && supplierVkn(view?.supplier).length === 0;

// Cevap verildiğinde tek istekle uygulanan seçimler: Evet → tüm kalemler ürün + stok; Hayır → gider kalemi, stok yok.
export function answerArgs(a: ImportArgs, view: any, answer: "yes" | "no"): ImportArgs {
  const yes = answer === "yes";
  const lineChoices: LineChoice[] = (view?.lines || []).map(() => ({ ...EMPTY_CHOICE, kind: yes ? "product" : "service", stock: yes ? true : null }));
  const supplier = view?.supplier || {};
  const hits = supplierVkn(supplier);
  const unresolved = supplier.state !== "matched" && !a.supplierId;
  let sup: Partial<ImportArgs> = {};
  if (unresolved && hits.length === 1) sup = { supplierId: hits[0].id, createSupplier: false };
  else if (unresolved && hits.length === 0 && view?.decisions?.supplier?.create_new?.available === true) sup = { supplierId: null, createSupplier: true };
  return { ...a, ...sup, mode: yes ? "expense_and_stock" : "expense_only", lineChoices, warehouseId: yes ? a.warehouseId : null, quickExpense: !yes };
}

export type RememberedLine = { isNew: boolean; status: string; productId: string | null; suggestedId: string | null; suggestedName: string | null };

export async function rememberProducts(token: string, id: string): Promise<Record<number, RememberedLine>> {
  const res = await request<any>(`/incoming-invoices/${encodeURIComponent(id)}/quick-import/remember-products`, { method: "POST", body: "{}" }, token);
  const map: Record<number, RememberedLine> = {};
  for (const l of Array.isArray(res?.lines) ? res.lines : []) {
    if (!Number.isInteger(l?.index)) continue;
    map[l.index] = {
      isNew: l.is_new === true,
      status: String(l.status || ""),
      productId: l.product_id ? String(l.product_id) : null,
      suggestedId: l.suggested_product_id ? String(l.suggested_product_id) : null,
      suggestedName: l.suggested_product_name ? String(l.suggested_product_name) : null,
    };
  }
  return map;
}
export const newCardCount = (map: Record<number, RememberedLine>) => Object.values(map).filter((r) => r.isNew).length;

const isTurkishText = (t: unknown) => typeof t === "string" && Boolean(t.trim()) && !/^Sunucu hatası \(\d+\)$/.test(t.trim()) && /[ığüşöçİĞÜŞÖÇ]|[.!?]$/.test(t.trim());
export function rememberErrorAction(e: any): { expenseOnly: true } | { message: string } {
  if (Number(e?.status) === 409 && e?.code === "INVENTORY_OWNER_ACCOUNTING") return { expenseOnly: true };
  return { message: isTurkishText(e?.message) ? String(e.message).trim() : REMEMBER_FALLBACK };
}

// D-02: ≤ 0,01 TL fark kayda engel değil; sarı uyarı (kayıt faturadaki toplamla yapılır).
export function kurusNotice(doc: any): string | null {
  if (doc?.reconciliation_level !== "warning") return null;
  const diff = String(doc.lines_difference || doc.difference || "0.01").replace("-", "").replace(".", ",");
  return `Satırlardan hesaplanan tutar ile fatura toplamı arasında ${diff} TL yuvarlama farkı var. Kayıt faturadaki toplamla yapılır.`;
}

export function stockUnavailableText(action: any): string | null {
  if (action?.reason === "INVENTORY_OWNED_BY_ACCOUNTING") return REMEMBER_TEXT.ownerAccounting;
  if (action?.reason === "STOCK_ALREADY_RECEIVED") return "Bu fatura daha önce “Stoğa işle” ile stoğa girdi; stok tekrar girmez. Bu fatura gider olarak işlenir.";
  return null;
}

// Son çare kalem girişi mobilde yok (PM 15 Kas 2026): e-fatura XML'i alınamadığında web'e yönlendirilir.
export function rejectionText(r: { code: string; detail: string } | null): string | null {
  if (!r) return null;
  return r.code === "PREVIEW_PARASUT_MANUAL_LINE_REQUIRED" ? `${r.detail} Bu faturayı web'den (app.obihub.app) içeri alın.` : r.detail;
}

// ---- İçeri Al 2 (docs/pm/tasarim/iceri-al-2.md; web PaymentStatusField, KabulKapisi, GiderFormu) ----
export const EMPLOYEE_REASON = "Çalışan cebinden ödeme, çalışan kartları eklenince açılacak. Şimdilik Ödenecek ya da Ödendi seçin.";
export type PaymentStateOption = { id: "payable" | "paid" | "employee"; label: string; available: boolean; reason?: string };
const FALLBACK_STATES: PaymentStateOption[] = [
  { id: "payable", label: "Ödenecek", available: true },
  { id: "paid", label: "Ödendi", available: true },
  { id: "employee", label: "Çalışan cebinden", available: false, reason: EMPLOYEE_REASON },
];
export function paymentStates(decision: any): PaymentStateOption[] {
  const list = decision?.payment_options?.states;
  if (!Array.isArray(list) || !list.length) return FALLBACK_STATES;
  return list
    .filter((x: any) => ["payable", "paid", "employee"].includes(x?.id))
    .map((x: any) => ({ id: x.id, label: String(x.label || x.id), available: x.available === true, ...(typeof x.reason === "string" && x.reason ? { reason: x.reason } : {}) }));
}

// "1227.5" → "1.227,50" (kuruş, float'sız metin işlemi).
function trAmount(v: unknown): string | null {
  const m = /^-?(\d+)(?:\.(\d+))?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const int = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${int},${(m[2] || "").padEnd(2, "0").slice(0, 2)}`;
}
const isZeroAmount = (v: unknown) => v == null || v === "" || Number(v) === 0;
export function discountText(l: any): string | null {
  if (isZeroAmount(l?.discount)) return null;
  const amt = trAmount(String(l.discount).replace(/^-/, ""));
  if (!amt) return null;
  const rate = isZeroAmount(l?.discount_rate) ? null : trAmount(l.discount_rate);
  return `${rate ? `%${rate} · ` : ""}−${amt} ₺`;
}
export function vatIncludedNote(l: any): string | null {
  if (l?.price_includes_vat !== true) return null;
  const a = trAmount(l?.document_unit_price);
  return a ? `Faturada KDV dahil ${a} ₺` : null;
}

// Ticari fatura kabul kapısı (gelen kutusu `import_block` ya da önizleme/onay 409 kodu).
export function acceptGate(code: unknown): { kind: "accept" | "pending" | "rejected"; title: string; fallback: string } | null {
  if (code === "ACCEPT_REQUIRED")
    return { kind: "accept", title: "Önce faturayı kabul edin", fallback: "Bu ticari fatura onay bekliyor; kabul etmeden gider ve borç olarak içeri alınamaz. Kabul yanıtı GİB'e gönderilir ve geri alınamaz." };
  if (code === "ACCEPT_PENDING") return { kind: "pending", title: "Kabul işleniyor", fallback: "Kabul yanıtınız Paraşüt'e gönderildi, sonucu bekleniyor." };
  if (code === "DOCUMENT_REJECTED") return { kind: "rejected", title: "Fatura içeri alınamaz", fallback: "Bu fatura reddedildi ya da iade edildi; içeri alınamaz." };
  return null;
}

export function quickExpenseNotice(doc: any): string | null {
  return doc?.quick_expense === true && doc?.totals_basis === "document" ? "Tutarlar ve KDV fatura toplamlarından alındı; kalemler yalnız bilgi içindir." : null;
}
export const plannedNotice = (count: number) => (count > 0 ? `${count} yeni ürün kartı faturayı kaydettiğinizde açılır.` : null);

// Elle alış (D-14b): ödeme alanları önizleme gövdesine girer ve taslağa saklanır; yalnız Ödendi tamamsa (eksikken kayıt kapalı).
export function manualPaymentFields(f: Partial<ImportForm> | null | undefined): Record<string, string> {
  return paymentComplete(f) ? { payment_state: "paid", payment_account_id: String(f!.payment_account_id), payment_date: String(f!.payment_date) } : {};
}
