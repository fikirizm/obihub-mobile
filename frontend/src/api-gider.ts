// Gider, cari ve gelen kutusu okuma uçları — web paneliyle aynı uç seçimi ve geri düşüş.
// Kaynaklar: frontend/src/pages/ExpenseInvoicesPage.js, CustomersPage.js, IncomingEInvoicesPage.js, components/layout/Sidebar.js.
import { getParties, getPartyLedger, request } from "./api";
import type {
  ExpenseLedgerRow,
  ExpenseSummaryRow,
  IncomingInvoice,
  IncomingSource,
  PartyActions,
  PartyLedgerRow,
  PartyView,
  UiCapabilities,
} from "./types";

type Paged<T> = { items: T[]; total: number; hasMore: boolean };

function statusOf(e: unknown): number {
  return Number((e as { status?: number } | null)?.status);
}

// Sunucu tutarları Decimal dize ("1087.63") döndürür; null/boş/bozuk değer null kalır (0 uydurulmaz).
export function decimalOf(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Yetenekler — GET /ui-capabilities (backend/routers/ui_capabilities.py)
// Web: components/expenses/expenseText.js parseExpenseCaps; hata ya da bozuk yanıt KAPALI (fail-closed).
// ---------------------------------------------------------------------------
export const NO_CAPS: UiCapabilities = {
  inboxRead: false,
  expenseLedger: false,
  manualEntry: false,
  manualEntryReason: null,
  parasutView: false,
  parasutConnected: false,
  payablePayment: false,
  inventoryOwner: null,
};

export function parseUiCapabilities(raw: unknown): UiCapabilities {
  const r = raw as { capabilities?: unknown } | null;
  const c = r && typeof r === "object" && r.capabilities && typeof r.capabilities === "object" ? (r.capabilities as Record<string, unknown>) : {};
  const on = (k: string) => c[k] === true;
  return {
    inboxRead: on("inbox_read"),
    expenseLedger: on("expense_ledger"),
    manualEntry: on("expense_manual_entry"),
    manualEntryReason: typeof c.manual_entry_reason === "string" ? c.manual_entry_reason : null,
    parasutView: on("parasut_expense_view"),
    parasutConnected: on("parasut_connected"),
    payablePayment: on("payable_payment"),
    inventoryOwner: (() => {
      const io = c.inventory_owner as { owner?: unknown; program?: unknown } | null | undefined;
      if (!io || (io.owner !== "obihub" && io.owner !== "accounting")) return null;
      return { owner: io.owner, program: typeof io.program === "string" ? io.program : null };
    })(),
  };
}

export async function getUiCapabilities(token: string): Promise<UiCapabilities> {
  try {
    return parseUiCapabilities(await request<unknown>("/ui-capabilities", { method: "GET" }, token));
  } catch {
    return NO_CAPS;
  }
}

// ---------------------------------------------------------------------------
// Gider ayarı — GET /accounting/expense-settings (routers/expense_settings.py)
// Web Sidebar.js: expense_module_enabled === false ise Gider Faturaları gizli; ayar okunamazsa görünür (varsayılan açık).
// ---------------------------------------------------------------------------
export async function getExpenseModuleEnabled(token: string): Promise<boolean> {
  try {
    const d = await request<{ expense_module_enabled?: unknown }>("/accounting/expense-settings", { method: "GET" }, token);
    return d?.expense_module_enabled !== false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// ObiHub gider defteri — GET /accounting/expense-invoices, /summary (routers/expense_invoices.py)
// Sorgu: page, per_page, payment=open|overdue|paid, date_from, date_to. Bilinmeyen parametre 422 döner.
// ---------------------------------------------------------------------------
export type ExpensePaymentFilter = "" | "open" | "overdue" | "paid";

function expenseRowOf(x: any): ExpenseLedgerRow {
  return {
    id: String(x?.id ?? ""),
    supplier_name: x?.supplier_name ?? null,
    document_number: x?.document_number ?? null,
    issue_date: x?.issue_date ?? null,
    due_date: x?.due_date ?? null,
    total: decimalOf(x?.total),
    remaining: decimalOf(x?.remaining),
    currency: x?.currency ?? null,
    payment_status: typeof x?.payment_status === "string" ? x.payment_status : undefined,
    reversed: x?.reversed === true,
    source_kind: typeof x?.source_kind === "string" ? x.source_kind : undefined,
  };
}

export async function getExpenseLedger(
  token: string,
  options: { page?: number; payment?: ExpensePaymentFilter; dateFrom?: string; dateTo?: string } = {}
): Promise<Paged<ExpenseLedgerRow>> {
  const page = options.page ?? 1;
  const perPage = 20;
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (options.payment) qs.set("payment", options.payment);
  if (options.dateFrom) qs.set("date_from", options.dateFrom);
  if (options.dateTo) qs.set("date_to", options.dateTo);
  const d = await request<any>(`/accounting/expense-invoices?${qs.toString()}`, { method: "GET" }, token);
  const items = (Array.isArray(d?.items) ? d.items : []).map(expenseRowOf).filter((r: ExpenseLedgerRow) => r.id);
  const total = Number.isInteger(d?.total) ? Number(d.total) : items.length;
  return { items, total, hasMore: page * perPage < total && items.length > 0 };
}

export async function getExpenseSummary(token: string): Promise<ExpenseSummaryRow[]> {
  const d = await request<any>("/accounting/expense-invoices/summary", { method: "GET" }, token);
  const rows = Array.isArray(d?.currencies) ? d.currencies : [];
  return rows
    .map((c: any) => ({ currency: String(c?.currency || "TRY"), payable: decimalOf(c?.payable) ?? 0, overdue: decimalOf(c?.overdue) ?? 0 }))
    .filter((c: ExpenseSummaryRow) => c.currency);
}

// ---------------------------------------------------------------------------
// Cari — önce GET /accounting/read-model/parties (routers/accounting_read_model.py), 404 → eski /customers.
// Web: pages/CustomersPage.js loadCustomers / fromReadModel / openDetail.
// ---------------------------------------------------------------------------
const LEGACY_ACTIONS: PartyActions = { view_ledger: true, view_orders: true, edit: true, delete: true, collect: true };
const ACTION_NAMES: (keyof PartyActions)[] = ["view_ledger", "view_orders", "edit", "delete", "collect"];

// "legacy:<id>" → "<id>" (eski uçlara giden kimlik).
export function legacyIdOf(value: string): string {
  const s = String(value || "");
  return s.startsWith("legacy:") ? s.slice(7) : s;
}

function roleOf(roles: unknown): string {
  const r = Array.isArray(roles) ? roles : [];
  if (r.includes("customer") && r.includes("supplier")) return "both";
  return r.includes("supplier") ? "supplier" : "customer";
}

function partyFromReadModel(item: any): PartyView {
  const balances = Array.isArray(item?.balances) ? item.balances : [];
  const preferred = balances.find((b: any) => b?.currency === "TRY") || balances[0];
  const actions = Object.fromEntries(ACTION_NAMES.map((n) => [n, item?.actions?.[n] === true])) as PartyActions;
  const balanceAvailable = item?.balance_available === true && decimalOf(preferred?.balance) !== null;
  return {
    id: String(item?.id || ""),
    name: item?.name || "İsimsiz cari",
    source: item?.source === "obihub" ? "obihub" : "legacy",
    balance: balanceAvailable ? (decimalOf(preferred?.balance) as number) : 0,
    currency: preferred?.currency || undefined,
    contact_role: roleOf(item?.roles),
    origin: "read_model",
    actions,
    balanceAvailable,
  };
}

export type PartiesPage = Paged<PartyView> & {
  // Yalnız eski uçta gelir; okuma modelinde web de genel toplam göstermez.
  summary: { total_receivable?: number; total_payable?: number; total_contacts?: number; by_currency?: Record<string, { total_receivable?: number; total_payable?: number }> } | null;
  origin: "read_model" | "customers";
};

export async function getPartiesCompat(
  token: string,
  options: { page?: number; search?: string; balanceStatus?: "receivable" | "payable"; role?: "customer" | "supplier" } = {}
): Promise<PartiesPage> {
  const page = options.page ?? 1;
  const perPage = 30;
  // Web ile aynı: role=all, bakiyeye göre sıralamada ve bakiye süzgecinde TL.
  // C5: web CustomersPage rol süzgeci (müşteri / tedarikçi); yoksa role=all.
  const rm = new URLSearchParams({ per_page: String(perPage), page: String(page), role: options.role || "all", sort: "balance_desc", currency: "TRY" });
  if (options.search) rm.set("q", options.search.slice(0, 100));
  if (options.balanceStatus) rm.set("balance", options.balanceStatus);
  try {
    const d = await request<any>(`/accounting/read-model/parties?${rm.toString()}`, { method: "GET" }, token);
    const items = (Array.isArray(d?.items) ? d.items : []).map(partyFromReadModel).filter((p: PartyView) => p.id);
    const total = Number(d?.total || 0);
    const per = Number(d?.per_page || perPage);
    return { items, total, hasMore: page * per < total && items.length > 0, summary: null, origin: "read_model" };
  } catch (e) {
    if (statusOf(e) !== 404) throw e;
  }
  const res = await getParties(token, { page, search: options.search, balanceStatus: options.balanceStatus, role: options.role });
  const items: PartyView[] = res.items.map((p) => {
    const raw = p as typeof p & { actions?: Partial<PartyActions>; balance_available?: boolean; balance_currency?: string };
    const actions = raw.actions
      ? (Object.fromEntries(ACTION_NAMES.map((n) => [n, raw.actions?.[n] === true])) as PartyActions)
      : LEGACY_ACTIONS;
    // Aşama 4 P5a: `balance` carinin kendi para birimindedir; birimi `balance_currency`.
    const currency = raw.balance_currency || p.currency;
    return { ...p, currency, origin: "customers", actions, balanceAvailable: raw.balance_available !== false };
  });
  return { items, total: res.total, hasMore: res.hasMore, summary: res.summary ?? null, origin: "customers" };
}

const LEDGER_KIND: Record<string, string> = {
  opening_balance: "Açılış bakiyesi",
  invoice: "Fatura",
  collection: "Tahsilat",
  payment: "Ödeme",
  refund: "İade",
  adjustment: "Düzeltme",
  reversal: "Ters kayıt",
};

export type PartyLedgerResult = {
  rows: PartyLedgerRow[];
  // Bakiye bilinmiyorsa null (uydurulmaz).
  balance: number | null;
  currency: string | null;
  // Sıfır olmayan tüm para birimi bakiyeleri (1'den fazlaysa tek sayı gösterilmez).
  balances?: { currency: string; balance: number }[];
  total: number;
};

// Ekstre: ObiHub (yeni çekirdek) carisi okuma modelinden, diğerleri eski /customers/{id}/ledger ucundan.
export async function getPartyLedgerCompat(
  token: string,
  party: { id: string; origin: string; source?: string },
  page = 1
): Promise<PartyLedgerResult> {
  if (party.origin === "read_model" && party.source === "obihub") {
    const d = await request<any>(`/accounting/read-model/parties/${encodeURIComponent(party.id)}/ledger?per_page=100&page=${page}`, { method: "GET" }, token);
    const rows: PartyLedgerRow[] = (Array.isArray(d?.items) ? d.items : []).map((x: any) => {
      const amount = decimalOf(x?.amount) ?? 0;
      return {
        id: String(x?.id || ""),
        date: x?.occurred_on,
        description: (LEDGER_KIND[String(x?.kind)] || "Hesap hareketi") + (x?.reversed === true ? " (ters kayıt)" : ""),
        debit: x?.side === "debit" ? amount : undefined,
        credit: x?.side === "credit" ? amount : undefined,
        balance: decimalOf(x?.balance_after) ?? undefined,
      };
    });
    const balances = Array.isArray(d?.balances) ? d.balances : [];
    const preferred = balances.find((b: any) => b?.currency === "TRY") || balances[0];
    return {
      rows,
      balance: preferred ? decimalOf(preferred.balance) : 0,
      currency: preferred?.currency || null,
      total: Number(d?.total ?? rows.length),
    };
  }
  const res = await getPartyLedger(token, legacyIdOf(party.id), page);
  return { rows: res.rows, balance: res.balance, currency: res.currency, balances: res.balances, total: res.total };
}

// Eski carinin para birimi (okuma modelindeki eski cari satırı para birimi taşımaz). Okunamazsa null.
export async function getLegacyPartyCurrency(token: string, id: string): Promise<string | null> {
  try {
    const d = await request<{ currency?: string }>(`/customers/${encodeURIComponent(legacyIdOf(id))}`, { method: "GET" }, token);
    return typeof d?.currency === "string" && d.currency ? d.currency.toUpperCase() : "TRY";
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gelen kutusu — GET /incoming-inbox?provider=&page=&page_size= (routers/incoming_inbox.py)
// Web: IncomingEInvoicesPage.js (inbox_read açıksa önce bu; 404 → eski sağlayıcı listesi).
// ---------------------------------------------------------------------------
export class InboxUnavailable extends Error {}

export async function getIncomingInbox(token: string, provider: IncomingSource, page = 1): Promise<Paged<IncomingInvoice>> {
  const perPage = 30;
  const qs = new URLSearchParams({ provider, page: String(page), page_size: String(perPage) });
  let d: any;
  try {
    d = await request<any>(`/incoming-inbox?${qs.toString()}`, { method: "GET" }, token);
  } catch (e) {
    if (statusOf(e) === 404) throw new InboxUnavailable("inbox-404");
    throw e;
  }
  // Web incomingSync.inboxRowToItem: kimlik document_key (Paraşüt/BenimPOS/Turkcell'de sağlayıcının kendi kimliği).
  const items: IncomingInvoice[] = (Array.isArray(d?.items) ? d.items : [])
    .map((x: any) => {
      const supplier = x?.supplier && typeof x.supplier === "object" ? x.supplier : {};
      return {
        id: String(x?.document_key || ""),
        invoice_no: x?.invoice_no || undefined,
        sender_name: supplier.name || "",
        sender_tax_no: supplier.tax_no || "",
        issue_date: x?.issue_date || "",
        gross_total: x?.payable_amount ?? undefined,
        currency: x?.currency || undefined,
        status: x?.provider_status || "",
        import_status: x?.import_status,
        import_reimportable: x?.import_reimportable === true,
        // Web incomingSync.legacyIdOf: PDF uçları sağlayıcının kendi kimliğini ister (yalnız satır bu sağlayıcıdansa).
        pdf_id: x?.native_id && (!x?.source || x.source === provider) ? String(x.native_id) : String(x?.document_key || ""),
      } as IncomingInvoice;
    })
    .filter((x: IncomingInvoice) => x.id);
  const total = Number(d?.total || 0);
  const lowerBound = d?.total_is_lower_bound === true;
  return { items, total, hasMore: items.length > 0 && (page * perPage < total || (lowerBound && items.length >= perPage)) };
}

// Web Sidebar.js + useNavVisibility.incomingSourceConnected: BizimHesap firmasında gelen fatura menüsü yalnız
// BenimPOS ya da Turkcell e-Fatura bağlıysa görünür. Okunamazsa kapalı (web ile aynı).
export async function hasNonBizimhesapIncomingSource(token: string): Promise<boolean> {
  const cfg = await request<any>("/settings/accounting", { method: "GET" }, token).catch(() => null);
  if (cfg?.benimpos?.connected === true) return true;
  const tc = await request<any>("/turkcell-efatura/status", { method: "GET" }, token).catch(() => null);
  return Boolean(tc?.connected);
}

// ---------------------------------------------------------------------------
// Cari tahsilatı — POST /customers/{id}/payments (Aşama 4 P2).
// Hesap kuralı fatura tahsilatıyla aynı (carinin para birimi). `allocations` gönderilmez: sunucu en eski vadeli açık faturalara
// dağıtır, artan avans olur (web varsayılanı). İşlem anahtarı başlıkta. Okuma modelindeki "legacy:<id>" eski uca çıplak kimlikle gider.
// ---------------------------------------------------------------------------
export type PartyPaymentResult = {
  id?: string;
  currency?: string;
  allocated_amount?: number | string;
  advance_amount?: number | string;
  allocations?: { invoice_id: string; invoice_number?: string; amount: number | string }[];
  replayed?: boolean;
};

export async function collectPartyPaymentCompat(
  token: string,
  partyId: string,
  // allocations: verilmezse sunucu en eski vadeden dağıtır; [] = tamamı avans (Aşama 4 / P8).
  body: { amount: number | string; payment_method: string; note?: string; payment_date: string; account_id?: string | null; allocations?: { invoice_id: string; amount: string }[] },
  idempotencyKey?: string
) {
  const payload: Record<string, unknown> = { ...body };
  if (!body.account_id) delete payload.account_id;
  if (body.allocations === undefined) delete payload.allocations;
  return request<PartyPaymentResult>(
    `/customers/${encodeURIComponent(legacyIdOf(partyId))}/payments`,
    { method: "POST", body: JSON.stringify(payload), headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined },
    token
  );
}

// ---- Dalga 3 / C2: gider detayı ve borç ödeme (web: ExpenseInvoiceDetail.jsx, PayablePaymentDialog.jsx) ----

export type ExpenseLine = { description: string; quantity: number | null; unit_price: number | null; vat_rate: number | null; discount: number | null; total: number | null };
export type ExpenseDetail = {
  id: string;
  supplier: { name: string; tax_id: string };
  document_number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  lines: ExpenseLine[];
  totals: { payable: number | null; taxable: number | null; vat: number | null; withholding: number | null; other_levies: number | null };
  categoryName: string;
  payable: { ref: string; paid: number | null; remaining: number | null; payment_status: string } | null;
  reversed: boolean;
  canPay: boolean;
  sourceKind: string;
};

export async function getExpenseDetail(token: string, ref: string): Promise<ExpenseDetail> {
  const d = await request<any>(`/accounting/expense-invoices/${encodeURIComponent(ref)}`, { method: "GET" }, token);
  const t = d?.totals || {};
  const p = d?.payable;
  return {
    id: String(d?.id || ref),
    supplier: { name: String(d?.supplier?.name || ""), tax_id: String(d?.supplier?.tax_id || "") },
    document_number: String(d?.document_number || ""),
    issue_date: d?.issue_date ?? null,
    due_date: d?.due_date ?? null,
    currency: String(d?.currency || "TRY"),
    lines: (Array.isArray(d?.lines) ? d.lines : []).map((l: any) => ({
      description: String(l?.description || ""),
      quantity: decimalOf(l?.quantity),
      unit_price: decimalOf(l?.unit_price),
      vat_rate: decimalOf(l?.vat_rate),
      discount: decimalOf(l?.discount),
      total: decimalOf(l?.total),
    })),
    totals: {
      payable: decimalOf(t.payable),
      taxable: decimalOf(t.taxable),
      vat: decimalOf(t.vat),
      withholding: decimalOf(t.withholding),
      other_levies: decimalOf(t.other_levies),
    },
    categoryName: String(d?.expense?.category_name || ""),
    payable: p && p.ref ? { ref: String(p.ref), paid: decimalOf(p.paid), remaining: decimalOf(p.remaining), payment_status: String(p.payment_status || "unknown") } : null,
    reversed: d?.reversed === true,
    canPay: d?.actions?.can_pay === true,
    sourceKind: String(d?.source_kind || ""),
  };
}

// GET /accounting/payables/{ref}/payments → {payable:{total, paid, remaining (dize), currency, status}, can_pay, items[]}
export type PayableInfo = {
  total: string;
  paid: string;
  remaining: string;
  currency: string;
  status: string;
  canPay: boolean;
  items: { id: string; date: string; amount: string; currency: string; account_name: string; completed: boolean }[];
};

const curOf = (c: unknown) => {
  const v = String(c || "").trim().toUpperCase() || "TRY";
  return v === "TRL" ? "TRY" : v;
};

export async function getPayableInfo(token: string, ref: string): Promise<PayableInfo> {
  const d = await request<any>(`/accounting/payables/${encodeURIComponent(ref)}/payments`, { method: "GET" }, token);
  const p = d?.payable || {};
  return {
    total: String(p.total ?? "0"),
    paid: String(p.paid ?? "0"),
    remaining: String(p.remaining ?? "0"),
    currency: curOf(p.currency),
    status: String(p.status || ""),
    canPay: d?.can_pay === true,
    items: (Array.isArray(d?.items) ? d.items : []).map((x: any) => ({
      id: String(x?.id || ""),
      date: String(x?.date || ""),
      amount: String(x?.amount ?? "0"),
      currency: curOf(x?.currency),
      account_name: String(x?.account_name || ""),
      completed: x?.status === "completed",
    })),
  };
}

// Tutar "1250.50" biçiminde dize gider (float'a çevrilmez). Ağ hatası/5xx sonrası AYNI anahtarla yeniden gönderilir;
// kesin ret (4xx, 429 hariç) sonrası çağıran anahtarı yeniler. PAYMENT_LEDGER_CONFLICT'te yeniden gönderilmez.
export async function addPayablePayment(
  token: string,
  ref: string,
  body: { amount: string; date: string; account_id: string; idempotency_key: string; note?: string }
) {
  const payload: Record<string, string> = { amount: body.amount, date: body.date, account_id: body.account_id, idempotency_key: body.idempotency_key };
  if (body.note && body.note.trim()) payload.note = body.note.trim();
  return request<any>(`/accounting/payables/${encodeURIComponent(ref)}/payments`, { method: "POST", body: JSON.stringify(payload) }, token);
}

// Kuruş cinsinden tam sayı ("271.5" → 27150); geçersizse null. Ondalık karşılaştırma float hatasına düşmesin.
export function toMinor(text: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text ?? "").trim());
  return m ? Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0") || "0") : null;
}

// İşletme günü (Europe/Istanbul). Saat dilimi desteklenmezse cihaz günü.
export function istanbulToday(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
}

// Ödeme durumu ve kaynak etiketleri (liste ve detay ortak; web ExpenseInvoiceDetail PAY).
export const EXPENSE_PAY: Record<string, { label: string; kind: "info" | "error" | "success" | "neutral" }> = {
  pending: { label: "Ödenecek", kind: "info" },
  partial: { label: "Kısmi ödendi", kind: "info" },
  overdue: { label: "Gecikti", kind: "error" },
  paid: { label: "Ödendi", kind: "success" },
  unknown: { label: "Bilinmiyor", kind: "neutral" },
  reversed: { label: "Geri alındı", kind: "neutral" },
};
export const EXPENSE_SOURCE: Record<string, string> = { import: "İçeri alınan", manual: "Elle girilen", legacy: "Eski kayıt" };

// ---- Dalga 3 / C3: elle alış/gider faturası (web: components/expenses/ManualExpenseForm.jsx) ----

export type ManualLineInput = {
  kind: "service" | "product";
  productId: string;
  productName: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  discount: string;
};

export type ManualForm = {
  supplierMode: "existing" | "new";
  partyId: string;
  name: string;
  taxId: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  categoryId: string;
  lines: ManualLineInput[];
  warehouseId: string;
};

// "1.250,50" / "1250.5" → "1250.50" benzeri düz ondalık dize (en çok `maxDecimals` hane); geçersizse null. Float'a çevrilmez.
export function decimalText(text: string, maxDecimals: number): string | null {
  // parseAmount ile aynı kural (nokta yalnız binlik deseninde silinir), sonuç dize kalır.
  const raw = String(text || "").trim().replace(/\s/g, "");
  if (!raw) return null;
  let n: string;
  if (raw.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(raw)) return null;
    n = raw.replace(/\./g, "").replace(",", ".");
  } else if (new RegExp(`^\\d+\\.\\d{1,${maxDecimals}}$`).test(raw) && !/^\d{1,3}\.\d{3}$/.test(raw)) {
    n = raw;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    n = raw.replace(/\./g, "");
  } else if (/^\d+$/.test(raw)) {
    n = raw;
  } else return null;
  const [w, f = ""] = n.split(".");
  if (f.length > maxDecimals) return null;
  return f ? `${String(Number(w))}.${f}` : String(Number(w));
}

// Form → sunucu gövdesi; eksik ya da bozuksa { body: null, problems }. Web buildPayload ile aynı kurallar
// (mobilde tevkifat ve KDV dışı vergi girişi yok; bu faturalar web'den girilir).
export function buildManualPayload(f: ManualForm): { body: Record<string, unknown> | null; problems: string[] } {
  const problems: string[] = [];
  const supplier =
    f.supplierMode === "existing"
      ? f.partyId
        ? { party_id: f.partyId }
        : null
      : f.name.trim() && (!f.taxId.trim() || /^(\d{10}|\d{11})$/.test(f.taxId.trim()))
        ? { name: f.name.trim(), ...(f.taxId.trim() ? { tax_id: f.taxId.trim() } : {}) }
        : null;
  if (!supplier) problems.push("supplier");
  if (!f.documentNumber.trim()) problems.push("documentNumber");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.issueDate)) problems.push("issueDate");
  if (f.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(f.dueDate) || f.dueDate < f.issueDate)) problems.push("dueDate");
  const lines = f.lines.map((l) => {
    const quantity = decimalText(l.quantity, 4);
    const unit_price = decimalText(l.unitPrice, 2);
    const discount = l.discount.trim() ? decimalText(l.discount, 2) : undefined;
    if (!l.description.trim() || !quantity || Number(quantity) <= 0 || unit_price === null || discount === null) return null;
    const product = l.kind === "product";
    if (product && !l.productId) {
      problems.push("product");
      return undefined;
    }
    if (product && !/^\d+$/.test(quantity)) {
      problems.push("productQuantity");
      return undefined;
    }
    return {
      description: l.description.trim(),
      quantity,
      unit_price,
      vat_rate: l.vatRate,
      ...(discount ? { discount } : {}),
      ...(product ? { kind: "product", product_id: l.productId } : {}),
    };
  });
  if (!lines.length || lines.some((l) => l === null)) problems.push("lines");
  if (problems.length) return { body: null, problems };
  const hasProduct = lines.some((l) => (l as { kind?: string })?.kind === "product");
  return {
    body: {
      supplier,
      document_number: f.documentNumber.trim(),
      issue_date: f.issueDate,
      ...(f.dueDate ? { due_date: f.dueDate } : {}),
      currency: "TRY",
      ...(f.categoryId ? { expense_category_id: f.categoryId } : {}),
      lines,
      other_taxes: [],
      ...(hasProduct && f.warehouseId ? { warehouse_id: f.warehouseId } : {}),
    },
    problems,
  };
}

