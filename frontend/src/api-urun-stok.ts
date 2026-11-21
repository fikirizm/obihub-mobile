// Ürün kimlik bilgileri (ad / SKU / barkod) ve stok hareket geçmişi uçları.
// Web karşılığı: frontend/src/pages/ProductDetailPage.js (handleSave, fetchStockMovements).
import { request } from "./api";

// GET /products/{id} yanıtından bu ekranların kullandığı alanlar.
export type ProductIdentity = {
  id: string;
  name: string;
  shortDescription?: string;
  description?: string;
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
  product_name?: string | null;
  created_at: string;
};

export const STOCK_MOVEMENTS_PAGE = 20;

export async function getProductIdentity(token: string, productId: string): Promise<ProductIdentity> {
  const p = await request<any>(`/products/${encodeURIComponent(productId)}`, {}, token);
  return {
    id: String(p?.id || productId), name: String(p?.name || ""), sku: p?.sku ?? "", barcode: p?.barcode ?? "",
    shortDescription: String(p?.short_description ?? ""), description: String(p?.description ?? ""),
  };
}

// Sunucu PATCH gövdesinde yalnızca beyaz listedeki alanları yazar; burada yalnızca kimlik alanları gönderilir
// (fiyat ve stok bu uçtan değiştirilmez).
export async function updateProductIdentity(
  token: string,
  productId: string,
  data: { name?: string; sku?: string; barcode?: string; short_description?: string; description?: string }
): Promise<ProductIdentity> {
  // Yalnızca verilen (değişen) alanlar gönderilir; dokunulmayan alanın eski kopyası sunucudaki değerin üstüne yazılmaz.
  const body: Record<string, string> = {};
  if (typeof data.name === "string") body.name = data.name;
  if (typeof data.sku === "string") body.sku = data.sku;
  if (typeof data.barcode === "string") body.barcode = data.barcode;
  // Faz A M10: kısa ve (düz metinse) detaylı açıklama.
  if (typeof data.short_description === "string") body.short_description = data.short_description;
  if (typeof data.description === "string") body.description = data.description;
  const p = await request<any>(`/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify(body) }, token);
  return {
    id: String(p?.id || productId), name: String(p?.name ?? data.name ?? ""), sku: p?.sku ?? data.sku ?? "", barcode: p?.barcode ?? data.barcode ?? "",
    shortDescription: String(p?.short_description ?? data.short_description ?? ""), description: String(p?.description ?? data.description ?? ""),
  };
}

// Yeni → eski sıralı sayfa. Devamı olup olmadığını anlamak için bir satır fazla istenir
// (sunucunun X-Has-More başlığı ortak request() üzerinden okunamıyor).
export async function getStockMovements(
  token: string,
  productId: string,
  skip = 0,
  limit = STOCK_MOVEMENTS_PAGE
): Promise<{ items: StockMovement[]; hasMore: boolean }> {
  // productId boşsa firmanın tüm hareketleri (web Stok sayfası).
  const qs = `${productId ? `product_id=${encodeURIComponent(productId)}&` : ""}limit=${limit + 1}&skip=${skip}`;
  const rows = await request<any>(`/stock/movements?${qs}`, {}, token);
  const list: StockMovement[] = (Array.isArray(rows) ? rows : []).map((m: any, i: number) => ({
    id: String(m?.id || `${skip + i}`),
    product_id: String(m?.product_id || productId),
    movement_type: String(m?.movement_type || "adjustment"),
    quantity: Number(m?.quantity) || 0,
    reason: String(m?.reason || ""),
    reference_id: m?.reference_id ?? null,
    // Sunucu her satıra ürün adını ekler (silinmiş üründe null).
    product_name: typeof m?.product_name === "string" && m.product_name ? m.product_name : null,
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
  // Faz A M4: satış (indirimli) fiyatı ve normal fiyat (regular_price > price → indirim).
  price: number;
  regularPrice: number;
  // Görseller (adresler) ve birincil görsel; kanal satış durumu (sağlayıcı → active | inactive).
  images: string[];
  imageUrl: string;
  // Aşama 4 sonrası sunucu: ObiHub'a yüklenmiş görsellerin kimlikleri (silmede R2'den de kaldırılır).
  uploadedImages: { id: string; url: string }[];
  salesStatus: Record<string, string>;
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
    price: Number(p?.price) || 0,
    regularPrice: Number(p?.regular_price) || 0,
    images: (Array.isArray(p?.images) ? p.images : []).map((x: any) => (typeof x === "string" ? x : String(x?.url || x?.src || ""))).filter((u: string) => /^https?:\/\//i.test(u)),
    imageUrl: String(p?.image_url || ""),
    uploadedImages: (Array.isArray(p?.uploaded_images) ? p.uploaded_images : [])
      .map((x: any) => ({ id: String(x?.id || ""), url: String(x?.url || "") }))
      .filter((x: { id: string; url: string }) => x.id && x.url),
    salesStatus: obj(p?.channel_sales_status) as Record<string, string>,
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
  // Sunucu sayfalaması (c0652d26f): has_more esas; yoksa (eski sunucu) toplamdan ya da dolu sayfadan tahmin.
  const total = Number(r?.total);
  const hasMore =
    typeof r?.has_more === "boolean" ? r.has_more : Number.isFinite(total) && total > page * perPage ? true : rows.length >= perPage;
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
  // Dalga 5a: Idefix eşleştirmesinde de seçilen ürünün barkodu gönderilir (web lib/linkChannel.buildLinkChannelBody ile aynı).
  const bc = String(input.barcode || "").trim();
  if (bc && ["trendyol", "idefix"].includes(input.provider.toLowerCase())) body.barcode = bc;
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


// ---- Dalga 2 / B2: stok özeti (web StockPage: GET /stock/summary → totals) ----
export type StockTotals = { products: number; sellable: number; reserved: number; onHand: number };

export async function getStockSummary(token: string): Promise<StockTotals | null> {
  const r = await request<any>("/stock/summary", {}, token);
  const t = r?.totals;
  if (!t || typeof t !== "object") return null;
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { products: n(t.products), sellable: n(t.sellable), reserved: n(t.reserved), onHand: n(t.on_hand) };
}


// ---- B3: yeni ürün, görseller, satışa aç/kapa (web: ProductsPage.js, ProductDetailPage.js; sunucu c0652d26f) ----

// POST /products (web "Boş ürün"): ilk stok `opening` hareketi olarak yazılır.
export async function createProduct(
  token: string,
  input: { name: string; sku: string; barcode: string; price: number; stock: number }
): Promise<{ id: string }> {
  const p = await request<any>(
    "/products",
    {
      method: "POST",
      body: JSON.stringify({ name: input.name.trim(), sku: input.sku.trim(), barcode: input.barcode.trim(), description: "", price: input.price, stock: input.stock, category: "", image_url: null }),
    },
    token
  );
  return { id: String(p?.id || "") };
}

export type UploadFile = { uri: string; name: string; type: string };

// POST /products/{id}/images (multipart, alan `files`): jpeg/png/webp, dosya ≤10 MB, istekte ≤10 dosya.
// 201 → {images:[{id,url,...}], image_url}. Hatalar: 400, 404, 413 (büyük), 415 (tür), 503 (depolama yok).
export async function uploadProductImages(token: string, productId: string, files: UploadFile[]) {
  const form = new FormData();
  for (const f of files) form.append("files", { uri: f.uri, name: f.name, type: f.type } as any);
  const d = await request<any>(`/products/${encodeURIComponent(productId)}/images`, { method: "POST", body: form }, token);
  return {
    images: (Array.isArray(d?.images) ? d.images : []).map((x: any) => ({ id: String(x?.id || ""), url: String(x?.url || "") })),
    imageUrl: String(d?.image_url || ""),
  };
}

// Yalnız ObiHub'a yüklenmiş görsel (yükleme yanıtındaki id) R2'den silinir.
export async function deleteProductImage(token: string, productId: string, imageId: string) {
  return request<{ deleted?: boolean; image_url?: string | null }>(
    `/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
    token
  );
}

