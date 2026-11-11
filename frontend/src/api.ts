// Premium ObiHub API client targeting api.obihub.app/api by default.
// Override via EXPO_PUBLIC_OBIHUB_API_URL env if needed.

import type {
  CatalogProduct,
  ChannelRef,
  DashboardStats,
  HepsiJetManualCustomer,
  HepsiJetManualShipment,
  Integration,
  Invoice,
  LoginResponse,
  Order,
  OrdersPage,
  ReportsOverview,
  SalesChartPoint,
  SmartAlert,
  SyncJob,
  User,
} from "./types";

export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_OBIHUB_API_URL && String(process.env.EXPO_PUBLIC_OBIHUB_API_URL)) ||
  "https://api.obihub.app/api";

type ApiError = { message: string; status: number; code?: "SUBSCRIPTION_LOCKED" };

// Backend bu önekle başlayan 403 yanıtını abonelik kilidi için döndürür.
const SUBSCRIPTION_LOCK_PREFIX = "Abonelik erişimi pasif.";

type SessionHandlers = {
  onUnauthorized?: () => void;
  onSubscriptionLocked?: (message: string) => void;
};

let sessionHandlers: SessionHandlers = {};

// AuthProvider, oturumu sona eren veya aboneliği kilitlenen çağrıları tek yerden yakalamak için kaydolur.
export function setSessionHandlers(handlers: SessionHandlers) {
  sessionHandlers = handlers;
}

const STATUS_MESSAGES: Record<number, string> = {
  401: "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.",
  403: "Bu işlem için yetkiniz bulunmuyor.",
  404: "İstenen kayıt bulunamadı.",
  429: "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
  500: "Sunucuda bir hata oluştu. Lütfen tekrar deneyin.",
  502: "Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.",
  503: "Hizmet geçici olarak kullanılamıyor. Lütfen tekrar deneyin.",
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw { message: "Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin.", status: 0 } as ApiError;
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // JSON olmayan yanıt (ör. ağ geçidi hata sayfası)
      data = null;
    }
  }
  if (!res.ok) {
    const detail = data?.detail;
    const serverMessage = typeof detail === "string" ? detail : typeof data?.message === "string" ? data.message : "";
    const friendlyMessage = STATUS_MESSAGES[res.status];
    const err: ApiError = {
      message: serverMessage || friendlyMessage || `Sunucu hatası (${res.status})`,
      status: res.status,
    };
    // Yalnızca oturumlu çağrılar: giriş ekranındaki hatalı şifre 401'i oturumu etkilemez.
    if (token) {
      if (res.status === 401) {
        sessionHandlers.onUnauthorized?.();
      } else if (res.status === 403 && serverMessage.startsWith(SUBSCRIPTION_LOCK_PREFIX)) {
        err.code = "SUBSCRIPTION_LOCKED";
        sessionHandlers.onSubscriptionLocked?.(serverMessage);
      }
    }
    throw err;
  }
  if (text && data === null) {
    throw { message: "Sunucudan beklenmeyen bir yanıt alındı.", status: res.status } as ApiError;
  }
  return data as T;
}

export async function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(token: string) {
  return request<User>("/auth/me", { method: "GET" }, token);
}

export async function getIntegrations(token: string) {
  return request<Integration[]>("/integrations", { method: "GET" }, token);
}

type OrdersResponse =
  | Order[]
  | { items?: Order[]; data?: Order[]; total?: number; page?: number };

export async function getOrders(
  token: string,
  integrationId?: string,
  options?: { page?: number; perPage?: number; sortBy?: string }
) {
  const qs = new URLSearchParams();
  qs.set("page", String(options?.page ?? 1));
  qs.set("per_page", String(options?.perPage ?? 100));
  qs.set("sort_by", options?.sortBy ?? "-created_at");
  if (integrationId) qs.set("integration_id", integrationId);
  const payload = await request<OrdersResponse>(`/orders?${qs.toString()}`, { method: "GET" }, token);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export async function getOrderDetail(token: string, orderId: string) {
  return request<Order>(`/orders/${orderId}`, { method: "GET" }, token);
}

// Etiket dosyası döndürmez; siparişin kargo bilgisini (barkod, kargo firması) verir.
export async function getShippingLabel(token: string, orderId: string) {
  return request<{
    barcode?: string | null;
    cargo_barcodes?: Array<{ barcode?: string }>;
    cargo_provider?: string | null;
    cargo_status?: string | null;
  }>(
    `/orders/${orderId}/shipping-label`,
    { method: "GET" },
    token
  );
}

export async function createHepsiJetShipment(token: string, orderId: string) {
  // Başarısızlıkta da HTTP 200 döner; `success` alanına bakılmalıdır. Sipariş için iç kimlik (order.id) gönderilir.
  return request<{ success?: boolean; message?: string; barcode?: string }>(
    `/hepsijet/create-shipment/${encodeURIComponent(orderId)}`,
    { method: "POST" },
    token
  );
}

export async function getHepsiJetLabel(token: string, barcode: string) {
  return request<{ success?: boolean; data?: string; data_base64?: string; message?: string; format?: string }>(
    `/hepsijet/label/${barcode}?format=PDF`,
    { method: "GET" },
    token
  );
}

export async function getHepsiburadaOrderLabel(token: string, orderId: string, packageNumber?: string) {
  const qs = new URLSearchParams();
  if (packageNumber) qs.set("package_number", packageNumber);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ success?: boolean; data?: string; data_base64?: string; url?: string; format?: string }>(
    `/hepsiburada/orders/${orderId}/label${suffix}`,
    { method: "GET" },
    token
  );
}

