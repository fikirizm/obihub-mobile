// Finans alanının yazma uçları: virman, yeni kasa/banka hesabı, yeni cari, yeni satış faturası (taslak).
// İstek gövdeleri web panelindeki formlarla aynıdır (kaynak dosya ve satır her işlevin üstünde yazılıdır).
import { API_BASE_URL, request } from "./api";
import { bytesToBase64 } from "./inbox-ui";
import type { CashAccount, CashEntry, LocalInvoice, Party } from "./types";
import { lifecycleActions } from "./document-lifecycle";
import { accountsPath, movementsPath, type AccountStatus, type MovementFilter } from "./kasa-ui";
import { isUncertainWrite, moneyRetryable, sendKeyedMoney, type KeyedMoneyOutcome } from "./money-retry";
import { collectionPath, orderInvoiceLabel, type Collection } from "./collection-actions";

export { isUncertainWrite, moneyRetryable, sendKeyedMoney, type KeyedMoneyOutcome };

// Sunucu arama metnini düzenli ifade olarak kullanır; özel karakterler kaçırılır.
function escapeSearch(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Virman — POST /finance/transfers (backend/routers/finance.py:195)
// Web gövdesi: frontend/src/components/cash/KasaOS.jsx:93-101 ve pages/KasaPage.js:48-51
// ---------------------------------------------------------------------------
export type TransferBody = {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  // Dalga 3: farklı para birimli hedefe geçen tutar (hedefin para biriminde); aynı birimde gönderilmez.
  to_amount?: string;
  entry_date: string; // YYYY-AA-GG
  description: string;
  reference: string;
};

export async function createTransfer(token: string, body: TransferBody, idempotencyKey?: string) {
  // Aşama 4 P1: atomik virman; aynı anahtarla yeniden deneme yarıda kalanı tamamlar, ikinci virman açmaz.
  return request<{ transfer_id?: string; replayed?: boolean }>(
    "/finance/transfers",
    { method: "POST", body: JSON.stringify(body), headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined },
    token
  );
}

// Tahsilat hatasının gösterilecek metni. Sunucunun Türkçe `detail` metni önceliklidir; kod yalnız metin yoksa ya da belirsiz sonuçta kullanılır.
export function collectErrorText(e: any, uncertain: boolean): string {
  const code = String(e?.code || "");
  if (code === "MONEY_PENDING") return "Tahsilat kaydı tamamlanıyor; birkaç dakika içinde kendiliğinden tamamlanır. Yeniden göndermeyin.";
  if (code === "MONEY_PARTIAL") return e?.message || "İşlem yarım kaldı. Yeniden göndermeden önce kasa hareketlerini kontrol edin.";
  if (code === "ACCOUNT_INACTIVE") return "Seçilen hesap pasif. Başka bir hesap seçin.";
  if (code === "INVOICE_IS_REFUND") return "İade faturasına tahsilat alınamaz.";
  if (uncertain) return "Tahsilatın kaydedilip kaydedilmediği bilinmiyor. Tekrar eklemeden önce hareketleri yenileyip kontrol edin.";
  if (e?.message) return String(e.message);
  if (code === "ACCOUNT_REQUIRED") return "Bu para biriminde birden çok hesap var; tahsilatın yazılacağı hesabı seçin.";
  if (code === "PAYMENT_EXCEEDS_REMAINING") return "Tutar faturanın kalanından büyük olamaz.";
  return "Tahsilat kaydedilemedi.";
}

// Tahsilat hesap seçimi saf modülde (birim testli).
export { accountOptionLabel, accountsForCurrency, isAccountInactive, isPosAccount } from "./account-pick";

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
// Satış faturası — G2 sözleşmesi (docs/pm/tasarim/g2-satis-faturasi-sozlesmesi.md). Gövde src/document-form.ts'te kurulur
// (web lib/documentForm.js ile aynı). POST /local-invoices (yeni, create_key ile idempotent) ve PUT /local-invoices/{id} (tüm form).
// ---------------------------------------------------------------------------
export type DocumentMeta = {
  stock: { owner: string | null; default_mode: "with_document" | "none"; warehouses: { id: string; name: string }[] };
  withholding: { rate: number; label: string }[];
  units: { key: string; label: string }[];
  // %0 KDV istisna / ihraç kayıtlı kodları; sunucu göndermezse web'deki varsayılan liste (document-form DEFAULT_EXEMPTIONS).
  exemptions: { code: string; label: string; group?: string }[];
};

export async function getDocumentMeta(token: string): Promise<DocumentMeta | null> {
  try {
    const m = await request<any>("/documents/meta?type=sales", { method: "GET" }, token);
    const st = m && typeof m.stock === "object" && m.stock ? m.stock : {};
    const wh = Array.isArray(m?.withholding) ? m.withholding.filter((w: any) => Number.isFinite(Number(w?.rate))).map((w: any) => ({ rate: Number(w.rate), label: String(w.label || `${Number(w.rate) / 10}/10`) })) : [];
    return {
      stock: { owner: st.owner || null, default_mode: st.default_mode === "none" ? "none" : "with_document", warehouses: Array.isArray(st.warehouses) ? st.warehouses : [] },
      withholding: wh,
      units: Array.isArray(m?.units) ? m.units.filter((u: any) => u?.key).map((u: any) => ({ key: String(u.key), label: String(u.label || u.key) })) : [],
      exemptions: Array.isArray(m?.exemptions)
        ? m.exemptions.filter((x: any) => x?.code).map((x: any) => ({ code: String(x.code), label: String(x.label || ""), group: x.group ? String(x.group) : undefined }))
        : [],
    };
  } catch {
    return null;
  }
}

// POST /documents/preview (yazmaz): sunucunun onayladığı toplamlar, satır tutarları, stok uyarıları.
export async function previewDocument(token: string, body: unknown) {
  return request<any>("/documents/preview", { method: "POST", body: JSON.stringify(body) }, token);
}

export async function saveSalesDocument(token: string, body: unknown, id?: string) {
  return id
    ? request<LocalInvoice>(`/local-invoices/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }, token)
    : request<LocalInvoice>("/local-invoices", { method: "POST", body: JSON.stringify(body) }, token);
}

export async function deleteLocalInvoice(token: string, id: string) {
  return request<{ message?: string }>(`/local-invoices/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}

// Tutar düzenleme kapısı: sunucunun actions.edit_amounts'ı esas; yoksa durumdan (16 Kas: resmileşmemiş kesilmiş fatura da düzenlenir).
export function isInvoiceEditable(inv: Record<string, any> | null | undefined) {
  if (!inv) return false;
  return lifecycleActions(inv).edit_amounts;
}


// ---- C5: cari düzenle / sil / siparişleri (web CustomerEditor, CustomersPage; sunucu routers/customers.py) ----

export async function getParty(token: string, id: string) {
  return request<any>(`/customers/${encodeURIComponent(id)}`, { method: "GET" }, token);
}

// PUT /customers/{id}: yalnız gönderilen alanlar güncellenir. Açılış bakiyesi mobilde düzenlenmez (cari bakiyesini değiştirir).
export async function updateParty(token: string, id: string, input: Omit<PartyCreateInput, "opening_balance">) {
  const t = (v?: string) => (v || "").trim();
  const body = {
    contact_role: input.contact_role,
    customer_type: input.customer_type,
    name: input.name.trim(),
    tax_no: t(input.tax_no),
    tax_office: t(input.tax_office),
    email: t(input.email),
    phone: t(input.phone),
    address: t(input.address),
    district: t(input.district),
    city: t(input.city),
    iban: t(input.iban),
    notes: t(input.notes),
  };
  return request<Party>(`/customers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }, token);
}

// Yumuşak silme: cari listeden kalkar, hareketleri korunur.
export async function deleteParty(token: string, id: string) {
  return request<{ ok?: boolean }>(`/customers/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}

// Dalga 1: cari arşivle / arşivden çıkar (POST /customers/{id}/archive|unarchive).
export async function setPartyArchived(token: string, id: string, archived: boolean) {
  return request<any>(`/customers/${encodeURIComponent(id)}/${archived ? "archive" : "unarchive"}`, { method: "POST", body: "{}" }, token);
}

export type PartyOrder = { id: string; channel_order_id: string; channel: string; status: string; total_amount: number; currency: string; order_date: string; invoice_label: string | null };

// GET /customers/{id}/orders?limit → {items[], total}
export async function getPartyOrders(token: string, id: string, limit = 20): Promise<{ items: PartyOrder[]; total: number }> {
  const d = await request<any>(`/customers/${encodeURIComponent(id)}/orders?limit=${limit}`, { method: "GET" }, token);
  const items: PartyOrder[] = (Array.isArray(d?.items) ? d.items : []).map((o: any) => ({
    id: String(o?.id || ""),
    channel_order_id: String(o?.channel_order_id || ""),
    channel: String(o?.channel || o?.integration_name || ""),
    status: String(o?.status || ""),
    total_amount: Number(o?.total_amount) || 0,
    currency: String(o?.currency || "TRY"),
    order_date: String(o?.order_date || o?.created_at || ""),
    invoice_label: orderInvoiceLabel(o || {}),
  }));
  return { items, total: Number(d?.total ?? items.length) };
}

// ---------------------------------------------------------------------------
// Aşama 4 / P11: tahsilat sil / düzenle (web components/money/CollectionActions.jsx).  Her ikisi Idempotency-Key ile.
export async function voidCollection(token: string, c: Collection, idempotencyKey: string, reason?: string) {
  return request<any>(
    collectionPath(c),
    { method: "DELETE", ...(reason ? { body: JSON.stringify({ reason }) } : {}), headers: { "Idempotency-Key": idempotencyKey } },
    token
  );
}

export async function editCollection(token: string, c: Collection, body: Record<string, string>, idempotencyKey: string) {
  return request<any>(collectionPath(c), { method: "PATCH", body: JSON.stringify(body), headers: { "Idempotency-Key": idempotencyKey } }, token);
}

// ---------------------------------------------------------------------------
// C4 eki: fatura tahsilatının Paraşüt senkronu (web lib/parasutCapabilities.js, SalesInvoiceFormOS ParasutPayState).
let capsCache: { token: string; value: { payment_sync: boolean } } | null = null;
export async function getParasutPaymentCaps(token: string): Promise<{ payment_sync: boolean }> {
  if (capsCache?.token === token) return capsCache.value;
  try {
    const r = await request<any>("/local-invoices/import/parasut/capabilities", { method: "GET" }, token);
    const value = { payment_sync: r?.payment_sync === true };
    capsCache = { token, value };
    return value;
  } catch {
    return { payment_sync: false }; // okunamazsa kapalı; sunucu her uçta ayrıca denetler
  }
}

export type ParasutAccount = { id: string; name: string };
export async function getParasutAccounts(token: string): Promise<ParasutAccount[]> {
  const r = await request<any>("/parasut/accounts", { method: "GET" }, token);
  return (Array.isArray(r) ? r : []).map((a: any) => ({ id: String(a?.id ?? ""), name: String(a?.name || `Hesap ${a?.id}`) })).filter((a: ParasutAccount) => a.id);
}

export async function postParasutPaymentAction(token: string, path: string, body: Record<string, unknown>) {
  return request<any>(path, { method: "POST", body: JSON.stringify(body) }, token);
}

// ---------------------------------------------------------------------------
// Aşama 4 / P8: cari tahsilatı dağıtımı (web CustomersPage, AllocateAdvanceDialog).
// 13 Kas 2026 (K8/K10): credit (eşleşmemiş alacak, sayı), has_credit, can_match, match_blocked_reason eklendi; eski alanlar aynı.
export type AllocationState = {
  currency: string;
  advance: string;
  credit: number;
  has_credit: boolean;
  can_match: boolean;
  match_blocked_reason: "ledger_pending" | "ledger_issue" | null;
  open_invoices: import("./allocation").OpenInvoice[];
};
export async function getAllocationState(token: string, customerId: string): Promise<AllocationState> {
  const d = await request<any>(`/customers/${encodeURIComponent(customerId)}/allocation-state`, { method: "GET" }, token);
  return {
    currency: String(d?.currency || "TRY").toUpperCase().replace("TRL", "TRY"),
    advance: String(d?.advance ?? "0"),
    credit: Number(d?.credit ?? d?.advance ?? 0) || 0,
    has_credit: d?.has_credit === true,
    can_match: d?.can_match === true,
    match_blocked_reason: d?.match_blocked_reason === "ledger_pending" || d?.match_blocked_reason === "ledger_issue" ? d.match_blocked_reason : null,
    open_invoices: (Array.isArray(d?.open_invoices) ? d.open_invoices : []).map((i: any) => ({ ...i, id: String(i?.id || ""), remaining: String(i?.remaining ?? "0") })),
  };
}
export async function postAllocations(token: string, customerId: string, allocations: { invoice_id: string; amount: string }[], idempotencyKey: string) {
  return request<any>(
    `/customers/${encodeURIComponent(customerId)}/allocations`,
    { method: "POST", body: JSON.stringify({ allocations }), headers: { "Idempotency-Key": idempotencyKey } },
    token
  );
}

// ---------------------------------------------------------------------------
// 13 Kas 2026 — K8 "Eşleşmeyi kaldır" ve K9 cari virman (docs/mobil-oturum-icin-notlar.md 3 ve 5). Hepsi Idempotency-Key ile.
export async function unmatchAllocation(token: string, invoiceId: string, paymentId: string, idempotencyKey: string) {
  return request<any>(
    `/local-invoices/${encodeURIComponent(invoiceId)}/allocations/${encodeURIComponent(paymentId)}`,
    { method: "DELETE", headers: { "Idempotency-Key": idempotencyKey } },
    token
  );
}

export type CustomerTransfer = {
  id: string;
  source_customer_id: string;
  source_name?: string;
  target_customer_id: string;
  target_name?: string;
  currency?: string;
  amount: string;
  date?: string;
  note?: string;
  voided?: boolean;
  direction?: "out" | "in";
};
export async function createCustomerTransfer(token: string, customerId: string, body: { target_customer_id: string; amount: string; date: string; note: string }, key: string) {
  return request<CustomerTransfer & { replayed?: boolean }>(
    `/customers/${encodeURIComponent(customerId)}/transfers`,
    { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key } },
    token
  );
}
export async function patchCustomerTransfer(token: string, customerId: string, transferId: string, body: { amount: string; date: string; note: string }, key: string) {
  return request<any>(
    `/customers/${encodeURIComponent(customerId)}/transfers/${encodeURIComponent(transferId)}`,
    { method: "PATCH", body: JSON.stringify(body), headers: { "Idempotency-Key": key } },
    token
  );
}
export async function deleteCustomerTransfer(token: string, customerId: string, transferId: string, key: string) {
  return request<any>(
    `/customers/${encodeURIComponent(customerId)}/transfers/${encodeURIComponent(transferId)}`,
    { method: "DELETE", headers: { "Idempotency-Key": key } },
    token
  );
}

// ---------------------------------------------------------------------------
// D-12 satış faturası yaşam döngüsü (docs/pm/tasarim/D-12.md). Yazan uçlar işlem anahtarlı (gövdede idempotency_key + başlık);
// belirsiz sonuçta aynı anahtarla yeniden gönderilir (sendKeyedMoney).
// ---------------------------------------------------------------------------
const lcPath = (id: string, tail: string) => `/local-invoices/${encodeURIComponent(id)}/${tail}`;
const keyed = (key: string) => ({ "Idempotency-Key": key });

export async function cancelInvoice(token: string, id: string, reason: string, key: string) {
  return request<any>(lcPath(id, "cancel"), { method: "POST", body: JSON.stringify({ reason, idempotency_key: key }), headers: keyed(key) }, token);
}
// e-Belgeli faturada yerel iptalden önce ayrı, onaylı e-belge iptali (geri alınamaz).
export async function cancelInvoiceEdoc(token: string, id: string, reason: string, key: string) {
  return request<any>(lcPath(id, "cancel/edoc"), { method: "POST", body: JSON.stringify({ reason, confirm: true, idempotency_key: key }), headers: keyed(key) }, token);
}
export async function getInvoiceReturns(token: string, id: string) {
  return request<{ items?: any[]; returned_totals?: Record<string, string> }>(lcPath(id, "returns"), { method: "GET" }, token);
}
export async function createInvoiceReturn(
  token: string,
  id: string,
  body: { kind: "iade_faturasi" | "gider_pusulasi"; lines: { source_line_key: string; quantity: string }[]; stock_in: boolean; date: string; note?: string },
  key: string
) {
  return request<any>(lcPath(id, "returns"), { method: "POST", body: JSON.stringify({ ...body, idempotency_key: key }), headers: keyed(key) }, token);
}
export async function copyInvoice(token: string, id: string, key: string) {
  return request<any>(lcPath(id, "copy"), { method: "POST", body: JSON.stringify({ idempotency_key: key }), headers: keyed(key) }, token);
}
export async function setInvoiceArchived(token: string, id: string, archived: boolean) {
  return request<any>(lcPath(id, archived ? "archive" : "unarchive"), { method: "POST", body: "{}" }, token);
}
export async function getInvoiceEvents(token: string, id: string, before?: string) {
  const qs = new URLSearchParams({ limit: "50" });
  if (before) qs.set("before", before);
  return request<{ items?: any[]; next_before?: string | null }>(`${lcPath(id, "events")}?${qs.toString()}`, { method: "GET" }, token);
}

// GET /local-invoices/{id}/pdf → application/pdf (base64 olarak döner) ya da aynalı belgede {redirect: url}.
export async function getInvoicePdf(token: string, id: string): Promise<{ base64?: string; redirect?: string }> {
  const res = await fetch(`${API_BASE_URL}${lcPath(id, "pdf")}`, { headers: { Authorization: `Bearer ${token}` } });
  const type = res.headers.get("Content-Type") || "";
  if (!res.ok) {
    const j: any = await res.json().catch(() => null);
    throw Object.assign(new Error(typeof j?.detail === "string" ? j.detail : "Fatura PDF'i alınamadı."), { status: res.status, code: j?.code });
  }
  if (type.includes("application/json")) {
    const j: any = await res.json().catch(() => null);
    if (j?.redirect) return { redirect: String(j.redirect) };
    throw new Error("Fatura PDF'i alınamadı.");
  }
  return { base64: bytesToBase64(new Uint8Array(await res.arrayBuffer())) };
}

// ---------------------------------------------------------------------------
// D-15 Kasa listesi ve hesap yönetimi (docs/pm/tasarim/D-15.md)
// ---------------------------------------------------------------------------
export type AccountsList = {
  items: CashAccount[];
  groups?: { key?: string; label?: string; count?: number; account_ids?: string[] }[];
  counts?: { active?: number; archived?: number };
  totals_by_currency?: Record<string, number>;
  archived_totals_by_currency?: Record<string, number>;
};

export async function getAccountsList(token: string, status: AccountStatus = "active"): Promise<AccountsList> {
  const d = await request<any>(accountsPath(status), { method: "GET" }, token);
  return { ...(d && typeof d === "object" ? d : {}), items: Array.isArray(d?.items) ? d.items : [] };
}

export async function archiveAccount(token: string, id: string, confirmNonzeroBalance = false) {
  return request<CashAccount>(`/finance/accounts/${encodeURIComponent(id)}/archive`, { method: "POST", body: JSON.stringify({ confirm_nonzero_balance: confirmNonzeroBalance }) }, token);
}
export async function unarchiveAccount(token: string, id: string) {
  return request<CashAccount>(`/finance/accounts/${encodeURIComponent(id)}/unarchive`, { method: "POST" }, token);
}
export async function deleteAccount(token: string, id: string) {
  return request<{ status: string; id: string }>(`/finance/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}

export type MovementsPage = {
  account?: CashAccount;
  items: CashEntry[];
  undone_items?: CashEntry[];
  next_cursor?: string | null;
  has_more?: boolean;
  total?: number;
  running_balance_available?: boolean;
  totals?: { currency?: string; in?: number; out?: number; net?: number; count?: number; before_opening?: { in?: number; out?: number; count?: number } };
};

export async function getAccountMovements(token: string, accountId: string, f: MovementFilter = {}): Promise<MovementsPage> {
  const d = await request<any>(movementsPath(accountId, f), { method: "GET" }, token);
  return {
    ...(d && typeof d === "object" ? d : {}),
    items: Array.isArray(d?.items) ? d.items : [],
    undone_items: Array.isArray(d?.undone_items) ? d.undone_items : [],
  };
}

// Dalga 3 (P3.2): TCMB kurları — GET /finance/fx-rates?date= → {date, rate_date, available, rates: {USD: {buying, selling}}}.
export async function getFxRates(token: string, date?: string) {
  return request<{ date?: string; rate_date?: string | null; available?: boolean; rates?: Record<string, { buying?: string; selling?: string }> }>(
    `/finance/fx-rates${date ? `?date=${encodeURIComponent(date)}` : ""}`,
    { method: "GET" },
    token
  );
}