// Görsel listesi / birincil görsel (web: PATCH /products/{id} {image_url, images}).
export async function patchProductImages(token: string, productId: string, images: string[], imageUrl: string | null) {
  return request<any>(`/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify({ images, image_url: imageUrl }) }, token);
}

// POST /products/{id}/bulk-sales-status {action: open|close}: eşleşik tüm sağlayıcılarda satış durumu.
export async function setProductSalesStatus(token: string, productId: string, action: "open" | "close") {
  return request<{ success?: boolean; affected_count?: number; providers?: string[]; status?: string }>(
    `/products/${encodeURIComponent(productId)}/bulk-sales-status`,
    { method: "POST", body: JSON.stringify({ action }) },
    token
  );
}

// ---- B5: ürün satış içgörüleri (web ProductDetailPage "sales-reports"; GET /products/{id}/insights?range=week|month|year) ----
export type ProductInsights = {
  revenue: number;
  quantity: number;
  orders: number;
  byProvider: { provider: string; label: string; revenue: number; quantity: number; orders: number }[];
};

export async function getProductInsights(token: string, productId: string, range: "week" | "month" | "year"): Promise<ProductInsights> {
  const d = await request<any>(`/products/${encodeURIComponent(productId)}/insights?range=${range}`, {}, token);
  const s = d?.sales || {};
  return {
    revenue: Number(s.total_revenue) || 0,
    quantity: Number(s.total_quantity) || 0,
    orders: Number(s.total_orders) || 0,
    byProvider: (Array.isArray(s.by_provider) ? s.by_provider : [])
      .map((x: any) => ({
        provider: String(x?.provider || ""),
        label: String(x?.integration_name || x?.provider_label || x?.provider || ""),
        revenue: Number(x?.revenue) || 0,
        quantity: Number(x?.quantity) || 0,
        orders: Number(x?.orders) || 0,
      }))
      .filter((x: any) => x.orders > 0 || x.quantity > 0)
      .sort((a: any, b: any) => b.revenue - a.revenue),
  };
}

// Faz A M4: fiyat ve normal fiyat birlikte (PATCH /products/{id}; web ProductDetailPage handleSave ile aynı alanlar).
export async function updateProductPricing(token: string, productId: string, body: { price?: number; regular_price?: number }) {
  return request<any>(`/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify(body) }, token);
}
