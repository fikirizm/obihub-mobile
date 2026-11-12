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

export type StockMovementType = "in" | "out" | "adjustment" | "sale" | "opening" | "accounting_sync" | "reconcile";

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

// Kanal gönderim sonucu (GET /products/{id} → channel_push). Anahtar entegrasyon kimliği, yoksa sağlayıcı adı.
// state: ok / failed / pending (Trendyol sonucu bekleniyor) / unknown (24 saatte sonuç alınamadı, değer kaydedilmedi).
export type ChannelPush = {
  provider?: string;
  ok?: boolean | null;
  state?: string;
  at?: string;
  code?: string | null;
  detail?: string | null;
};

export async function getProductChannelPush(token: string, productId: string): Promise<Record<string, ChannelPush>> {
  const p = await request<any>(`/products/${encodeURIComponent(productId)}`, {}, token);
  const raw = p?.channel_push;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, ChannelPush>) : {};
}

export type PushBadge = { label: string; tone: "good" | "bad" | "wait" };

// Rozet metni. Bilinmeyen kod genel hata olarak gösterilir.
export function channelPushBadge(push: ChannelPush | undefined): PushBadge | null {
  if (!push) return null;
  const state = String(push.state || (push.ok === true ? "ok" : push.ok === false ? "failed" : "pending")).toLowerCase();
  if (state === "ok") return { label: "Pazaryeri kabul etti", tone: "good" };
  if (state === "pending") return { label: "Pazaryeri onayı bekleniyor", tone: "wait" };
  const code = String(push.code || "").toUpperCase();
  const detail = String(push.detail || "").trim();
  if (state === "unknown" || code === "CHANNEL_RESULT_UNKNOWN") return { label: "Sonuç alınamadı; değer kaydedilmedi", tone: "bad" };
  switch (code) {
    case "CHANNEL_BARCODE_UNKNOWN":
      return { label: "Reddedildi: barkod yok, yeniden eşleştirin", tone: "bad" };
    case "CHANNEL_REJECTED":
      return { label: detail ? `Reddedildi: ${detail}` : "Pazaryeri reddetti", tone: "bad" };
    case "CHANNEL_STORE_DELETED":
      return { label: "Mağaza silinmiş; yeniden eşleştirin", tone: "bad" };
    case "CHANNEL_CATALOG_UNAVAILABLE":
      return { label: "Pazaryeri listesi alınamadı; yeniden denenecek", tone: "wait" };
    case "CHANNEL_RATE_LIMITED":
      return { label: "Pazaryeri yoğun; yeniden denenecek", tone: "wait" };
    default:
      return { label: detail ? `Gönderilemedi: ${detail}` : "Gönderilemedi", tone: "bad" };
  }
}
