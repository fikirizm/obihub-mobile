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

export type StockMovementType = "in" | "out" | "adjustment" | "sale" | "opening" | "accounting_sync" | "reconcile" | "purchase_in" | "purchase_reverse";

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

// Aşama 3 / P5 — Muhasebe farkları. ObiHub stok sahibiyken programdaki stok farklıysa stok turu yazmaz, buraya düşürür.
// Web karşılığı: frontend/src/components/stock/AccountingDifferences.jsx.
export type ReconItem = {
  id: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  program?: string;
  remote_qty: number;
  pending_out: number;
  expected: number;
  observed_stock: number;
  diff: number;
};
export type ReconLastRun = { aborted_reason?: string | null; program?: string; would_zero?: number; stocked?: number; matched_stocked?: number } | null;
export type Reconciliation = { items: ReconItem[]; openCount: number; ownerProgram?: string | null; lastRun: ReconLastRun };

export async function getReconciliation(token: string): Promise<Reconciliation | null> {
  const r = await request<any>("/stock/reconciliation", {}, token);
  if (!r || !Array.isArray(r.items)) return null;
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const items: ReconItem[] = r.items.map((x: any) => ({
    id: String(x.id),
    product_id: String(x.product_id || ""),
    product_name: x.product_name || undefined,
    sku: x.sku || undefined,
    program: x.program || undefined,
    remote_qty: n(x.remote_qty),
    pending_out: n(x.pending_out),
    expected: n(x.expected),
    observed_stock: n(x.observed_stock),
    diff: n(x.diff),
  }));
  return { items, openCount: r.open_count == null ? items.length : n(r.open_count), ownerProgram: r.owner?.program ?? null, lastRun: r.last_run ?? null };
}

// 409: detail = {code: ITEM_OUTDATED | PRODUCT_NOT_SYNCED, message, item_ids}; mesaj ortak request()'ten gelir.
export async function applyReconciliation(token: string, itemIds: string[]) {
  return request<{ applied?: number; stale?: number; failed?: number; not_found?: number }>(
    "/stock/reconciliation/apply",
    { method: "POST", body: JSON.stringify({ item_ids: itemIds }) },
    token
  );
}

export async function dismissReconciliation(token: string, itemIds: string[]) {
  return request<{ dismissed?: number; not_found?: number }>(
    "/stock/reconciliation/dismiss",
    { method: "POST", body: JSON.stringify({ item_ids: itemIds }) },
    token
  );
}

// ---- Dalga 2 / B1: ürün eşleştirme (web: ProductDetailPage.js fetchSourceMatchProducts, handleSourceMatchSave,
// handleSourceMatchUnlink, fetchParasutProducts, handleParasutSaveMatch, handleParasutUnlink) ----

export type ProductLinks = {
  name: string;
  barcode: string;
  sku: string;
  // channel_links.<sağlayıcı> = mağazadaki ürün kimliği; channel_details.<sağlayıcı>.integration_id = bağlı mağaza.
  channelLinks: Record<string, string>;
  channelDetails: Record<string, { integration_id?: string; barcode?: string; source_product_id?: string }>;
  parasutProductId: string;
  parasutProductName: string;
  push: Record<string, ChannelPush>;
};

export async function getProductLinks(token: string, productId: string): Promise<ProductLinks> {
  const p = await request<any>(`/products/${encodeURIComponent(productId)}`, {}, token);
  const obj = (v: any) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const links: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(p?.channel_links))) if (v != null && String(v).trim()) links[k.toLowerCase()] = String(v);
  return {
    name: String(p?.name || ""),
    barcode: String(p?.barcode || ""),
    sku: String(p?.sku || ""),
    channelLinks: links,
    channelDetails: obj(p?.channel_details),
    parasutProductId: String(p?.parasut_product_id || links.parasut || ""),
    parasutProductName: String(p?.parasut_product_name || ""),
    push: obj(p?.channel_push),
  };
}