// HepsiJet ve Yurtiçi gönderileri için ürün listeli etiket PDF'i (base64). Barkod verilmezse siparişin kayıtlı barkodu kullanılır.
export async function getHepsiJetLabelWithProducts(token: string, orderId: string, barcode?: string) {
  const qs = new URLSearchParams();
  if (barcode) qs.set("barcode", barcode);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ success?: boolean; data?: string; data_base64?: string; message?: string; format?: string }>(
    `/hepsijet/label-with-products/${orderId}${suffix}`,
    { method: "GET" },
    token
  );
}

export async function getTrendyolOrderLabel(token: string, orderId: string) {
  return request<{ success?: boolean; data?: string; format?: string; label_data?: string }>(
    `/trendyol/orders/${orderId}/label`,
    { method: "GET" },
    token
  );
}

export async function getInvoices(token: string, options?: { page?: number; perPage?: number }) {
  const qs = new URLSearchParams();
  qs.set("page", String(options?.page ?? 1));
  qs.set("per_page", String(options?.perPage ?? 50));
  const payload = await request<any>(`/parasut/invoices?${qs.toString()}`, { method: "GET" }, token);
  const invoices = Array.isArray(payload?.invoices)
    ? payload.invoices
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return {
    invoices,
    total: Number(payload?.total ?? invoices.length ?? 0),
    page: Number(payload?.page ?? options?.page ?? 1),
    per_page: Number(payload?.per_page ?? options?.perPage ?? 50),
  } as { invoices: Invoice[]; total: number; page: number; per_page: number };
}

export async function getInvoiceDetail(token: string, invoiceId: string) {
  return request<Invoice>(`/parasut/invoices/${invoiceId}`, { method: "GET" }, token);
}

export async function officializeInvoice(token: string, invoiceId: string) {
  return request<{ success?: boolean; message?: string; invoice_id?: string }>(
    `/parasut/invoices/${invoiceId}/officialize`,
    { method: "POST" },
    token
  );
}

export async function downloadInvoicePdf(token: string, invoiceId: string) {
  return request<{ success?: boolean; mime?: string; filename?: string; data_base64?: string; data?: string }>(
    `/parasut/invoices/${invoiceId}/pdf`,
    { method: "GET" },
    token
  );
}

