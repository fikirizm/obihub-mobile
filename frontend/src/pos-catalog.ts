// POS ürünleri ve satış retleri (saf modül; birim testi dev/test-pos-catalog.mjs). Faz A (21 Kas 2026): ürünler GET /catalog/items?for=sale
// ile gelir; `available` satılabilir (fiziksel − web sepet rezervi), `physical_quantity` mevcut, `reserved_quantity` rezerve.
// 409 POS_STOCK_RESERVED {product_ids, reserved_quantity} ve 409 POS_SALE_DELETED kesin rettir: hiçbir şey yazılmadı, sepet açık kalır.
// Web: lib/posCatalog.js, lib/posPayment.js posSaleErrorText.

export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  ean: string;
  price: number;
  vatRate: number;
  // Satılabilir adet (izlenmeyende 0, kullanılmaz).
  stock: number;
  physical: number;
  reserved: number;
  tracked: boolean;
  imageUrl: string;
};

export const POS_CATALOG_MAX = 50;

export function catalogPath(q: string, limit = 20) {
  const qs = new URLSearchParams();
  const term = String(q || "").trim();
  if (term) qs.set("q", term);
  qs.set("for", "sale");
  qs.set("limit", String(Math.min(Math.max(1, Math.trunc(limit) || 20), POS_CATALOG_MAX)));
  return `/catalog/items?${qs.toString()}`;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function posProductFromItem(it: any): PosProduct {
  const tracked = it?.kind !== "service" && it?.tracks_stock !== false;
  const gross = it?.unit_price_gross;
  const vat = Number(it?.vat_rate);
  const img = String(it?.image_url || "");
  return {
    id: String(it?.id || ""),
    name: String(it?.name || "Ürün"),
    sku: String(it?.sku || ""),
    barcode: String(it?.barcode || ""),
    ean: String(it?.ean || ""),
    price: gross === null || gross === undefined || gross === "" ? 0 : num(gross),
    vatRate: it?.vat_rate === null || it?.vat_rate === undefined || !Number.isFinite(vat) ? 18 : vat,
    stock: tracked ? num(it?.available) : 0,
    physical: tracked ? num(it?.physical_quantity ?? it?.available) : 0,
    reserved: tracked ? Math.max(0, num(it?.reserved_quantity)) : 0,
    tracked,
    imageUrl: /^https?:\/\//i.test(img) ? img : "",
  };
}

export function stockText(p: PosProduct) {
  if (!p.tracked) return "";
  if (p.reserved > 0) return `Mevcut ${p.physical} · Rezerve ${p.reserved} · Satılabilir ${p.stock}`;
  return `Stok ${p.stock}`;
}

export const soldOut = (p: PosProduct) => p.tracked && p.stock <= 0;

export function exactPosMatch(list: PosProduct[], text: string): PosProduct | null {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return null;
  return list.find((p) => [p.barcode, p.ean, p.sku].some((c) => c && c.toLowerCase() === q)) || null;
}

type Err = { status?: number; code?: string; message?: string; data?: any } | null | undefined;

export function reservedProductIds(e: Err): string[] {
  if (e?.code !== "POS_STOCK_RESERVED") return [];
  const ids = e?.data?.product_ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export function posSaleErrorText(e: Err, cart: { product: { id: string; name: string } }[]) {
  const base = typeof e?.message === "string" && e.message.trim() ? e.message.trim() : "Bilinmeyen hata";
  const ids = reservedProductIds(e);
  if (ids.length) {
    const names = ids.map((id) => (cart || []).find((l) => l.product.id === id)?.product.name).filter(Boolean);
    if (names.length) return `Satış kaydedilemedi: ${base} Rezerve ürün: ${names.join(", ")}. Ürünü sepetten çıkarın ya da adedini azaltın.`;
  }
  return `Satış kaydedilemedi: ${base}`;
}
