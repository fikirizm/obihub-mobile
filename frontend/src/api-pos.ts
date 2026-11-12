// D1 — Hızlı satış (POS). Web: pages/POSPage.js. Sunucu: backend/routers/pos.py (POST /pos/sales).
// Fiyatlar KDV dahildir; satır = birim × adet × (1 − satır indirimi %); genel indirim tutardır; KDV = satır × oran / (100 + KDV oranı).
// Sunucu ekranda gösterilen tutarı 0,01'den fazla sapan satışı reddeder (sessiz düzeltme yok).
// İşlem anahtarı: her satış denemesine bir anahtar; ağ hatası / 5xx sonrası AYNI anahtar ve AYNI sepetle tekrar.
// Aynı anahtar + farklı sepet → 409. 200 yanıtı = satış ve stok düşümü tamamlandı.
// Aşama 4 / P4: satışın ödemesi kasaya yazılır (nakit → varsayılan TL kasa, kart → "pos" türü TL hesap, karma → iki bacak).
// Açık hesap: kayıtlı müşteri kartına borç yazılır, kasaya yazılmaz (customer_id zorunlu; karma yalnız nakit + kart).
import { getCashAccounts, request } from "./api";
import { karmaPayments, openAccountFields, posTotalsCents, splitCents, toCents } from "./pos-money";
import type { CashAccount } from "./types";

export type PosProduct = { id: string; name: string; sku: string; barcode: string; price: number; vatRate: number; stock: number; imageUrl: string };

function productOf(p: any): PosProduct {
  const vat = Number(p?.vat_rate);
  return {
    id: String(p?.id || ""),
    name: String(p?.name || "Ürün"),
    sku: String(p?.sku || ""),
    barcode: String(p?.barcode || ""),
    price: Number(p?.price) || 0,
    // Web POSPage varsayılanı (vat_rate ?? 18).
    vatRate: Number.isFinite(vat) && p?.vat_rate !== null && p?.vat_rate !== undefined ? vat : 18,
    stock: Number(p?.stock) || 0,
    imageUrl: /^https?:\/\//i.test(String(p?.image_url || "")) ? String(p.image_url) : "",
  };
}

// GET /products?search&limit → düz dizi (ad / SKU / barkod, silinmiş hariç).
export async function searchPosProducts(token: string, term: string, limit = 20): Promise<PosProduct[]> {
  const qs = new URLSearchParams({ search: term.trim(), limit: String(limit) });
  const d = await request<any>(`/products?${qs.toString()}`, { method: "GET" }, token);
  return (Array.isArray(d) ? d : []).filter((p: any) => p?.id && p.deleted !== true).map(productOf);
}

// Barkodla tek ürün: önce birebir barkod, yoksa birebir SKU; birden çok aday varsa null (kullanıcı seçer).
export async function findByBarcode(token: string, code: string): Promise<{ exact: PosProduct | null; candidates: PosProduct[] }> {
  const list = await searchPosProducts(token, code, 10);
  const c = code.trim();
  const byBarcode = list.filter((p) => p.barcode === c);
  if (byBarcode.length === 1) return { exact: byBarcode[0], candidates: list };
  const bySku = list.filter((p) => p.sku === c);
  if (!byBarcode.length && bySku.length === 1) return { exact: bySku[0], candidates: list };
  return { exact: null, candidates: list };
}

