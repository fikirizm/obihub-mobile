// Satış Fişleri (saf modül; birim testi dev/test-pos-receipts.mjs). Faz A: GET /pos/receipts?page&per_page≤100&q →
// {items:[…, item_count], total}; GET /pos/receipts/{id} → satış belgesi (404 "Satış fişi bulunamadı."). Web: pages/POSReceiptsPage.jsx.

export const PER_PAGE = 25;

export function receiptsPath(page: number, q: string) {
  const qs = new URLSearchParams({ page: String(Math.max(1, Math.trunc(page) || 1)), per_page: String(PER_PAGE) });
  const term = String(q || "").trim();
  if (term) qs.set("q", term);
  return `/pos/receipts?${qs.toString()}`;
}
export const receiptPath = (id: string) => `/pos/receipts/${encodeURIComponent(id)}`;

export const pageCount = (total: number) => Math.max(1, Math.ceil((Number(total) || 0) / PER_PAGE));
export const hasNext = (page: number, total: number) => page * PER_PAGE < (Number(total) || 0);

const METHODS: Record<string, string> = { nakit: "Nakit", kart: "Kart", karma: "Nakit + kart", acik_hesap: "Açık hesap" };
export const methodText = (m: unknown) => METHODS[String(m || "")] || "—";

export function statusText(s: any) {
  if (s?.deleted) return "Silindi";
  if (s?.status === "cancelled") return "İptal edildi";
  if (s?.status === "completed") return "Tamamlandı";
  if (s?.status === "stock_error") return "Stok işlemi bekliyor";
  return "İşlem tamamlanıyor";
}

export type Badge = { label: string; tone: "success" | "warning" | "error" | "neutral" };
export function badges(s: any): Badge[] {
  const out: Badge[] = [];
  if (s?.receipt_delete_started) out.push({ label: "Siliniyor", tone: "warning" });
  if (s?.stock_restore_error) out.push({ label: "Stok iadesi bekliyor", tone: "error" });
  if (s?.ledger_pending) out.push({ label: "Cari kaydı bekliyor", tone: "warning" });
  if (s?.invoice_id) out.push({ label: s?.invoice_number ? `Fatura ${s.invoice_number}` : "Faturaya bağlı", tone: "success" });
  return out;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type ReceiptRow = { id: string; number: string; createdAt: string; customer: string; method: string; status: string; total: number; itemCount: number; badges: Badge[] };
export function receiptRow(s: any): ReceiptRow {
  return {
    id: String(s?.id || ""),
    number: String(s?.sale_number || "—"),
    createdAt: String(s?.created_at || ""),
    customer: String(s?.customer_name || "").trim() || "Genel Müşteri",
    method: methodText(s?.payment_type),
    status: statusText(s),
    total: num(s?.total),
    itemCount: num(s?.item_count),
    badges: badges(s),
  };
}

export function receiptDetail(s: any) {
  const items: any[] = Array.isArray(s?.items) ? s.items : [];
  return {
    ...receiptRow({ ...s, item_count: items.length }),
    invoiceId: s?.invoice_id ? String(s.invoice_id) : null,
    notes: String(s?.notes || ""),
    subtotal: num(s?.subtotal),
    discount: num(s?.discount_amount),
    vat: num(s?.vat_amount),
    lines: items.map((l) => {
      const qty = num(l?.quantity);
      const unit = num(l?.unit_price);
      const disc = num(l?.discount_percent);
      const total = l?.line_total === null || l?.line_total === undefined ? Math.round(unit * qty * (1 - disc / 100) * 100) / 100 : num(l.line_total);
      return { name: String(l?.product_name || "Ürün"), sku: String(l?.sku || ""), quantity: qty, unitPrice: unit, discountPercent: disc, vatRate: num(l?.vat_rate), total };
    }),
  };
}

export function readError(e: { status?: number; message?: string } | null | undefined) {
  const s = Number(e?.status);
  if (s === 403) return "Satış fişlerini görme yetkiniz yok. Yöneticinizden Satışlar modülü için izin isteyin.";
  if (s === 404) return typeof e?.message === "string" && e.message.trim() ? e.message.trim() : "Satış fişi bulunamadı.";
  return "Satış fişleri yüklenemedi. Kayıtlarınız korunuyor; yeniden deneyebilirsiniz.";
}
