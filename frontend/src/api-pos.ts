// D1 — Hızlı satış (POS). Web: pages/POSPage.js. Sunucu: backend/routers/pos.py (POST /pos/sales).
// Fiyatlar KDV dahildir; satır = birim × adet × (1 − satır indirimi %); genel indirim tutardır; KDV = satır × oran / (100 + KDV oranı).
// Sunucu ekranda gösterilen tutarı 0,01'den fazla sapan satışı reddeder (sessiz düzeltme yok).
// İşlem anahtarı: her satış denemesine bir anahtar; ağ hatası / 5xx sonrası AYNI anahtar ve AYNI sepetle tekrar.
// Aynı anahtar + farklı sepet → 409. 200 yanıtı = satış ve stok düşümü tamamlandı.
// Not: sunucu bugün POS satışını kasaya ya da cariye yazmıyor (Aşama 4); "Açık hesap" bu yüzden mobilde gizli.
import { request } from "./api";

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
  return { subtotal: r2(subtotal), discount: r2(discount), vat: r2(vat), total: r2(subtotal - discount), itemCount: lines.reduce((s, l) => s + l.quantity, 0) };
}

export type PaymentType = "nakit" | "kart";

export function posPayload(lines: CartLine[], discountAmount: number, payment: PaymentType, paid: number) {
  const t = cartTotals(lines, discountAmount);
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
    notes: "",
    session_number: 1,
  };
}

export type PosSale = { id: string; saleNumber: string; total: number; paymentType: string; itemCount: number };

export async function createPosSale(token: string, body: ReturnType<typeof posPayload>, idempotencyKey: string): Promise<PosSale> {
  const d = await request<any>("/pos/sales", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": idempotencyKey } }, token);
  return { id: String(d?.id || ""), saleNumber: String(d?.sale_number || ""), total: Number(d?.total) || 0, paymentType: String(d?.payment_type || ""), itemCount: Number(d?.item_count) || 0 };
}
