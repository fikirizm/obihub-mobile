// KABUK-2 cari/ürün hızlı bakışı (saf modül; birim testi dev/test-quicklook.mjs). Web: components/quicklook/useCariOzet.js, useUrunOzet.js.
// Yalnız okuma; fatura formunun durumu değişmez. Uçlar (web'de doğrulandı):
//  cari: GET /customers/{id} (404 → /accounting/read-model/parties/{id}), .../ledger?per_page=5, /customers/{id}/orders?limit=3
//  ürün: GET /products/{id}, /products/{id}/warehouse-stock, /products/{id}/price-history?side=purchase&limit=1, /products/{id}/sales?per_page=5

const KIND: Record<string, string> = { opening_balance: "Açılış bakiyesi", invoice: "Fatura", collection: "Tahsilat", payment: "Ödeme", refund: "İade", adjustment: "Düzeltme", reversal: "Ters kayıt" };
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// Para birimi başına bakiye; sıfırlar atılır, para birimleri toplanmaz.
export function balanceRows(c: any): { currency: string; balance: number }[] {
  const rows =
    Array.isArray(c?.balances) && c.balances.length
      ? c.balances
      : c?.balance !== null && c?.balance !== undefined && c?.balance !== "" && Number.isFinite(Number(c.balance))
        ? [{ currency: c.balance_currency || c.currency || "TRY", balance: c.balance }]
        : [];
  return rows.filter((r: any) => Math.abs(Number(r.balance)) > 0.004).map((r: any) => ({ currency: r.currency || "TRY", balance: Number(r.balance) }));
}

export function ledgerRow(it: any, i: number) {
  return {
    id: it.id ?? i,
    date: it.occurred_on || it.date || "",
    reference: it.document_number || it.reference || "",
    label: KIND[it.kind] || it.description || "Hesap hareketi",
    debit: it.side ? (it.side === "debit" ? it.amount : null) : it.debit,
    credit: it.side ? (it.side === "credit" ? it.amount : null) : it.credit,
    balance: it.balance_after ?? it.balance ?? null,
    currency: it.currency || "TRY",
  };
}

const thousands = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// Türkçe miktar: binlik nokta, ondalık virgül, en çok 3 ondalık.
export function qtyText(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const [i, f] = (Math.round(n * 1000) / 1000).toString().split(".");
  return `${thousands(i)}${f ? `,${f}` : ""}`;
}

export function stockView(ws: any): { tracks: boolean; rows: { key: string; name: string; qty: string }[]; total: string | null } {
  if (ws?.tracks_stock === false) return { tracks: false, rows: [], total: null };
  const rows =
    ws?.split && Array.isArray(ws.warehouses)
      ? ws.warehouses.map((w: any) => ({ key: String(w.warehouse_id || w.name), name: String(w.name || "Depo"), qty: qtyText(w.quantity) }))
      : [];
  const t = ws?.total;
  const v = t?.sellable ?? t?.on_hand;
  return { tracks: true, rows, total: v === undefined || v === null ? null : qtyText(v) };
}

export function purchaseView(r: any) {
  const it = Array.isArray(r?.items) ? r.items[0] : null;
  return it ? { date: it.date, price: it.unit_price_net, currency: it.currency || "TRY", party: it.party?.name || "", number: it.document?.number || "" } : null;
}

export type SaleRow = { key: string; party: string; date: string; number: string; qty: string; price: string | number | null; currency: string };
export function saleRows(r: any): SaleRow[] {
  return (Array.isArray(r?.items) ? r.items : []).slice(0, 5).map((s: any, i: number) => ({
    key: `${s.invoice?.id || "x"}-${i}`,
    party: s.party?.name || "—",
    date: s.date || "",
    number: s.invoice?.number || "",
    qty: `${qtyText(s.quantity)}${s.unit ? ` ${s.unit}` : ""}`,
    price: s.unit_price_net,
    currency: s.currency || "TRY",
  }));
}

// "2026-11-20" → "20 Kas 2026" (yalnız tarih: kaydırılmaz); saatli değer İstanbul gününe çevrilir.
export function dayText(v: unknown): string {
  const s = String(v || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 3 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Sipariş kanalı adı (web CariQuickLook CHANNEL + ObiHub web mağaza).
const CHANNEL: Record<string, string> = { trendyol: "Trendyol", hepsiburada: "Hepsiburada", n11: "N11", pazarama: "Pazarama", idefix: "idefix", woocommerce: "Web sitesi", website: "Web mağaza", amazon: "Amazon", shopify: "Shopify", ciceksepeti: "Çiçeksepeti", pttavm: "PttAVM" };
export function channelText(c: unknown): string {
  const s = String(c || "");
  return s ? CHANNEL[s.toLowerCase()] || s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1) : "";
}