export async function getSalesReportsOverview(
  token: string,
  periodDays = 30,
  options?: { startDate?: Date; endDate?: Date }
) {
  const body: Record<string, string | number> = { period_days: periodDays };
  // Yerel tarih gönderilir; UTC'ye çevirmek Türkiye saatinde bir önceki günü verir.
  if (options?.startDate) {
    const d = options.startDate;
    body.since_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const payload = await request<any>(`/reports/overview`, { method: "POST", body: JSON.stringify(body) }, token);
  const summary = payload?.summary || {};
  const channelsSource = Array.isArray(payload?.channels) ? payload.channels : payload?.channel_breakdown;
  const timelineSource = Array.isArray(payload?.timeline) ? payload.timeline : payload?.daily_sales;
  const channel_breakdown = Array.isArray(channelsSource)
    ? channelsSource.map((x: any) => ({
        provider: x?.provider ?? x?.channel ?? "-",
        label: x?.label ?? x?.name ?? x?.provider ?? x?.channel ?? "-",
        revenue: Number(x?.revenue ?? x?.amount ?? 0),
        orders: Number(x?.orders ?? x?.count ?? 0),
      }))
    : [];
  const daily_sales = Array.isArray(timelineSource)
    ? timelineSource.map((x: any) => ({
        date: String(x?.date ?? x?.key ?? "-"),
        revenue: Number(x?.revenue ?? x?.amount ?? 0),
        orders: Number(x?.orders ?? x?.count ?? 0),
      }))
    : [];
  return {
    ...payload,
    total_revenue: Number(payload?.total_revenue ?? summary?.total_revenue ?? payload?.revenue ?? 0),
    total_orders: Number(payload?.total_orders ?? summary?.total_orders ?? payload?.orders ?? 0),
    average_order_value: Number(payload?.average_order_value ?? summary?.avg_order_value ?? payload?.avg_order ?? 0),
    channel_breakdown,
    daily_sales,
  } as ReportsOverview;
}

export async function getProductStock(token: string, options?: { page?: number; perPage?: number; search?: string }) {
  const qs = new URLSearchParams();
  qs.set("page", String(options?.page ?? 1));
  qs.set("per_page", String(options?.perPage ?? 100));
  if (options?.search) qs.set("search", String(options.search));
  return request<{ products?: Array<{ id?: string; stock?: number }>; total?: number; page?: number; per_page?: number }>(
    `/parasut/product-stock?${qs.toString()}`,
    { method: "GET" },
    token
  );
}

export async function syncIntegrationOrders(token: string, integrationId: string, providerRaw: string, days = 7) {
  const provider = String(providerRaw || "").toLowerCase();
  let prefix = "";
  if (provider.includes("woo")) prefix = "woocommerce";
  else if (provider.includes("trendyol")) prefix = "trendyol";
  else if (provider.includes("hepsiburada")) prefix = "hepsiburada";
  else if (provider.includes("n11")) prefix = "n11";
  if (!prefix) {
    throw { message: "Bu entegrasyon için sipariş çekme desteklenmiyor.", status: 400 };
  }
  return request<{ success?: boolean; message?: string; synced?: number; count?: number }>(
    `/${prefix}/${integrationId}/sync-orders?days=${Math.max(1, days)}`,
    { method: "POST" },
    token
  );
}

export async function listHepsiJetManualCustomers(
  token: string,
  options?: { page?: number; perPage?: number; search?: string }
) {
  const qs = new URLSearchParams();
  qs.set("page", String(options?.page ?? 1));
  qs.set("per_page", String(options?.perPage ?? 100));
  if (options?.search) qs.set("search", String(options.search));
  const payload = await request<any>(`/hepsijet/manual/customers?${qs.toString()}`, { method: "GET" }, token);
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.customers)
      ? payload.customers
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return items as HepsiJetManualCustomer[];
}

export async function createHepsiJetManualCustomer(token: string, payload: Partial<HepsiJetManualCustomer>) {
  const res = await request<{ success?: boolean; customer?: HepsiJetManualCustomer; message?: string }>(
    `/hepsijet/manual/customers`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  return res?.customer as HepsiJetManualCustomer;
}

export async function listHepsiJetManualShipments(token: string, options?: { page?: number; perPage?: number }) {
  const qs = new URLSearchParams();
  qs.set("page", String(options?.page ?? 1));
  qs.set("per_page", String(options?.perPage ?? 100));
  const payload = await request<any>(`/hepsijet/manual/shipments?${qs.toString()}`, { method: "GET" }, token);
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.shipments)
      ? payload.shipments
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return items as HepsiJetManualShipment[];
}

export async function createHepsiJetManualShipment(
  token: string,
  payload: { customer_id: string; total_parcels?: number; desi?: number; notes?: string }
) {
  const res = await request<{ success?: boolean; shipment?: HepsiJetManualShipment; message?: string }>(
    `/hepsijet/manual/shipments`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  return res?.shipment as HepsiJetManualShipment;
}

export async function getHepsiJetManualShipmentLabel(token: string, shipmentId: string) {
  return request<{ success?: boolean; data?: string; data_base64?: string; format?: string; message?: string }>(
    `/hepsijet/manual/shipments/${shipmentId}/label`,
    { method: "GET" },
    token
  );
}

export async function enqueueHepsiJetManualShipmentCloudPrint(token: string, shipmentId: string) {
  return request<{ success?: boolean; message?: string; queued?: boolean; job_id?: string }>(
    `/hepsijet/manual/shipments/${shipmentId}/cloud-print`,
    { method: "POST" },
    token
  );
}

export async function deleteHepsiJetManualCustomer(token: string, customerId: string) {
  return request<{ success?: boolean; message?: string }>(
    `/hepsijet/manual/customers/${customerId}`,
    { method: "DELETE" },
    token
  );
}

export async function deleteHepsiJetManualShipment(token: string, shipmentId: string) {
  return request<{ success?: boolean; message?: string }>(
    `/hepsijet/manual/shipments/${shipmentId}`,
    { method: "DELETE" },
    token
  );
}

export async function trackHepsiJetManualShipment(token: string, shipmentId: string) {
  return request<{ success?: boolean; shipment?: HepsiJetManualShipment; status?: string; message?: string }>(
    `/hepsijet/manual/shipments/${shipmentId}/track`,
    { method: "POST" },
    token
  );
}

export async function enqueueOrderCloudPrint(token: string, orderId: string, barcode?: string) {
  const qs = new URLSearchParams();
  if (barcode) qs.set("barcode", barcode);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ success?: boolean; message?: string; job_id?: string; status?: string }>(
    `/print-jobs/enqueue/${orderId}${suffix}`,
    { method: "POST" },
    token
  );
}

