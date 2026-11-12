// Ürün kimlik bilgileri (ad / SKU / barkod) ve stok hareket geçmişi uçları.
// Web karşılığı: frontend/src/pages/ProductDetailPage.js (handleSave, fetchStockMovements).
import { request } from "./api";

// GET /products/{id} yanıtından bu ekranların kullandığı alanlar.
export type ProductIdentity = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
};

export type StockMovementType = "in" | "out" | "adjustment" | "sale" | "opening" | "accounting_sync";

// GET /stock/movements satırı. "adjustment" türünde quantity yeni stok değeridir; diğerlerinde değişim miktarıdır
// ("sale" türünde, POS satışında, eksi işaretli gelir). "accounting_sync" miktarı işaretsizdir; yön `delta`dadır
// (sunucu yanıtında henüz yok; gelirse kullanılır).
export type StockMovement = {
  id: string;
  product_id: string;
  movement_type: StockMovementType | string;
  quantity: number;
  reason: string;
  reference_id?: string | null;
  delta?: number | null;
  created_at: string;
};

export const STOCK_MOVEMENTS_PAGE = 20;

export async function getProductIdentity(token: string, productId: string): Promise<ProductIdentity> {
  const p = await request<any>(`/products/${encodeURIComponent(productId)}`, {}, token);
  return { id: String(p?.id || productId), name: String(p?.name || ""), sku: p?.sku ?? "", barcode: p?.barcode ?? "" };
}

// Sunucu PATCH gövdesinde yalnızca beyaz listedeki alanları yazar; burada yalnızca kimlik alanları gönderilir
// (fiyat ve stok bu uçtan değiştirilmez).
export async function updateProductIdentity(
  token: string,
  productId: string,
  data: { name?: string; sku?: string; barcode?: string }
): Promise<ProductIdentity> {
  // Yalnızca verilen (değişen) alanlar gönderilir; dokunulmayan alanın eski kopyası sunucudaki değerin üstüne yazılmaz.
  const body: Record<string, string> = {};
  if (typeof data.name === "string") body.name = data.name;
  if (typeof data.sku === "string") body.sku = data.sku;
  if (typeof data.barcode === "string") body.barcode = data.barcode;
  const p = await request<any>(`/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify(body) }, token);
  return { id: String(p?.id || productId), name: String(p?.name ?? data.name ?? ""), sku: p?.sku ?? data.sku ?? "", barcode: p?.barcode ?? data.barcode ?? "" };
}

// Yeni → eski sıralı sayfa. Devamı olup olmadığını anlamak için bir satır fazla istenir
// (sunucunun X-Has-More başlığı ortak request() üzerinden okunamıyor).
export async function getStockMovements(
  token: string,
  productId: string,
  skip = 0,
  limit = STOCK_MOVEMENTS_PAGE
): Promise<{ items: StockMovement[]; hasMore: boolean }> {
  const qs = `product_id=${encodeURIComponent(productId)}&limit=${limit + 1}&skip=${skip}`;
  const rows = await request<any>(`/stock/movements?${qs}`, {}, token);
  const list: StockMovement[] = (Array.isArray(rows) ? rows : []).map((m: any, i: number) => ({
    id: String(m?.id || `${skip + i}`),
    product_id: String(m?.product_id || productId),
    movement_type: String(m?.movement_type || "adjustment"),
    quantity: Number(m?.quantity) || 0,
    reason: String(m?.reason || ""),
    reference_id: m?.reference_id ?? null,
    delta: typeof m?.delta === "number" ? m.delta : null,
    created_at: String(m?.created_at || ""),
  }));
  return { items: list.slice(0, limit), hasMore: list.length > limit };
}
