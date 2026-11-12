// Sipariş, etiket ve mağaza senkronu için web paneliyle aynı davranan API çağrıları.
// Ortak `request` (src/api.ts) kullanılır; ikili PDF indirme burada yapılır.
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE_URL, request } from "./api";
import type { Integration, Order } from "./types";

// Liste ucunun verdiği, ancak detay ucunun (response_model=Order) attığı alanlar.
export type OrderFull = Order & {
  idefix_cargo_tracking?: string;
  idefix_status?: string;
  pazarama_cargo_tracking?: string;
  pazarama_order_number?: string;
  n11_status?: string;
  hb_order_number?: string;
};

export type ChannelKey = "trendyol" | "hepsiburada" | "n11" | "idefix" | "pazarama" | "amazon" | "woocommerce" | "other";

// Web'deki kanal anahtarı (sağlayıcı adı küçük harfle) ile aynı sınıflandırma.
export function channelKeyOf(raw: unknown): ChannelKey {
  const v = String(raw || "").trim().toLowerCase();
  if (v.includes("trendyol")) return "trendyol";
  if (v.includes("hepsiburada")) return "hepsiburada";
  if (v.includes("n11")) return "n11";
  if (v.includes("idefix")) return "idefix";
  if (v.includes("pazarama")) return "pazarama";
  if (v.includes("amazon")) return "amazon";
  if (v.includes("woo")) return "woocommerce";
  return "other";
}

// Pazaryerinin kendi kargosu/etiketi olan kanallar (web CargoLabelSidebar ile aynı küme).
export const MARKETPLACE_LABEL_CHANNELS: ChannelKey[] = ["trendyol", "hepsiburada", "n11", "idefix", "pazarama"];

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

// Web looksLikePdfBase64 ile aynı denetim: "%PDF" ile başlayan veri ("JVBERi" base64 karşılığıdır).
export function looksLikePdfBase64(data: unknown): boolean {
  if (typeof data !== "string") return false;
  let payload = data.trim();
  if (payload.startsWith("data:")) payload = payload.split(",")[1] || "";
  return payload.replace(/\s+/g, "").startsWith("JVBERi");
}

async function fileLooksLikePdf(path: string): Promise<boolean> {
  try {
    const head = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 8 });
    return looksLikePdfBase64(head);
  } catch {
    return false;
  }
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "belge";
}