export async function requestPasswordReset(email: string) {
  return request<{ success: boolean; message: string; expires_in?: number }>(
    "/auth/password-reset/request-code",
    { method: "POST", body: JSON.stringify({ email }) }
  );
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  return request<{ success: boolean; message: string }>(
    "/auth/password-reset/confirm",
    { method: "POST", body: JSON.stringify({ email, code, new_password: newPassword }) }
  );
}

export async function registerPushToken(token: string, pushToken: string) {
  return request<{ ok: boolean }>(
    "/push-token",
    { method: "POST", body: JSON.stringify({ token: pushToken }) },
    token
  );
}

export async function getSalesOffers(token: string, options?: { page?: number; perPage?: number }) {
  const qs = new URLSearchParams();
  qs.set("page", String(options?.page ?? 1));
  qs.set("per_page", String(options?.perPage ?? 100));
  return request<any>(`/parasut/sales-offers?${qs.toString()}`, { method: "GET" }, token);
}

export async function getSalesOfferDetail(token: string, offerId: string) {
  return request<any>(`/parasut/sales-offers/${offerId}`, { method: "GET" }, token);
}

export async function getOfferPayment(token: string, offerId: string) {
  return request<any>(`/parasut/sales-offers/${offerId}/payment`, { method: "GET" }, token);
}

export async function createOfferPayment(token: string, offerId: string, sendEmail: boolean, integrationId: string) {
  return request<any>(
    `/parasut/sales-offers/${offerId}/payment`,
    { method: "POST", body: JSON.stringify({ send_email: sendEmail, integration_id: integrationId }) },
    token
  );
}

export async function getWooIntegrations(token: string) {
  return request<any>("/integrations?provider=woocommerce", { method: "GET" }, token);
}