export type ManualPreview = {
  draftId: string;
  canConfirm: boolean;
  decisionDigest: string;
  totals: { taxable: string; vat: string; withholding: string; other_taxes: string; payable: string } | null;
  blockers: string[];
  reviews: string[];
  // POSSIBLE_LEGACY_DUPLICATE (review_items): onayı engeller; açık kabul (legacy_duplicate_ack) önizleme gövdesine girer.
  legacyDuplicate: boolean;
  stock: { entry: boolean; warehouseId: string; warehouses: { id: string; name: string }[] } | null;
};

const itemText = (it: any) => String(it?.detail || it?.text || it?.message || "Bu madde kontrol edilmeli.");

export async function previewManualPurchase(token: string, body: Record<string, unknown>, draftId: string | null): Promise<ManualPreview> {
  const d = await request<any>(
    "/accounting/manual-purchases/preview",
    { method: "POST", body: JSON.stringify({ ...body, ...(draftId ? { draft_id: draftId } : {}) }) },
    token
  );
  const t = d?.totals;
  const st = d?.stock && typeof d.stock === "object" ? d.stock : null;
  return {
    draftId: String(d?.draft_id || draftId || ""),
    canConfirm: d?.can_confirm === true,
    decisionDigest: String(d?.decision_digest || ""),
    totals: t
      ? { taxable: String(t.taxable ?? "0"), vat: String(t.vat ?? "0"), withholding: String(t.withholding ?? "0"), other_taxes: String(t.other_taxes ?? "0"), payable: String(t.payable ?? "0") }
      : null,
    blockers: (Array.isArray(d?.blocker_items) ? d.blocker_items : []).map(itemText),
    reviews: (Array.isArray(d?.review_items) ? d.review_items : []).filter((it: any) => it?.key !== "POSSIBLE_LEGACY_DUPLICATE").map(itemText),
    legacyDuplicate: (Array.isArray(d?.review_items) ? d.review_items : []).some((it: any) => it?.key === "POSSIBLE_LEGACY_DUPLICATE"),
    stock: st
      ? {
          entry: st.entry === true,
          warehouseId: String(st.warehouse_id || ""),
          warehouses: (Array.isArray(st.warehouses) ? st.warehouses : []).map((w: any) => ({ id: String(w?.id || ""), name: String(w?.name || "Depo") })).filter((w: any) => w.id),
        }
      : null,
  };
}

