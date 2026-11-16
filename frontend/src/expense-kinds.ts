// Gider türleri (saf modül; birim testi dev/test-expense-kinds.mjs). Dalga 3 (P3.3): GET /accounting/expense-invoices/kinds (katalog,
// vergi türleri, harcayanlar). Banka gideri / vergi-SGK: kasa/bankadan çıkış, POST /kinds/{bank_fee|tax_payment} + Idempotency-Key (ödendiği
// hesap zorunlu). Hızlı fiş ve gider pusulası elle alış hattından (entry_mode quick / document_kind). Yanıttaki parasut_warning kayıt başarılı
// gösterilir, uyarı ayrıca ve metni olduğu gibi gösterilir. Web: QuickReceiptForm.jsx, ExpenseKindForms.jsx.

export const KIND_MENU = [
  { key: "quick_receipt", label: "Hızlı fiş/fatura", hint: "Tutarı ve KDV'si belli fiş ya da fatura; görsel ve harcayan eklenebilir." },
  { key: "purchase_invoice", label: "Alış faturası", hint: "Kalem kalem alış faturası; stok girişi." },
  { key: "bank_fee", label: "Banka gideri", hint: "Hesap işletim ücreti, EFT/havale masrafı, kredi faizi gibi kesintiler." },
  { key: "tax_payment", label: "Vergi/SGK ödemesi", hint: "KDV, muhtasar, SGK primi gibi vergi ve prim ödemeleri." },
  { key: "expense_voucher", label: "Gider pusulası", hint: "Vergi mükellefi olmayan kişiden alım; KDV'siz kalemler." },
] as const;

export const TAX_TYPES: [string, string][] = [
  ["kdv", "KDV"],
  ["muhtasar", "Muhtasar ve prim hizmet"],
  ["sgk", "SGK primi"],
  ["gecici", "Geçici vergi"],
  ["kurumlar", "Kurumlar vergisi"],
  ["gelir", "Gelir vergisi"],
  ["damga", "Damga vergisi"],
  ["mtv", "Motorlu taşıtlar vergisi"],
  ["other", "Diğer vergi/harç"],
];
export const QUICK_VAT = ["0", "1", "8", "10", "18", "20"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// "1.250,50" / "1250.5" → "1250.50" (pozitif, 2 hane); geçersiz null. Float hesabı yok.
export function amountText(v: unknown): string | null {
  let t = String(v ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(t);
  return m ? `${m[1].replace(/^0+(?=\d)/, "")}.${(m[2] || "").padEnd(2, "0")}` : null;
}
export function toKurus(v: unknown): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(v ?? ""));
  return m ? Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0")) : null;
}
export const totalDiffers = (serverPayable: unknown, entered: unknown) => {
  const a = toKurus(serverPayable);
  const b = toKurus(entered);
  return a !== null && b !== null && a !== b;
};
const isoDay = (v: string) => {
  const t = String(v || "").trim();
  if (DAY.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};

const nameKey = (v: unknown) => String(v || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
// Listeden seçilen tedarikçi adla değil kimlikle gider (adla gönderim mükerrer cari açar). Aynı adlı birden çok kayıtta tahmin yok.
export function matchSupplier(suppliers: { id: string; name: string }[], typed: string) {
  const key = nameKey(typed);
  if (!key) return { id: "", ambiguous: false };
  const hits = (suppliers || []).filter((s) => nameKey(s.name) === key);
  return hits.length === 1 ? { id: hits[0].id, ambiguous: false } : { id: "", ambiguous: hits.length > 1 };
}

export type QuickForm = {
  documentName: string;
  supplierName: string;
  supplierPartyId: string;
  documentNumber: string;
  issueDate: string;
  total: string;
  vatRate: string;
  dueDate: string;
  categoryId: string;
  spenderId: string;
  receiptId: string;
  paymentState: "payable" | "paid";
  paymentAccountId: string;
  paymentDate: string;
};

export function quickBody(f: QuickForm) {
  const problems: string[] = [];
  const total = amountText(f.total);
  if (!total || !(Number(total) > 0)) problems.push("total");
  if (!DAY.test(f.issueDate || "")) problems.push("issueDate");
  if (f.dueDate && (!DAY.test(f.dueDate) || f.dueDate < f.issueDate)) problems.push("dueDate");
  if (String(f.documentName || "").trim().length > 120) problems.push("documentName");
  if (problems.length) return { body: null as Record<string, unknown> | null, problems, paymentIncomplete: false };
  const supplier = String(f.supplierName || "").trim();
  const number = String(f.documentNumber || "").trim();
  const name = String(f.documentName || "").trim();
  const paid = f.paymentState === "paid";
  const paymentOk = paid && Boolean(f.paymentAccountId) && DAY.test(f.paymentDate || "");
  const body: Record<string, unknown> = {
    entry_mode: "quick",
    issue_date: f.issueDate,
    total,
    vat_rate: String(f.vatRate),
    currency: "TRY",
    ...(f.supplierPartyId ? { supplier: { party_id: f.supplierPartyId } } : supplier ? { supplier: { name: supplier } } : {}),
    ...(number ? { document_number: number } : {}),
    ...(name ? { document_name: name } : {}),
    ...(!paid && f.dueDate ? { due_date: f.dueDate } : {}),
    ...(paymentOk ? { payment_state: "paid", payment_account_id: f.paymentAccountId, payment_date: f.paymentDate } : {}),
    ...(f.categoryId ? { expense_category_id: f.categoryId } : {}),
    ...(f.spenderId ? { spender_user_id: f.spenderId } : {}),
    ...(f.receiptId ? { receipt_file_id: f.receiptId } : {}),
  };
  return { body, problems, paymentIncomplete: paid && !paymentOk };
}

export function cashKindBody(
  kind: "bank_fee" | "tax_payment",
  f: { amount: string; date: string; accountId: string; name?: string; categoryId?: string; taxType?: string; taxPeriod?: string }
): { body: Record<string, unknown> | null; error: string | null } {
  const amount = amountText(f.amount);
  if (!amount || !(Number(amount) > 0)) return { body: null, error: "Sıfırdan büyük bir tutar girin." };
  const day = isoDay(f.date);
  if (!day) return { body: null, error: "Tarihi girin (GG.AA.YYYY)." };
  if (!f.accountId) return { body: null, error: "Ödemenin yapıldığı kasa ya da banka hesabını seçin." };
  const body: Record<string, unknown> = { amount, entry_date: day, account_id: f.accountId, payment_state: "paid" };
  if (kind === "tax_payment") {
    if (!f.taxType) return { body: null, error: "Vergi türünü seçin." };
    if (!/^\d{4}-\d{2}$/.test(f.taxPeriod || "")) return { body: null, error: "Vergi dönemini (ay ve yıl) seçin." };
    body.tax_type = f.taxType;
    body.tax_period = f.taxPeriod;
  }
  const name = String(f.name || "").trim();
  if (name) body.document_name = name;
  if (f.categoryId) body.expense_category_id = f.categoryId;
  return { body, error: null };
}

// Vergi dönemi: içinde bulunulan aydan önceki 12 ay (beyanname genelde geçen ay için), yeni önce.
export function taxPeriods(today: string) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1));
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth();
    return { value: `${yy}-${String(mm + 1).padStart(2, "0")}`, label: `${MONTHS[mm]} ${yy}` };
  });
}

export function warningOf(resp: any): string | null {
  const w = resp?.parasut_warning ?? resp?.result?.parasut_warning ?? resp?.entry?.parasut_warning;
  return typeof w === "string" && w.trim() ? w.trim() : null;
}