export async function updateSalesOffer(token: string, offerId: string, data: Record<string, any>) {
  return request<any>(
    `/parasut/sales-offers/${offerId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    token
  );
}

export async function createSalesOffer(token: string, data: Record<string, any>) {
  return request<any>(
    "/parasut/sales-offers",
    { method: "POST", body: JSON.stringify(data) },
    token
  );
}

export async function getContacts(token: string, search?: string) {
  const qs = new URLSearchParams({ page: "1", per_page: "50" });
  if (search) qs.set("search", search);
  return request<any>(`/parasut/contacts?${qs.toString()}`, { method: "GET" }, token);
}

export async function getProducts(token: string, search?: string) {
  const qs = new URLSearchParams({ page: "1", per_page: "50" });
  if (search) qs.set("search", search);
  return request<any>(`/parasut/products?${qs.toString()}`, { method: "GET" }, token);
}

export type AccountingSettings = {
  provider?: string | null;
  preferred_provider?: string | null;
  parasut?: { connected?: boolean; status?: string } | null;
  bizimhesap?: { connected?: boolean; status?: string } | null;
};

export async function getAccountingSettings(token: string) {
  return request<AccountingSettings>("/settings/accounting", { method: "GET" }, token);
}

// Sayfalı sipariş listesi. Sunucu tek durum değeri süzdüğü için birden çok durum ayrı çağrılarla birleştirilir.
export async function getOrdersPage(
  token: string,
  options: { page?: number; perPage?: number; search?: string; statuses?: string[]; integrationId?: string } = {}
): Promise<OrdersPage> {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 30;
  const fetchOne = async (status?: string) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("per_page", String(perPage));
    qs.set("sort_by", "-order_date");
    if (options.search) qs.set("search", escapeSearch(options.search));
    if (options.integrationId) qs.set("integration_id", options.integrationId);
    if (status) qs.set("status", status);
    const payload = await request<any>(`/orders?${qs.toString()}`, { method: "GET" }, token);
    const items: Order[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    const total = Number(payload?.total ?? items.length);
    return { items, total, totalPages: Number(payload?.total_pages ?? Math.ceil(total / perPage)) };
  };
  const statuses = options.statuses && options.statuses.length > 0 ? options.statuses : [undefined];
  const parts = await Promise.all(statuses.map((s) => fetchOne(s)));
  const seen = new Set<string>();
  const items = parts
    .flatMap((p) => p.items)
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    .sort((a, b) => String(b.order_date || b.created_at || "").localeCompare(String(a.order_date || a.created_at || "")));
  return {
    items,
    total: parts.reduce((n, p) => n + p.total, 0),
    page,
    totalPages: Math.max(1, ...parts.map((p) => p.totalPages)),
  };
}

export async function getDashboardStats(token: string) {
  return request<DashboardStats>("/dashboard/stats", { method: "GET" }, token);
}

export async function getSalesChart(token: string, days: number) {
  const data = await request<SalesChartPoint[]>(`/dashboard/sales-chart?days=${days}`, { method: "GET" }, token);
  return Array.isArray(data) ? data : [];
}

export async function getSmartAlerts(token: string) {
  const data = await request<SmartAlert[]>("/dashboard/smart-alerts", { method: "GET" }, token);
  return Array.isArray(data) ? data : [];
}

// Sunucu arama metnini düzenli ifade olarak kullanır; özel karakterler kaçırılır.
function escapeSearch(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ürün listesi: stok ve fiyat iki ayrı uçtan gelir, ürün kimliğiyle birleştirilir.
// Adına rağmen bu uçlar yerel ürün verisini okur; Paraşüt bağlantısı gerekmez.
export async function getCatalog(
  token: string,
  options: { page?: number; perPage?: number; search?: string } = {}
): Promise<{ products: CatalogProduct[]; channels: ChannelRef[]; total: number; page: number; perPage: number }> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 30));
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("per_page", String(perPage));
  const search = (options.search || "").trim();
  if (search) qs.set("search", escapeSearch(search));
  const [stock, prices] = await Promise.all([
    request<any>(`/parasut/product-stock?${qs.toString()}`, { method: "GET" }, token),
    request<any>(`/parasut/product-prices?${qs.toString()}`, { method: "GET" }, token).catch(() => null),
  ]);
  const priceById = new Map<string, any>();
  (Array.isArray(prices?.products) ? prices.products : []).forEach((p: any) => priceById.set(String(p.id), p));
  const products: CatalogProduct[] = (Array.isArray(stock?.products) ? stock.products : []).map((p: any) => {
    const pr = priceById.get(String(p.id));
    return {
      id: String(p.id),
      name: String(p.name || "Ürün"),
      sku: p.sku || undefined,
      barcode: p.barcode || undefined,
      image_url: p.image_url || undefined,
      stock: Number(p.stock || 0),
      price: Number(pr?.price || 0),
      channelStocks: (Array.isArray(p.integration_stocks) ? p.integration_stocks : []).map((x: any) => ({
        integration_id: String(x.integration_id),
        stock: Number(x.stock || 0),
        active: x.active,
      })),
      channelPrices: (Array.isArray(pr?.integration_prices) ? pr.integration_prices : []).map((x: any) => ({
        integration_id: String(x.integration_id),
        price: Number(x.price || 0),
        active: x.active,
      })),
    };
  });
  const channels: ChannelRef[] = (Array.isArray(stock?.integrations) ? stock.integrations : []).map((i: any) => ({
    id: String(i.id),
    name: String(i.name || i.platform || ""),
    platform: String(i.platform || ""),
  }));
  return { products, channels, total: Number(stock?.total ?? products.length), page, perPage };
}

// Sunucu boş `sync_targets` listesini "bağlı tüm kanallar" sayar. Hiçbir kanala gönderilmemesi
// isteniyorsa hiçbir sağlayıcıyla eşleşmeyen bu işaretçi gönderilir.
export const SYNC_NONE = "none";

type SyncResult = { message?: string; synced_providers?: string[]; skipped_providers?: Record<string, string> };

// Ana stoğu mutlak değere ayarlar. Değer yalnızca `syncTargets` içindeki sağlayıcılara gönderilir; liste boş bırakılamaz.
export async function setProductStock(token: string, productId: string, stock: number, syncTargets: string[]) {
  if (syncTargets.length === 0) throw { message: "Stok hedefi belirlenemedi.", status: 0 };
  return request<SyncResult & { new_stock?: number }>(
    "/stock/adjust",
    {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        quantity: Math.max(0, Math.round(stock)),
        movement_type: "adjustment",
        reason: "Mobil uygulamadan güncelleme",
        sync_woocommerce: false,
        sync_all: false,
        sync_targets: syncTargets,
      }),
    },
    token
  );
}

export async function setChannelStock(token: string, productId: string, integrationId: string, stock: number) {
  return request<{ message?: string; stock?: number }>(
    "/stock/channel-set",
    { method: "POST", body: JSON.stringify({ product_id: productId, integration_id: integrationId, stock: Math.max(0, Math.round(stock)) }) },
    token
  );
}

// Ana fiyatı değiştirir. `pushToChannels` true ise fiyat ürünün bağlı olduğu tüm kanallara da gönderilir (web panelindeki davranış).
export async function setProductPrice(token: string, productId: string, price: number, pushToChannels: boolean) {
  return request<SyncResult & { new_price?: number }>(
    "/price/adjust",
    {
      method: "POST",
      body: JSON.stringify({ product_id: productId, price, currency: "TRY", sync_all: pushToChannels, sync_targets: pushToChannels ? [] : [SYNC_NONE] }),
    },
    token
  );
}

export async function setChannelPrice(token: string, productId: string, integrationId: string, price: number) {
  return request<{ message?: string; price?: number }>(
    "/price/channel-set",
    { method: "POST", body: JSON.stringify({ product_id: productId, integration_id: integrationId, price, currency: "TRY" }) },
    token
  );
}

export async function getSyncJobs(token: string, options: { page?: number; status?: "success" | "failed" } = {}) {
  const qs = new URLSearchParams();
  qs.set("page", String(options.page ?? 1));
  qs.set("per_page", "25");
  if (options.status) qs.set("status", options.status);
  const payload = await request<any>(`/integration-jobs?${qs.toString()}`, { method: "GET" }, token);
  const items: SyncJob[] = Array.isArray(payload?.items) ? payload.items : [];
  return { items, total: Number(payload?.total ?? items.length) };
}

export async function retrySyncJobs(token: string, jobIds: string[]) {
  return request<{ success?: boolean; attempted?: number; success_count?: number; failed_count?: number }>(
    "/integration-jobs/retry",
    { method: "POST", body: JSON.stringify({ job_ids: jobIds }) },
    token
  );
}

// ---------------------------------------------------------------------------
// Finans, cari, kasa, faturalar (Faz 3)
// ---------------------------------------------------------------------------
import type {
  CashAccount,
  CashEntry,
  ExpenseInvoice,
  FinanceOverview,
  IncomingInvoice,
  IncomingSource,
  LocalInvoice,
  Party,
  PartyLedgerRow,
  SupportMessage,
  SupportTicket,
  TrialStatus,
  UsageSummary,
} from "./types";

type Paged<T> = { items: T[]; total: number; hasMore: boolean };

function paged<T>(payload: any, key: string, page: number, perPage: number): Paged<T> {
  const items: T[] = Array.isArray(payload?.[key]) ? payload[key] : Array.isArray(payload?.items) ? payload.items : [];
  const total = Number(payload?.total ?? payload?.totalCount ?? items.length);
  return { items, total, hasMore: page * perPage < total && items.length > 0 };
}

export async function getFinanceOverview(token: string) {
  const d = await request<any>("/finance/overview", { method: "GET" }, token);
  // Sunucunun üst düzey alacak/borç alanları tüm para birimlerinin toplamıdır; ekranda TL gösterildiği için
  // para birimi kırılımı varsa yalnızca TL satırı kullanılır.
  const byCur = d?.by_currency && typeof d.by_currency === "object" ? d.by_currency : null;
  const tl = byCur ? byCur.TRY || byCur.TRL || null : null;
  const multiCurrency = Boolean(byCur) && Object.keys(byCur).some((c) => c !== "TRY" && c !== "TRL");
  const pick = (key: string) => Number((multiCurrency && tl ? tl[key] : d?.[key]) || 0);
  return {
    cash_balance: Number(d?.cash_balance || 0),
    receivable: pick("receivable"),
    overdue_receivable: pick("overdue_receivable"),
    payable: pick("payable"),
    overdue_payable: pick("overdue_payable"),
    month_cash_in: Number(d?.month_cash_in || 0),
    month_cash_out: Number(d?.month_cash_out || 0),
    multiCurrency,
    today: d?.today,
    upcoming: Array.isArray(d?.upcoming) ? d.upcoming : [],
  } as FinanceOverview;
}

export async function getSupportNotifications(token: string) {
  const d = await request<any>("/support/notifications?limit=20", { method: "GET" }, token);
  return (Array.isArray(d?.items) ? d.items : []) as {
    ticket_id: string;
    ticket_code?: string;
    subject?: string;
    last_super_message_at?: string;
    preview?: string;
  }[];
}

export async function getCashAccounts(token: string) {
  const d = await request<any>("/finance/accounts", { method: "GET" }, token);
  return (Array.isArray(d?.items) ? d.items : []) as CashAccount[];
}

export async function getCashAccount(token: string, accountId: string) {
  const d = await request<any>(`/finance/accounts/${encodeURIComponent(accountId)}`, { method: "GET" }, token);
  return { account: d?.account as CashAccount, entries: (Array.isArray(d?.items) ? d.items : []) as CashEntry[] };
}

export async function createCashEntry(
  token: string,
  body: { account_id: string; entry_type: "income" | "expense"; amount: number; entry_date: string; description?: string }
) {
  return request<any>("/finance/entries", { method: "POST", body: JSON.stringify({ ...body, source_type: "manual" }) }, token);
}

export async function getParties(
  token: string,
  options: { page?: number; search?: string; balanceStatus?: "receivable" | "payable" | "open" } = {}
) {
  const page = options.page ?? 1;
  const perPage = 30;
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage), sort: "balance_desc" });
  if (options.search) qs.set("search", escapeSearch(options.search));
  if (options.balanceStatus) qs.set("balance_status", options.balanceStatus);
  const d = await request<any>(`/customers?${qs.toString()}`, { method: "GET" }, token);
  const res = paged<Party>(d, "items", page, perPage);
  return { ...res, summary: (d?.summary || {}) as { total_receivable?: number; total_payable?: number; total_contacts?: number } };
}

export async function getPartyLedger(token: string, partyId: string) {
  const d = await request<any>(`/customers/${encodeURIComponent(partyId)}/ledger`, { method: "GET" }, token);
  return { rows: (Array.isArray(d?.items) ? d.items : []) as PartyLedgerRow[], balance: Number(d?.balance || 0) };
}

export async function collectPartyPayment(token: string, partyId: string, body: { amount: number; payment_method: string; note?: string; payment_date: string }) {
  return request<any>(`/customers/${encodeURIComponent(partyId)}/payments`, { method: "POST", body: JSON.stringify(body) }, token);
}

export async function getLocalInvoices(token: string, options: { page?: number; search?: string; status?: string } = {}) {
  const page = options.page ?? 1;
  const perPage = 30;
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage), invoice_type: "satis" });
  if (options.search) qs.set("search", options.search);
  if (options.status) qs.set("status", options.status);
  return paged<LocalInvoice>(await request<any>(`/local-invoices?${qs.toString()}`, { method: "GET" }, token), "items", page, perPage);
}

export async function getLocalInvoiceSummary(token: string) {
  return request<{ total_remaining?: number; overdue_amount?: number; overdue_count?: number; collected_month?: number }>(
    "/local-invoices/summary",
    { method: "GET" },
    token
  );
}

export async function getLocalInvoice(token: string, id: string) {
  return request<LocalInvoice>(`/local-invoices/${encodeURIComponent(id)}`, { method: "GET" }, token);
}

export async function officializeLocalInvoice(token: string, id: string) {
  return request<{ ok?: boolean; message?: string; edoc_state?: string; pending?: boolean }>(
    `/local-invoices/${encodeURIComponent(id)}/resmilestir`,
    { method: "POST" },
    token
  );
}

export async function addLocalInvoicePayment(token: string, id: string, body: { amount: number; date: string; method: string; notes?: string }) {
  return request<{ ok?: boolean; remaining_amount?: number; status?: string }>(
    `/local-invoices/${encodeURIComponent(id)}/payment`,
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

// Muhasebe programındaki satış faturaları. Paraşüt ve BizimHesap aynı satır biçimini döndürür.
// Sunucu sayfa başına en çok 100 kayıt verir (Paraşüt'te 25'e düşebilir); sayfalar biriken kayıt sayısına göre ilerletilir.
export async function getAccountingInvoices(token: string, source: "parasut" | "bizimhesap", options?: { maxRecords?: number }) {
  const perPage = source === "parasut" ? 25 : 100;
  const max = options?.maxRecords ?? 300;
  const fetchPage = async (page: number) => {
    const payload = await request<any>(`/${source}/invoices?page=${page}&per_page=${perPage}`, { method: "GET" }, token);
    return { rows: (Array.isArray(payload?.invoices) ? payload.invoices : []) as Invoice[], total: Number(payload?.total ?? 0) };
  };
  const first = await fetchPage(1);
  const invoices = [...first.rows];
  const total = Math.max(first.total, invoices.length);
  const seen = new Set(invoices.map((i) => String(i.id)));
  let page = 2;
  while (invoices.length < Math.min(total, max) && first.rows.length === perPage) {
    // Dörderli gruplar hâlinde paralel çekilir.
    const pages = [page, page + 1, page + 2, page + 3].filter((p) => (p - 1) * perPage < Math.min(total, max));
    if (pages.length === 0) break;
    const batch = await Promise.all(pages.map((p) => fetchPage(p).catch(() => ({ rows: [] as Invoice[], total: 0 }))));
    let added = 0;
    batch.forEach((b) =>
      b.rows.forEach((r) => {
        if (!seen.has(String(r.id))) {
          seen.add(String(r.id));
          invoices.push(r);
          added += 1;
        }
      })
    );
    if (added === 0) break;
    page += pages.length;
  }
  return { invoices, total };
}

export async function getParasutExpenseInvoices(token: string, page = 1) {
  const perPage = 30;
  const d = await request<any>(`/parasut/expense-invoices?page=${page}&per_page=${perPage}`, { method: "GET" }, token);
  return paged<ExpenseInvoice>(d, "invoices", page, perPage);
}

// ---------------------------------------------------------------------------
// Gelen e-faturalar (Faz 4)
// ---------------------------------------------------------------------------

// Web paneliyle aynı sıra: kayıtlı kaynak, etkin muhasebe programı, ilk bağlı kaynak. BizimHesap gelen faturayı desteklemez.
export async function resolveIncomingSource(token: string): Promise<{ source: IncomingSource | null; connected: IncomingSource[] }> {
  const [acc, turkcell, saved] = await Promise.all([
    request<any>("/settings/accounting", { method: "GET" }, token).catch(() => null),
    request<any>("/turkcell-efatura/status", { method: "GET" }, token).catch(() => null),
    request<any>("/settings/incoming-einvoice-source", { method: "GET" }, token).catch(() => null),
  ]);
  const connected: IncomingSource[] = [];
  if (acc?.parasut?.connected) connected.push("parasut");
  if (acc?.benimpos?.connected) connected.push("benimpos");
  if (turkcell?.connected) connected.push("turkcell-efatura");
  const wanted = [saved?.source, acc?.provider].map((x) => String(x || ""));
  const source = (wanted.find((w) => connected.includes(w as IncomingSource)) as IncomingSource | undefined) ?? connected[0] ?? null;
  return { source, connected };
}

export async function getIncomingInvoices(token: string, source: IncomingSource, page = 1) {
  const perPage = 30;
  if (source === "turkcell-efatura") {
    const d = await request<any>(`/turkcell-efatura/inbox?page=${page}&page_size=${perPage}`, { method: "GET" }, token);
    return paged<IncomingInvoice>(d, "items", page, perPage);
  }
  const d = await request<any>(`/${source}/incoming-e-invoices?page=${page}&per_page=${perPage}`, { method: "GET" }, token);
  return paged<IncomingInvoice>(d, "invoices", page, perPage);
}

// PDF yalnızca Paraşüt ve Turkcell kaynaklarında vardır.
export async function getIncomingInvoicePdf(token: string, source: IncomingSource, id: string) {
  const path =
    source === "turkcell-efatura"
      ? `/turkcell-efatura/inbox/${encodeURIComponent(id)}/pdf`
      : `/parasut/incoming-e-invoices/${encodeURIComponent(id)}/pdf`;
  const d = await request<{ data_base64?: string; data?: string }>(path, { method: "GET" }, token);
  return d?.data_base64 || d?.data || "";
}

// ---------------------------------------------------------------------------
// Destek ve abonelik (Faz 5)
// ---------------------------------------------------------------------------

export async function getSupportTickets(token: string, page = 1) {
  const perPage = 30;
  return paged<SupportTicket>(await request<any>(`/support/tickets?page=${page}&per_page=${perPage}`, { method: "GET" }, token), "items", page, perPage);
}

export async function createSupportTicket(token: string, body: { topic: string; subject?: string; message: string }) {
  return request<{ success?: boolean; ticket_id?: string; ticket_code?: string; message?: string }>(
    "/support/tickets",
    { method: "POST", body: JSON.stringify({ ...body, source: "mobile" }) },
    token
  );
}

export async function getSupportTicket(token: string, id: string) {
  const d = await request<any>(`/support/tickets/${encodeURIComponent(id)}`, { method: "GET" }, token);
  return { ticket: d?.ticket as SupportTicket, messages: (Array.isArray(d?.messages) ? d.messages : []) as SupportMessage[] };
}

export async function replySupportTicket(token: string, id: string, message: string) {
  return request<{ success?: boolean }>(`/support/tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message }) }, token);
}

export async function getTrialStatus(token: string) {
  return request<TrialStatus>("/billing/trial-status", { method: "GET" }, token);
}

export async function getUsageSummary(token: string) {
  return request<UsageSummary>("/usage/summary", { method: "GET" }, token);
}
