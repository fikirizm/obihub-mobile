// Finans alanının yazma uçları: virman, yeni kasa/banka hesabı, yeni cari, yeni satış faturası (taslak).
// İstek gövdeleri web panelindeki formlarla aynıdır (kaynak dosya ve satır her işlevin üstünde yazılıdır).
import { request } from "./api";
import type { CashAccount, LocalInvoice, Party } from "./types";

// Sunucu arama metnini düzenli ifade olarak kullanır; özel karakterler kaçırılır.
function escapeSearch(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Yazma isteğinin sonucu belirsiz mi? Bağlantı koptuğunda (status 0) ya da sunucu/ağ geçidi hatasında (5xx)
// istek sunucuda işlenmiş olabilir; uçlarda tekilleştirme anahtarı olmadığından aynı formu yeniden göndermek
// mükerrer kayıt üretir. Formlar bu durumda uyarı gösterir ve yeniden gönderim için ayrıca onay ister.
// Kalıcı çözüm (ayrı iş): sunucu uçlarına tekilleştirme (idempotency) anahtarı eklenmesi.
export function isUncertainWrite(e: unknown): boolean {
  const status = Number((e as { status?: number } | null)?.status);
  return status === 0 || status >= 500;
}

// ---------------------------------------------------------------------------
// Virman — POST /finance/transfers (backend/routers/finance.py:195)
// Web gövdesi: frontend/src/components/cash/KasaOS.jsx:93-101 ve pages/KasaPage.js:48-51
// ---------------------------------------------------------------------------
export type TransferBody = {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  entry_date: string; // YYYY-AA-GG
  description: string;
  reference: string;
};

export async function createTransfer(token: string, body: TransferBody) {
  return request<{ transfer_id?: string }>("/finance/transfers", { method: "POST", body: JSON.stringify(body) }, token);
}

// ---------------------------------------------------------------------------
// Yeni kasa/banka hesabı — POST /finance/accounts (backend/routers/finance.py:138)
// Web gövdesi: frontend/src/components/cash/KasaOS.jsx:34-40 ve pages/KasaPage.js:30-32
// ---------------------------------------------------------------------------
export const ACCOUNT_TYPE_OPTIONS = [
  { value: "cash", label: "Nakit kasa", hint: "Dükkân ya da ofis kasası" },
  { value: "bank", label: "Banka", hint: "Vadesiz hesap, IBAN" },
  { value: "pos", label: "POS", hint: "Sanal ya da fiziksel POS" },
  { value: "credit_card", label: "Kredi kartı", hint: "Şirket kartı" },
  { value: "marketplace", label: "Pazaryeri", hint: "Pazaryeri hakedişi" },
  { value: "other", label: "Diğer", hint: "Diğer tahsilat kanalı" },
] as const;

export type AccountType = (typeof ACCOUNT_TYPE_OPTIONS)[number]["value"];

export const ACCOUNT_CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;

// Web formunun gönderdiği varsayılan hesap rengi (arayüz rengi değil, kayıt alanı).
const WEB_DEFAULT_ACCOUNT_COLOR = "#1687a2";

export type AccountCreateInput = {
  name: string;
  account_type: AccountType;
  currency: string;
  opening_balance: number;
  bank_name?: string;
  iban?: string;
  provider?: string;
  card_last4?: string;
  settlement_days?: number;
};

export async function createCashAccount(token: string, input: AccountCreateInput) {
  const body = {
    name: input.name.trim(),
    account_type: input.account_type,
    currency: input.currency,
    opening_balance: Number(input.opening_balance || 0),
    bank_name: (input.bank_name || "").trim(),
    iban: (input.iban || "").trim(),
    provider: (input.provider || "").trim(),
    card_last4: (input.card_last4 || "").trim(),
    settlement_days: Number(input.settlement_days || 0),
    color: WEB_DEFAULT_ACCOUNT_COLOR,
  };
  return request<CashAccount>("/finance/accounts", { method: "POST", body: JSON.stringify(body) }, token);
}

// ---------------------------------------------------------------------------
// Yeni cari — POST /customers (backend/routers/customers.py:349)
// Web gövdesi: frontend/src/pages/CustomersPage.js:53-63 (EMPTY_FORM) ve :304
// ---------------------------------------------------------------------------
export type ContactRole = "customer" | "supplier" | "both";

export type PartyCreateInput = {
  contact_role: ContactRole;
  customer_type: "individual" | "company";
  name: string;
  tax_no?: string;
  tax_office?: string;
  email?: string;
  phone?: string;
  address?: string;
  district?: string;
  city?: string;
  iban?: string;
  // Artı: cari size borçlu (alacağınız var). Eksi: siz cariye borçlusunuz.
  opening_balance?: number;
  notes?: string;
};

export async function createParty(token: string, input: PartyCreateInput) {
  const t = (v?: string) => (v || "").trim();
  const body = {
    contact_role: input.contact_role,
    customer_type: input.customer_type,
    name: input.name.trim(),
    short_name: "",
    tax_no: t(input.tax_no),
    tax_office: t(input.tax_office),
    email: t(input.email),
    phone: t(input.phone),
    fax: "",
    address: t(input.address),
    postal_code: "",
    district: t(input.district),
    city: t(input.city),
    iban: t(input.iban),
    opening_balance: Number(input.opening_balance || 0),
    currency: "TRY",
    category: "",
    notes: t(input.notes),
    contact_person: { name: "", email: "", phone: "", notes: "" },
  };
  return request<Party>("/customers", { method: "POST", body: JSON.stringify(body) }, token);
}

// ---------------------------------------------------------------------------
// Fatura için cari arama — GET /customers?search=&per_page=8
// Web: frontend/src/pages/ObiHubInvoicesPage.js:140
// ---------------------------------------------------------------------------
export type InvoiceCustomer = {
  id: string;
  name: string;
  source?: string;
  tax_no?: string;
  tax_office?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export async function searchInvoiceCustomers(token: string, search: string) {
  const qs = new URLSearchParams({ search: escapeSearch(search), per_page: "8" });
  const d = await request<any>(`/customers?${qs.toString()}`, { method: "GET" }, token);
  const rows: any[] = Array.isArray(d?.customers) ? d.customers : Array.isArray(d?.items) ? d.items : [];
  return rows.map((c) => ({
    id: String(c.id),
    name: String(c.name || c.company_name || c.full_name || "Cari"),
    source: c.source,
    tax_no: c.tax_no || "",
    tax_office: c.tax_office || "",
    address: c.address || "",
    phone: c.phone || "",
    email: c.email || "",
  })) as InvoiceCustomer[];
}

// ---------------------------------------------------------------------------
// Yeni satış faturası (taslak) — POST /local-invoices (backend/routers/local_invoices.py:379)
// Web gövdesi: frontend/src/pages/ObiHubInvoicesPage.js:480-493 (buildPayload), kalem: :78-86 (newLine)
// Sunucu faturayı her zaman "taslak" durumunda açar ve tutarları kalemlerden kendisi hesaplar.
// ---------------------------------------------------------------------------
export type InvoiceLineInput = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number; // KDV hariç
  vat_rate: number;
};

export type InvoiceCreateInput = {
  customer_id: string | null;
  customer_name: string;
  customer_tax_no?: string;
  customer_tax_office?: string;
  customer_address?: string;
  issue_date: string;
  due_date: string;
  notes?: string;
  lines: InvoiceLineInput[];
};

// Kuruşa yarım-yukarı yuvarlama (sunucudaki ROUND_HALF_UP ile aynı sonuç; kayan nokta payı için küçük düzeltme).
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Önizleme toplamları sunucunun kuralıyla hesaplanır (backend/routers/local_invoices.py:_compute_invoice_amounts):
// satır tutarı = miktar × birim fiyat (kuruşa yuvarlanır), KDV = satır KDV'lerinin toplamı (kuruşa yuvarlanır).
export function invoiceTotals(lines: InvoiceLineInput[]) {
  const lineTotals = lines.map((l) => round2(Number(l.quantity || 0) * Number(l.unit_price || 0)));
  const subtotal = round2(lineTotals.reduce((s, v) => s + v, 0));
  const vat_amount = round2(lines.reduce((s, l, i) => s + (lineTotals[i] * Number(l.vat_rate || 0)) / 100, 0));
  return { lineTotals, subtotal, vat_amount, total: round2(subtotal + vat_amount) };
}

export async function createLocalInvoice(token: string, input: InvoiceCreateInput) {
  const totals = invoiceTotals(input.lines);
  const body = {
    customer_id: input.customer_id,
    customer_name: input.customer_name.trim(),
    customer_tax_no: input.customer_tax_no || "",
    customer_tax_office: input.customer_tax_office || "",
    customer_address: input.customer_address || "",
    issue_date: input.issue_date,
    due_date: input.due_date,
    currency: "TRY",
    notes: (input.notes || "").trim(),
    invoice_type: "satis",
    items: input.lines.map((l, i) => ({
      product_id: l.product_id,
      product_name: l.product_name.trim(),
      description: "",
      quantity: l.quantity,
      unit_price: l.unit_price,
      vat_rate: l.vat_rate,
      discount_percent: 0,
      line_total: totals.lineTotals[i],
    })),
    subtotal: totals.subtotal,
    vat_amount: totals.vat_amount,
    total: totals.total,
  };
  return request<LocalInvoice>("/local-invoices", { method: "POST", body: JSON.stringify(body) }, token);
}
