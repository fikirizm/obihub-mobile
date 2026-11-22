// F1 — gelir-gider özeti: GET /finance/income-expense-summary (Aşama 4 / P5a; sözleşme docs/mobil-oturum-icin-notlar.md).
// Tutarlar sunucudan dize gelir ("1234.50"); para birimleri toplanmaz. Nakit esasında `vat` alanları null, gross = net.
import { request } from "./api";

export type SummaryBasis = "accrual" | "cash";

export type SummarySource = { net: string; vat: string | null; gross: string; count: number; origin?: "obihub" | "parasut"; vat_unknown_count?: number };
export type SummarySide = { net: string; vat: string | null; gross: string; vat_unknown?: string; sources: Record<string, SummarySource> };
export type SummaryCategory = { kind: "income" | "expense"; category_id: string; name: string; source: string; net: string };
// P6.3: tags yalnız tahakkukta; etiketsiz kova tag_id null, en sonda.
export type SummaryTag = { tag_id: string | null; name: string; income: string; expense: string; result: string };
export type CurrencySummary = { currency: string; income: SummarySide; expense: SummarySide; result: string; categories: SummaryCategory[]; tags?: SummaryTag[] };
export type IncomeExpenseSummary = {
  period: { from: string; to: string };
  basis: SummaryBasis;
  currencies: CurrencySummary[];
  scope: {
    as_of?: string;
    parasut_last_import?: string | null;
    unsplit_pos_mixed?: number;
    refund_split_unknown?: number;
    excluded?: string[];
    notes?: { tags?: string };
  };
};

export async function getIncomeExpenseSummary(token: string, opts: { from: string; to: string; basis: SummaryBasis }) {
  const qs = new URLSearchParams({ date_from: opts.from, date_to: opts.to, basis: opts.basis });
  const d = await request<IncomeExpenseSummary>(`/finance/income-expense-summary?${qs.toString()}`, { method: "GET" }, token);
  return { ...d, currencies: Array.isArray(d?.currencies) ? d.currencies : [], scope: d?.scope || {} } as IncomeExpenseSummary;
}

export const num = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Kaynak adları (sunucu anahtarı → ekran metni). Bilinmeyen anahtar olduğu gibi gösterilmez, "Diğer" olur.
const SOURCE_LABELS: Record<string, string> = {
  sales_invoices: "Satış faturaları",
  parasut_imported_invoices: "Paraşüt faturaları",
  pos: "Hızlı satış",
  income_records: "Gelir kayıtları",
  expense_records: "Gider kayıtları",
  invoice_collections: "Fatura tahsilatları",
  customer_collections: "Cari tahsilatları",
  payable_payments: "Borç ödemeleri",
  other: "Diğer",
};

export function sourceLabel(key: string, side: "income" | "expense", basis: SummaryBasis) {
  if (key === "manual") return basis === "cash" ? "Elle kasa hareketi" : side === "income" ? "Elle kasa geliri" : "Elle kasa gideri";
  return SOURCE_LABELS[key] || "Diğer";
}

// Kapsam dışı kalanlar (scope.excluded) — "kapsam" notu için kısa metinler.
const EXCLUDED_LABELS: Record<string, string> = {
  uninvoiced_orders: "faturalanmamış siparişler",
  purchase_invoices_in_parasut: "Paraşüt'teki alış faturaları",
  external_sales_invoices_cache: "muhasebe programındaki satış faturası listesi",
  draft_quote_cancelled_invoices: "taslak, teklif ve iptal faturalar",
  internal_transfers: "hesaplar arası virmanlar",
  manual_cash_income_invoice_collection_category: "\"fatura tahsilatı\" olarak elle girilen kasa gelirleri",
  pos_not_posted_to_cash: "kasaya işlenmemiş POS satışları",
  pos_sales_before_cash_posting: "kasaya yazım başlamadan önceki POS satışları",
};

export function excludedText(keys: string[] | undefined) {
  const parts = (keys || []).map((k) => EXCLUDED_LABELS[k]).filter(Boolean);
  return parts.length ? `Dahil değil: ${parts.join(", ")}.` : "";
}
