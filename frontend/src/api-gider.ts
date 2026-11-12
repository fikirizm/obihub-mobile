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
  summary: { total_receivable?: number; total_payable?: number; total_contacts?: number } | null;
  origin: "read_model" | "customers";
};

export async function getPartiesCompat(
  token: string,
  options: { page?: number; search?: string; balanceStatus?: "receivable" | "payable" } = {}
): Promise<PartiesPage> {
  const page = options.page ?? 1;
  const perPage = 30;
  // Web ile aynı: role=all, bakiyeye göre sıralamada ve bakiye süzgecinde TL.
  const rm = new URLSearchParams({ per_page: String(perPage), page: String(page), role: "all", sort: "balance_desc", currency: "TRY" });
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
  const res = await getParties(token, { page, search: options.search, balanceStatus: options.balanceStatus });
  const items: PartyView[] = res.items.map((p) => {
    const raw = p as typeof p & { actions?: Partial<PartyActions>; balance_available?: boolean };
    const actions = raw.actions
      ? (Object.fromEntries(ACTION_NAMES.map((n) => [n, raw.actions?.[n] === true])) as PartyActions)
      : LEGACY_ACTIONS;
    return { ...p, origin: "customers", actions, balanceAvailable: raw.balance_available !== false };
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
  total: number;
};

// Ekstre: ObiHub (yeni çekirdek) carisi okuma modelinden, diğerleri eski /customers/{id}/ledger ucundan.
export async function getPartyLedgerCompat(
  token: string,
  party: { id: string; origin: string; source?: string }
): Promise<PartyLedgerResult> {
  if (party.origin === "read_model" && party.source === "obihub") {
    const d = await request<any>(`/accounting/read-model/parties/${encodeURIComponent(party.id)}/ledger?per_page=100&page=1`, { method: "GET" }, token);
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
  const res = await getPartyLedger(token, legacyIdOf(party.id));
  return { rows: res.rows, balance: res.balance, currency: null, total: res.rows.length };
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
// Cari tahsilatı — POST /customers/{id}/payments (routers/customers.py add_customer_payment).
// `account_id` isteğe bağlıdır (sunucuya ekleniyor; para birimi uyumu sunucuda denetlenecek). Eski sunucu bilinmeyen alanı yok sayar.
// Okuma modelindeki eski cari kimliği ("legacy:<id>") eski uca çıplak kimlikle gider.
// ---------------------------------------------------------------------------
export async function collectPartyPaymentCompat(
  token: string,
  partyId: string,
  body: { amount: number; payment_method: string; note?: string; payment_date: string; account_id?: string | null }
) {
  const payload = { ...body, ...(body.account_id ? { account_id: body.account_id } : {}) };
  if (!body.account_id) delete (payload as { account_id?: unknown }).account_id;
  return request<any>(`/customers/${encodeURIComponent(legacyIdOf(partyId))}/payments`, { method: "POST", body: JSON.stringify(payload) }, token);
}