export type CartLine = { product: PosProduct; quantity: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function cartTotals(lines: CartLine[], discountAmount: number) {
  const lineTotals = lines.map((l) => l.product.price * l.quantity);
  const subtotal = lineTotals.reduce((s, v) => s + v, 0);
  const discount = Math.min(Math.max(0, discountAmount), subtotal);
  const ratio = subtotal > 0 ? 1 - discount / subtotal : 1;
  const vat = lines.reduce((s, l, i) => s + (lineTotals[i] * ratio * l.product.vatRate) / (100 + l.product.vatRate), 0);
  // Ara toplam, indirim ve toplam sunucunun yöntemiyle kuruşta (float 1 kuruş sapabilir).
  const c = posTotalsCents(lines.map((l) => ({ unit_price: l.product.price, quantity: l.quantity, discount_percent: 0 })), discountAmount);
  return { subtotal: c.subtotalCents / 100, discount: c.discountCents / 100, vat: r2(vat), total: c.totalCents / 100, itemCount: lines.reduce((s, l) => s + l.quantity, 0) };
}

export type PaymentType = "nakit" | "kart" | "karma" | "acik_hesap";

// Kuruş hesapları ve karma bölmesi: ./pos-money (saf, birim testli).
export { splitCents, toCents };

export type PosPayOptions = { cashCents?: number; cardAccountId?: string; customer?: { id: string; name: string } | null };

export function posPayload(lines: CartLine[], discountAmount: number, payment: PaymentType, paid: number, opts: PosPayOptions = {}) {
  const t = cartTotals(lines, discountAmount);
  const totalCents = toCents(t.total);
  const split = payment === "karma" ? splitCents(totalCents, opts.cashCents ?? 0) : null;
  const usesCard = payment === "kart" || (split !== null && split.card > 0);
  return {
    items: lines.map((l) => ({
      product_id: l.product.id,
      product_name: l.product.name,
      sku: l.product.sku,
      barcode: l.product.barcode,
      unit_price: l.product.price,
      quantity: l.quantity,
      discount_percent: 0,
      vat_rate: l.product.vatRate,
    })),
    customer_name: "Genel Müşteri",
    customer_id: null,
    payment_type: payment,
    subtotal: t.subtotal,
    discount_amount: t.discount,
    vat_amount: t.vat,
    total: t.total,
    paid_amount: paid,
    change_amount: r2(Math.max(0, paid - t.total)),
    notes: split ? `Karma ödeme: Nakit ₺${(split.cash / 100).toFixed(2)}, Kart ₺${(split.card / 100).toFixed(2)}` : "",
    session_number: 1,
    ...(split ? { payments: karmaPayments(totalCents, split.cash) } : {}),
    ...(usesCard && opts.cardAccountId ? { card_account_id: opts.cardAccountId } : {}),
    ...(payment === "acik_hesap" && opts.customer ? openAccountFields(opts.customer) : {}),
  };
}

export type PosCashEntry = { method: string; accountName: string; amount: number };
export type PosSale = {
  id: string;
  saleNumber: string;
  total: number;
  paymentType: string;
  itemCount: number;
  // posted: kasaya yazıldı · pending: birkaç dakika içinde yazılacak (yeniden gönderilmez) · none: kasa kaydı yok (eski sunucu).
  cashStatus: "posted" | "pending" | "none";
  cashEntries: PosCashEntry[];
  rounded: boolean;
  // Açık hesap: cari defterine yazım (posted | pending) ve carinin adı.
  ledgerStatus: "posted" | "pending" | "";
  customerName: string;
};

export async function createPosSale(token: string, body: ReturnType<typeof posPayload>, idempotencyKey: string): Promise<PosSale> {
  const d = await request<any>("/pos/sales", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": idempotencyKey } }, token);
  const cs = String(d?.cash_status || "none");
  return {
    id: String(d?.id || ""),
    saleNumber: String(d?.sale_number || ""),
    total: Number(d?.total) || 0,
    paymentType: String(d?.payment_type || ""),
    itemCount: Number(d?.item_count) || 0,
    cashStatus: cs === "posted" || cs === "pending" ? cs : "none",
    cashEntries: (Array.isArray(d?.cash_entries) ? d.cash_entries : []).map((e: any) => ({
      method: String(e?.method || ""),
      accountName: String(e?.account_name || ""),
      amount: Number(e?.amount) || 0,
    })),
    rounded: Array.isArray(d?.warnings) && d.warnings.includes("POS_SPLIT_ROUNDED"),
    ledgerStatus: d?.ledger_status === "posted" || d?.ledger_status === "pending" ? d.ledger_status : "",
    customerName: String(d?.customer_name || ""),
  };
}

// Kart ödemesinin yazılabileceği POS (Kart) hesapları: "pos" türü, TL, etkin. Birden çoksa kart ödemesinde seçim zorunlu (400 POS_CARD_ACCOUNT_REQUIRED).
export async function getPosCardAccounts(token: string): Promise<CashAccount[]> {
  const isTry = (c?: string) => ["TRY", "TL", "TRL", ""].includes(String(c ?? "").trim().toUpperCase());
  return (await getCashAccounts(token)).filter(
    (a) => a.account_type === "pos" && isTry(a.currency) && a.is_active !== false && a.active !== false && a.archived !== true && a.is_deleted !== true
  );
}

// Satışın kasaya nasıl işlendiğinin metni (özet ekranı).
export function cashPostingText(s: PosSale): string {
  if (s.paymentType === "acik_hesap") {
    const who = s.customerName ? `${s.customerName} carisine` : "Cariye";
    if (s.ledgerStatus === "pending") return `Satış tamamlandı. ${who} borç kaydı birkaç dakika içinde kendiliğinden yazılacak; satışı yeniden göndermeyin.`;
    return `Satış kaydedildi: ${who} borç olarak yazıldı. Kasaya giriş olmadı.`;
  }
  if (s.cashStatus === "pending") return "Satış tamamlandı. Kasa kaydı birkaç dakika içinde kendiliğinden tamamlanacak; satışı yeniden göndermeyin.";
  if (s.cashStatus !== "posted") return "";
  const where = (m: string) => {
    const e = s.cashEntries.find((x) => x.method === m);
    return e?.accountName || (m === "kart" ? "POS (Kart)" : "Kasa");
  };
  const methods = s.cashEntries.length ? Array.from(new Set(s.cashEntries.map((e) => e.method))) : [s.paymentType === "kart" ? "kart" : "nakit"];
  if (methods.length > 1) return `Satış kaydedildi, kasaya işlendi: nakit ${where("nakit")}, kart ${where("kart")} hesabına.`;
  return `Satış kaydedildi, kasaya işlendi: ${methods[0] === "kart" ? "kart" : "nakit"} ${where(methods[0])} hesabına.`;
}