// → {status: APPLIED | IN_PROGRESS | NEEDS_REVIEW | REJECTED, result?: {payable_ref, invoice_id}, detail?}
export async function confirmManualPurchase(token: string, draftId: string, decisionDigest: string, idempotencyKey: string) {
  return request<any>(
    `/accounting/manual-purchases/${encodeURIComponent(draftId)}/confirm`,
    { method: "POST", body: JSON.stringify({ decision_digest: decisionDigest, idempotency_key: idempotencyKey }) },
    token
  );
}

export async function getExpenseCategories(token: string): Promise<{ id: string; name: string }[]> {
  const d = await request<any>("/accounting/expense-categories", { method: "GET" }, token);
  return (Array.isArray(d?.items) ? d.items : []).filter((c: any) => c?.id && c.active !== false).map((c: any) => ({ id: String(c.id), name: String(c.name || "Kategori") }));
}

// Yalnız ObiHub tedarikçileri (web useLookups). Okuma servisi yoksa boş liste: "Yeni tedarikçi" ile devam edilir.
export async function getSupplierParties(token: string): Promise<{ id: string; name: string }[]> {
  try {
    const d = await request<any>("/accounting/read-model/parties?role=supplier&per_page=100", { method: "GET" }, token);
    return (Array.isArray(d?.items) ? d.items : [])
      .filter((p: any) => p?.id && p.name && (p.source === undefined || p.source === "obihub"))
      .map((p: any) => ({ id: String(p.id).replace(/^obihub:/, ""), name: String(p.name) }));
  } catch {
    return [];
  }
}

// GET /products?search&limit → düz dizi (ad / SKU / barkod; silinmiş hariç).
export async function searchProducts(token: string, term: string, limit = 8): Promise<{ id: string; name: string; sku: string }[]> {
  const qs = new URLSearchParams({ search: term.trim(), limit: String(limit) });
  const d = await request<any>(`/products?${qs.toString()}`, { method: "GET" }, token);
  return (Array.isArray(d) ? d : []).filter((p: any) => p?.id && p.name && p.deleted !== true).slice(0, limit).map((p: any) => ({ id: String(p.id), name: String(p.name), sku: String(p.sku || "") }));
}

// Web expenseText.errorText: Türkçe cümleyse sunucu metni, değilse yedek metin.
export function manualErrorText(e: any, fallback = "İşlem tamamlanamadı. Lütfen tekrar deneyin."): string {
  if (Number(e?.status) === 429) return "Çok sık deneme yapıldı; biraz bekleyip yeniden deneyin.";
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  return /[ığüşöçİĞÜŞÖÇ]|[.!?]$/.test(m) && m.length < 240 && !/^Request failed|^Network|status code/i.test(m) ? m : fallback;
}