// Sunucunun ikili (application/pdf) döndürdüğü bir ucu cihaza indirir; dosya yolunu döndürür.
// Hata yanıtındaki `detail` iletisi kullanıcıya gösterilecek hata olarak fırlatılır.
export async function downloadApiPdf(token: string, apiPath: string, name: string): Promise<string> {
  const path = `${FileSystem.cacheDirectory}${safeName(name)}.pdf`;
  let res: FileSystem.FileSystemDownloadResult;
  try {
    res = await FileSystem.downloadAsync(`${API_BASE_URL}${apiPath}`, path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw { message: "Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin.", status: 0 };
  }
  if (res.status < 200 || res.status >= 300) {
    let message = "";
    try {
      const text = await FileSystem.readAsStringAsync(path);
      const data = JSON.parse(text);
      message = typeof data?.detail === "string" ? data.detail : typeof data?.message === "string" ? data.message : "";
    } catch {}
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw { message: message || `Etiket alınamadı (${res.status}).`, status: res.status };
  }
  if (!(await fileLooksLikePdf(path))) {
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw { message: "Sunucu PDF yerine farklı bir yanıt döndürdü.", status: res.status };
  }
  return path;
}

// Base64 PDF'i cihaza yazar. PDF değilse anlamlı bir hata fırlatır (web looksLikePdfBase64).
export async function writePdfBase64(base64: string, name: string): Promise<string> {
  let payload = String(base64 || "").trim();
  if (payload.startsWith("data:")) payload = payload.split(",")[1] || "";
  if (!looksLikePdfBase64(payload)) throw { message: "Gelen etiket PDF değil.", status: 0 };
  const path = `${FileSystem.cacheDirectory}${safeName(name)}.pdf`;
  await FileSystem.writeAsStringAsync(path, payload, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

// Pazaryeri siparişleri için ObiHub'ın ürettiği etiket. Idefix'te "shared" ortak HepsiJet barkodlu etikettir.
export function orderProductLabelPdf(token: string, orderId: string, variant: "product" | "shared" = "product") {
  const qs = variant === "shared" ? "?variant=shared" : "";
  return downloadApiPdf(token, `/orders/${encodeURIComponent(orderId)}/product-label/pdf${qs}`, `etiket-${orderId}-${variant}`);
}

export async function getHepsiburadaMarketplaceLabel(token: string, orderId: string, packageNumber?: string) {
  const qs = packageNumber ? `?package_number=${encodeURIComponent(packageNumber)}` : "";
  return request<{ success?: boolean; data?: string; data_base64?: string; url?: string; file_url?: string; zpl?: string; message?: string }>(
    `/hepsiburada/orders/${encodeURIComponent(orderId)}/label${qs}`,
    { method: "GET" },
    token
  );
}

// ---------------------------------------------------------------------------
// Sipariş durumu
// ---------------------------------------------------------------------------

// Web IntegrationOrdersPage STATUS_OPTIONS ile aynı sıra ve adlar.
export const ORDER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "Bekleyen" },
  { value: "processing", label: "Gönderime Hazır" },
  { value: "shipped", label: "Kargoda" },
  { value: "delivered", label: "Tamamlandı" },
  { value: "cancelled", label: "İptal" },
  { value: "deleted", label: "Silinmiş" },
];

// Sunucuda bu durumlara geçişte ObiHub'ın düştüğü stok geri eklenir (stock_ledger_helpers.ORDER_STOCK_RESTORE_STATUSES).
export const STOCK_RESTORE_STATUSES = ["cancelled", "deleted", "returned", "refunded"];

// PATCH /orders/{id} yalnız { status }. Hatalar: 409 → durum kaydedildi ama stok iadesi yapılamadı;
// 502 → WooCommerce'e iletilemedi, durum kaydedilmedi.
export async function updateOrderStatus(token: string, orderId: string, status: string) {
  return request<Order>(
    `/orders/${encodeURIComponent(orderId)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    token
  );
}

// ---------------------------------------------------------------------------
// Bulut (uzaktan) yazdırma
// ---------------------------------------------------------------------------

// Sunucu kapalı otomatik yazdırmada HTTP 200 + success:false döner; çağıran `success` alanına bakar.
export async function enqueueCloudPrint(token: string, orderId: string, barcode?: string) {
  const qs = barcode ? `?barcode=${encodeURIComponent(barcode)}` : "";
  return request<{ success?: boolean; message?: string; job_id?: string; status?: string }>(
    `/print-jobs/enqueue/${encodeURIComponent(orderId)}${qs}`,
    { method: "POST" },
    token
  );
}

// ---------------------------------------------------------------------------
// Mağaza senkronu (web IntegrationOrdersPage.runSync ile aynı uçlar ve sıra)
// ---------------------------------------------------------------------------

export type StoreSyncResult = {
  success?: boolean;
  message?: string;
  count?: number;
  total_fetched?: number;
  updated_count?: number;
  created?: number;
  updated?: number;
};

// Web'in "Senkronize et" düğmesindeki gün sayısı: Trendyol 30, diğerleri 15.
export function storeSyncDays(provider: unknown) {
  return channelKeyOf(provider) === "trendyol" ? 30 : 15;
}

export async function syncStoreOrders(token: string, integration: Pick<Integration, "id" | "provider" | "name">) {
  const id = encodeURIComponent(integration.id);
  const key = channelKeyOf(integration.provider || integration.name);
  const days = storeSyncDays(key);
  const qs = new URLSearchParams();
  qs.set("days", String(days));
  if (key === "trendyol") qs.set("all_statuses", "true");
  const base =
    key === "trendyol" ? `/trendyol/${id}/sync-orders`
    : key === "hepsiburada" ? `/hepsiburada/${id}/sync-orders`
    : key === "n11" ? `/n11/${id}/sync-orders`
    : key === "pazarama" ? `/pazarama/${id}/sync-orders`
    : key === "idefix" ? `/idefix/${id}/sync-orders`
    : key === "amazon" ? `/amazon/${id}/sync-orders`
    : `/woocommerce/${id}/sync-orders`;
  const body = key === "amazon" ? JSON.stringify({ days_back: days }) : undefined;
  const result = await request<StoreSyncResult>(`${base}?${qs.toString()}`, { method: "POST", body }, token);
  if (!result?.success) {
    throw { message: result?.message || "Senkronizasyon başarısız oldu.", status: 200 };
  }
  // Web: WooCommerce senkronundan sonra sipariş tarihleri yeniden çekilir; hatası senkronu bozmaz.
  if (key === "woocommerce") {
    try {
      await request(`/orders/resync-dates?integration_id=${id}`, { method: "POST" }, token);
    } catch {}
  }
  return { ...result, channel: key };
}

// Web'deki başarı iletisiyle aynı özet.
export function storeSyncMessage(r: StoreSyncResult & { channel: ChannelKey }) {
  const base = r.message || "Senkronizasyon tamamlandı";
  if (r.channel === "trendyol") return `${base} (Toplam: ${Number(r.total_fetched || 0)}, Yeni: ${Number(r.count || 0)})`;
  if (r.channel === "hepsiburada")
    return `${base} (Toplam: ${Number(r.total_fetched || 0)}, Yeni: ${Number(r.count || 0)}, Güncellenen: ${Number(r.updated_count || 0)})`;
  if (r.channel === "amazon") return `Amazon siparişler güncellendi: ${Number(r.created || 0)} yeni, ${Number(r.updated || 0)} güncellendi.`;
  return base;
}

// ---------------------------------------------------------------------------
// Liste satırı önbelleği: detay ucu (response_model=Order) bazı alanları attığı için
// listeden gelen ham satır saklanır ve detayla birleştirilir.
// ---------------------------------------------------------------------------

const rowCache = new Map<string, OrderFull>();

export function rememberOrderRow(order: Order) {
  if (!order?.id) return;
  rowCache.set(order.id, order as OrderFull);
  if (rowCache.size > 300) {
    const first = rowCache.keys().next().value;
    if (first) rowCache.delete(first);
  }
}

export function rememberedOrderRow(orderId: string): OrderFull | undefined {
  return rowCache.get(orderId);
}

// Detaydaki dolu alanlar esastır; detayda olmayan ya da boş gelen alanlar liste satırından alınır.
export function mergeOrderDetail(detail: Order, row?: Order | null): OrderFull {
  if (!row) return detail as OrderFull;
  const out: Record<string, any> = { ...row };
  for (const [k, v] of Object.entries(detail)) {
    if (v !== null && v !== undefined && !(typeof v === "string" && v === "")) out[k] = v;
    else if (!(k in out)) out[k] = v;
  }
  return out as OrderFull;
}

// Satır önbellekte yoksa (ör. bildirimden açılış) liste ucunda sipariş numarasıyla aranır.
export async function findOrderRow(token: string, detail: Order, fresh = false): Promise<OrderFull | null> {
  const cached = rowCache.get(detail.id);
  if (cached && !fresh) return cached;
  const no = String(detail.channel_order_id || "").trim();
  if (!no) return cached || null;
  try {
    const qs = new URLSearchParams();
    qs.set("search", no.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    qs.set("per_page", "20");
    if (detail.integration_id) qs.set("integration_id", detail.integration_id);
    const payload = await request<any>(`/orders?${qs.toString()}`, { method: "GET" }, token);
    const items: OrderFull[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const hit = items.find((o) => o.id === detail.id) || null;
    if (hit) rememberOrderRow(hit);
    return hit || cached || null;
  } catch {
    return cached || null;
  }
}

// Detay: GET /orders/{id} ve liste satırıyla birleştirme. `fresh` ise satır da sunucudan yeniden alınır.
export async function getOrderDetailFull(token: string, orderId: string, fresh = false): Promise<OrderFull> {
  const detail = await request<Order>(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, token);
  const row = await findOrderRow(token, detail, fresh);
  return mergeOrderDetail(detail, row);
}