// Bu mağaza için eşleşme: sağlayıcı bağlantısı var ve (kayıtlı mağaza yoksa ya da) kayıtlı mağaza bu mağaza.
export function channelLinkFor(links: ProductLinks | null, ch: { id: string; platform: string }) {
  if (!links) return null;
  const provider = ch.platform.toLowerCase();
  const ext = links.channelLinks[provider];
  if (!ext) return null;
  const detail = links.channelDetails[provider] || {};
  const store = String(detail.integration_id || "");
  if (store && store !== ch.id) return { externalId: ext, otherStore: store, barcode: String(detail.barcode || "") };
  return { externalId: ext, otherStore: "", barcode: String(detail.barcode || "") };
}

export type SourceProduct = { externalId: string; name: string; sku: string; barcode: string };

// GET /integrations/{id}/source-products?search&page&per_page (per_page en çok 100). Sunucu tarafı arama ve
// sayfalama PM sırasında; `hasMore` toplamdan ya da dolu sayfadan tahmin edilir.
export async function getSourceProducts(token: string, integrationId: string, search: string, page = 1, perPage = 50) {
  const qs = new URLSearchParams({ search: search.trim(), page: String(page), per_page: String(perPage) });
  const r = await request<any>(`/integrations/${encodeURIComponent(integrationId)}/source-products?${qs.toString()}`, {}, token);
  const rows: any[] = Array.isArray(r?.items) ? r.items : [];
  const items: SourceProduct[] = rows
    .map((x) => ({
      externalId: String(x?.external_id ?? x?.id ?? ""),
      name: String(x?.name || x?.title || ""),
      sku: String(x?.sku || ""),
      barcode: String(x?.barcode || ""),
    }))
    .filter((x) => x.externalId);
  const total = Number(r?.total);
  const hasMore = Number.isFinite(total) && total > page * perPage ? true : rows.length >= perPage;
  return { items, hasMore };
}

export async function linkProductChannel(
  token: string,
  productId: string,
  input: { provider: string; externalId: string; integrationId: string; barcode?: string }
) {
  const body: Record<string, string> = {
    provider: input.provider.toLowerCase(),
    external_id: input.externalId,
    source_product_id: input.externalId,
    // Mobil web'den bir adım ileride: bağlantının mağazası ve (Trendyol) gönderim barkodu da kaydedilir.
    integration_id: input.integrationId,
  };
  if (input.barcode && input.provider.toLowerCase() === "trendyol") body.barcode = input.barcode;
  return request<{ success?: boolean; message?: string }>(
    `/products/${encodeURIComponent(productId)}/link-channel`,
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export async function unlinkProductChannel(token: string, productId: string, provider: string) {
  return request<{ success?: boolean; message?: string }>(
    `/products/${encodeURIComponent(productId)}/unlink-channel`,
    { method: "POST", body: JSON.stringify({ provider: provider.toLowerCase() }) },
    token
  );
}

export async function getParasutProductsForMatch(token: string, search: string) {
  const qs = new URLSearchParams({ search: search.trim(), page: "1", per_page: "25" });
  const r = await request<any>(`/parasut/products?${qs.toString()}`, {}, token);
  const rows: any[] = Array.isArray(r?.items) ? r.items : [];
  return rows
    .map((x) => {
      const a = x?.attributes || {};
      return {
        externalId: String(x?.id ?? ""),
        name: String(x?.name || a.name || ""),
        sku: String(x?.code || a.code || x?.sku || ""),
        barcode: String(x?.barcode || a.barcode || ""),
      } as SourceProduct;
    })
    .filter((x) => x.externalId);
}

export async function linkProductParasut(token: string, productId: string, parasutId: string, name: string) {
  const qs = new URLSearchParams({ parasut_product_id: parasutId, parasut_product_name: name });
  return request<{ success?: boolean; message?: string }>(
    `/products/${encodeURIComponent(productId)}/link-parasut?${qs.toString()}`,
    { method: "POST" },
    token
  );
}

export async function unlinkProductParasut(token: string, productId: string) {
  return request<{ success?: boolean; message?: string }>(`/products/${encodeURIComponent(productId)}/unlink-parasut`, { method: "POST" }, token);
}
