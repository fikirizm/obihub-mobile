import Constants from "expo-constants";
import { incomingSources } from "./incoming-source";
// Premium ObiHub API client targeting api.obihub.app/api by default.
// Override via EXPO_PUBLIC_OBIHUB_API_URL env if needed.

import { otherCurrencyRevenue } from "./currency-lines";
import { isAccountInactive, isAccountWritable } from "./account-pick";
import { RESET_REQUEST_PATH } from "./password-rule";
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

type ApiError = { message: string; status: number; code?: string; reason?: string; retryAfter?: number; data?: any; jobId?: string };

// Backend bu önekle başlayan 403 yanıtını abonelik kilidi için döndürür.
const SUBSCRIPTION_LOCK_PREFIX = "Abonelik erişimi pasif.";

type SessionHandlers = {
  onUnauthorized?: () => void;
  // Uzun oturum: 401'de erişim anahtarı sessizce yenilenir (tek uçuş). Yeni anahtar döner; null = yenilenemedi
  // (işleyici kesin retlerde çıkışı kendisi yapar, ağ hatasında oturumu korur).
  onRefresh?: (staleToken: string) => Promise<string | null>;
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

export async function request<T>(path: string, options: RequestInit = {}, token?: string, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        // FormData gövdesinde Content-Type ve sınır (boundary) fetch tarafından konur.
        ...(typeof FormData !== "undefined" && options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
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
    // detail bazen nesnedir: {code, message, ...} (ör. stok mutabakatı 409'u).
    const serverMessage =
      typeof detail === "string"
        ? detail
        : typeof detail?.message === "string"
          ? detail.message
          : typeof data?.message === "string"
            ? data.message
            : "";
    const friendlyMessage = STATUS_MESSAGES[res.status];
    const err: ApiError = {
      message: serverMessage || friendlyMessage || `Sunucu hatası (${res.status})`,
      status: res.status,
    };
    // Kapalı kodlu hatalar ({code, detail} ya da detail: {code, message}) için kod da taşınır.
    const code = typeof data?.code === "string" ? data.code : typeof detail?.code === "string" ? detail.code : "";
    if (code) err.code = code;
    // Ek alanlar (ör. ACCOUNT_BALANCE_NOT_ZERO: balance, currency) için yanıt gövdesi.
    if (data && typeof data === "object") err.data = typeof detail === "object" && detail ? { ...data, ...detail } : data;
    // İçeri Al onay retleri kapalı kodu `reason` alanında taşır ({status: REJECTED, reason, detail}).
    if (typeof data?.reason === "string" && data.reason) err.reason = data.reason;
    // 429 yanıtlarında (ör. LOGIN_LOCKED) beklenecek süre saniye olarak.
    const retryAfter = Number(res.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfter = retryAfter;
    // Sipariş çekimi sürüyorsa 409 + X-Job-Id: istemci o işi izler, yeniden başlatmaz.
    const jobId = res.headers.get("X-Job-Id");
    if (jobId) err.jobId = jobId;
    // Yalnızca oturumlu çağrılar: giriş ekranındaki hatalı şifre 401'i oturumu etkilemez.
    if (token) {
      if (res.status === 401 && !retried && sessionHandlers.onRefresh) {
        // Sessiz yenileme ve isteğin bir kez tekrarı; yenileme başarısızsa hata çağırana gider (çıkış işleyicide karar verilir).
        const fresh = await sessionHandlers.onRefresh(token).catch(() => null);
        if (fresh && fresh !== token) return request<T>(path, options, fresh, true);
      } else if (res.status === 401 && (retried || !sessionHandlers.onRefresh)) {
        // Yenilenmiş anahtarla da 401: oturum gerçekten düşmüş.
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

export type OrderStats = {
  total: number;
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  deleted: number;
  // 13 Kas 2026 sözleşmesi: her sipariş tam bir gruba düşer (toplam = all). Sipariş çipleri bunu kullanır.
  groups?: Partial<Record<"all" | "pending" | "ready_to_ship" | "shipped" | "delivered" | "cancelled" | "returned" | "deleted", number>>;
};

// Duruma göre gerçek sipariş sayıları (tüm siparişler üzerinden); mağaza verilirse yalnızca o mağaza.
export async function getOrderStats(token: string, integrationId?: string) {
  const qs = integrationId ? `?integration_id=${encodeURIComponent(integrationId)}` : "";
  return request<OrderStats>(`/orders/stats${qs}`, { method: "GET" }, token);
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
  return request<{ success?: boolean; in_progress?: boolean; message?: string; barcode?: string }>(
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
        label: x?.label ? String(x.label) : undefined,
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
    other_currencies: otherCurrencyRevenue(payload?.by_currency),
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

// Alıcı düzeltme: PUT /hepsijet/manual/customers/{id} (gövde oluşturmayla aynı; sunucu aynı doğrulamayı yapar).
export async function updateHepsiJetManualCustomer(token: string, customerId: string, payload: Partial<HepsiJetManualCustomer>) {
  const res = await request<{ success?: boolean; customer?: HepsiJetManualCustomer; message?: string }>(
    `/hepsijet/manual/customers/${encodeURIComponent(customerId)}`,
    { method: "PUT", body: JSON.stringify(payload) },
    token
  );
  return (res?.customer || { ...payload, id: customerId }) as HepsiJetManualCustomer;
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
    // 17 Kas 2026: mobil uç (Turnstile belirteci istemez); 200 gövdesi kayıtlı/kayıtsız e-postada aynıdır.
    RESET_REQUEST_PATH,
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

// Çıkışta cihazın bildirim kaydını siler (DELETE /push-token, gövde {token}). Oturum işleyicilerini tetiklememek için
// ortak request() kullanılmaz: çıkış 401 yüzünden yapılıyorsa bu çağrı da 401 alır ve yeni bir çıkış başlatmamalı.
// Hata yutulur; uç henüz yoksa (404/405) çıkış yine tamamlanır. En çok 4 sn beklenir.
export async function unregisterPushToken(token: string, pushToken: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(`${API_BASE_URL}/push-token`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: pushToken }),
      signal: ctrl.signal,
    });
  } catch {
    // Ağ hatası ya da zaman aşımı: çıkış sürer.
  } finally {
    clearTimeout(timer);
  }
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

// 13 Kas 2026: işlem anahtarlı (aynı anahtar + aynı gövde → ilk sonuç, replayed:true). Kurallar src/offer-form.ts offerWriteKind.
export async function createSalesOffer(token: string, data: Record<string, any>, idempotencyKey?: string) {
  return request<any>(
    "/parasut/sales-offers",
    { method: "POST", body: JSON.stringify(data), headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined },
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

// Sayfalı sipariş listesi. Birden çok durum tek istekte virgülle gönderilir (sunucu 88a086a17: status=a,b);
// sayfalama ve toplam sunucudan gelir.
export async function getOrdersPage(
  token: string,
  options: { page?: number; perPage?: number; search?: string; statuses?: string[]; statusGroup?: string; integrationId?: string; sortBy?: string } = {}
): Promise<OrdersPage> {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 30;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("per_page", String(perPage));
  qs.set("sort_by", options.sortBy ?? "-order_date");
  // Sunucu (13 Kas 2026) arama metnini kendisi kaçışlar; istemci kaçışı "+90" gibi aramaları bozar.
  if (options.search) qs.set("search", options.search);
  if (options.integrationId) qs.set("integration_id", options.integrationId);
  // `status` verilirse sunucuda `status_group`'a üstündür; ikisi birlikte gönderilmez.
  if (options.statuses && options.statuses.length > 0) qs.set("status", options.statuses.join(","));
  else if (options.statusGroup) qs.set("status_group", options.statusGroup);
  const payload = await request<any>(`/orders?${qs.toString()}`, { method: "GET" }, token);
  const items: Order[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  const total = Number(payload?.total ?? items.length);
  return { items, total, page, totalPages: Math.max(1, Number(payload?.total_pages ?? Math.ceil(total / perPage))) };
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
    // Fiyat hatası yutulmaz: yutulursa bütün ürünler 0,00 ₺ ve kanalsız görünür, bu değerler önbelleğe de yazılır.
    request<any>(`/parasut/product-prices?${qs.toString()}`, { method: "GET" }, token),
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
      reserved: Number.isFinite(Number(p.reserved)) ? Math.trunc(Number(p.reserved)) : 0,
      onHand: p.on_hand == null ? Number(p.stock || 0) + (Number.isFinite(Number(p.reserved)) ? Math.trunc(Number(p.reserved)) : 0) : Math.trunc(Number(p.on_hand) || 0),
      price: Number(pr?.price || 0),
      channelStocks: (Array.isArray(p.integration_stocks) ? p.integration_stocks : []).map((x: any) => ({
        integration_id: String(x.integration_id),
        stock: Number(x.stock || 0),
        active: x.active,
        // Kanalın onayını bekleyen, kullanıcının girdiği değer (Trendyol/Hepsiburada); `stock` onaylı değerdir.
        pending: x.pending === true && x.pending_stock != null ? Math.trunc(Number(x.pending_stock)) : null,
      })),
      channelPrices: (Array.isArray(pr?.integration_prices) ? pr.integration_prices : []).map((x: any) => ({
        integration_id: String(x.integration_id),
        price: Number(x.price || 0),
        active: x.active,
        pending: x.pending === true && x.pending_price != null && Number.isFinite(Number(x.pending_price)) ? Number(x.pending_price) : null,
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

// İşlem anahtarı: her kullanıcı eylemi için bir kez üretilir.
export function newIdempotencyKey(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  return `mob-${prefix}-${Date.now().toString(36)}-${rand}`;
}

type SyncResult = { status?: string; message?: string; synced_providers?: string[]; skipped_providers?: Record<string, string> };

// Ana stok: "in"/"out" miktar kadar ekler/düşer, "adjustment" stoğu verilen değere ayarlar (web ürün detayıyla aynı).
// Değer yalnızca `syncTargets` içindeki sağlayıcılara gönderilir; liste boş bırakılamaz.
export async function setProductStock(
  token: string,
  productId: string,
  opts: { mode: "in" | "out" | "adjustment"; quantity: number; reason?: string; syncTargets: string[]; idempotencyKey?: string }
) {
  if (opts.syncTargets.length === 0) throw { message: "Stok hedefi belirlenemedi.", status: 0 };
  return request<SyncResult & { new_stock?: number }>(
    "/stock/adjust",
    {
      method: "POST",
      // Sunucu aynı anahtarla gelen ikinci isteği yeniden uygulamaz (harf/rakam ve ._:- , 8–128 karakter).
      headers: { "Idempotency-Key": opts.idempotencyKey || newIdempotencyKey("stk") },
      body: JSON.stringify({
        product_id: productId,
        quantity: Math.max(0, Math.round(opts.quantity)),
        movement_type: opts.mode,
        reason: (opts.reason || "").trim() || "Mobil uygulamadan güncelleme",
        sync_woocommerce: false,
        sync_all: false,
        sync_targets: opts.syncTargets,
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

// Ana fiyatı değiştirir. `targets === null`: web fiyat listesi gibi bağlı tüm kanallara (muhasebe dahil) gönderir;
// aksi hâlde yalnız verilen sağlayıcılara.
export async function setProductPrice(token: string, productId: string, price: number, targets: string[] | null) {
  return request<SyncResult & { new_price?: number }>(
    "/price/adjust",
    {
      method: "POST",
      body: JSON.stringify({ product_id: productId, price, currency: "TRY", sync_all: targets === null, sync_targets: targets === null ? [] : targets }),
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
  const pick = (key: string) => Number((multiCurrency ? tl?.[key] : d?.[key]) || 0);
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

// Hesap seçicileri (tahsilat, ödeme, virman, İçeri Al "Ödendi"): arşivli/pasif ve Paraşüt aynalı hesap gösterilmez (D-15: yazım 409).
export async function getPickableAccounts(token: string) {
  return (await getCashAccounts(token)).filter((a) => !isAccountInactive(a) && isAccountWritable(a));
}

export async function getCashAccount(token: string, accountId: string) {
  const d = await request<any>(`/finance/accounts/${encodeURIComponent(accountId)}`, { method: "GET" }, token);
  return { account: d?.account as CashAccount, entries: (Array.isArray(d?.items) ? d.items : []) as CashEntry[] };
}

export async function createCashEntry(
  token: string,
  body: { account_id: string; entry_type: "income" | "expense"; amount: number; entry_date: string; description?: string },
  idempotencyKey?: string
) {
  // C6 / Aşama 4 P1: web KasaOS gibi kategori "other"; işlem anahtarı başlıkta (aynı anahtar + aynı gövde → ilk sonuç, replayed).
  return request<any>(
    "/finance/entries",
    {
      method: "POST",
      body: JSON.stringify({ ...body, category: "other", source_type: "manual" }),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    },
    token
  );
}

export async function getParties(
  token: string,
  options: { page?: number; search?: string; balanceStatus?: "receivable" | "payable" | "open"; role?: "customer" | "supplier" } = {}
) {
  const page = options.page ?? 1;
  const perPage = 30;
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage), sort: "balance_desc" });
  if (options.role) qs.set("role", options.role);
  if (options.search) qs.set("search", escapeSearch(options.search));
  if (options.balanceStatus) qs.set("balance_status", options.balanceStatus);
  const d = await request<any>(`/customers?${qs.toString()}`, { method: "GET" }, token);
  const res = paged<Party>(d, "items", page, perPage);
  return { ...res, summary: (d?.summary || {}) as { total_receivable?: number; total_payable?: number; total_contacts?: number; by_currency?: Record<string, { total_receivable?: number; total_payable?: number }> } };
}

// Aşama 4 P3: ekstre sayfalı (en yeni önce; varsayılan 100, en çok 1000). `total > yüklenen` ise sonraki sayfa istenir.
export async function getPartyLedger(token: string, partyId: string, page = 1, perPage = 100) {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  const d = await request<any>(`/customers/${encodeURIComponent(partyId)}/ledger?${qs.toString()}`, { method: "GET" }, token);
  const rows = (Array.isArray(d?.items) ? d.items : []) as PartyLedgerRow[];
  const balances = (Array.isArray(d?.balances) ? d.balances : [])
    .map((b: any) => ({ currency: String(b?.currency || "TRY").toUpperCase(), balance: Number(b?.balance) || 0 }))
    .filter((b: { balance: number }) => Math.abs(b.balance) > 0.004);
  return {
    rows,
    balance: Number(d?.balance || 0),
    currency: typeof d?.balance_currency === "string" && d.balance_currency ? d.balance_currency.toUpperCase() : null,
    balances: balances as { currency: string; balance: number }[],
    // Eski sunucu sayfalamaz, total göndermez: gelen satırlar tümüdür.
    total: Number.isFinite(Number(d?.total)) && d?.total != null ? Number(d.total) : rows.length,
  };
}

export async function collectPartyPayment(token: string, partyId: string, body: { amount: number; payment_method: string; note?: string; payment_date: string }) {
  return request<any>(`/customers/${encodeURIComponent(partyId)}/payments`, { method: "POST", body: JSON.stringify(body) }, token);
}

export async function getLocalInvoices(
  token: string,
  options: { page?: number; search?: string; status?: string; view?: string; invoiceType?: "satis" | "teklif"; quoteOutcome?: string } = {}
) {
  const page = options.page ?? 1;
  const perPage = 30;
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage), invoice_type: options.invoiceType || "satis" });
  // Teklifler (WP-21): durum sekmeleri sunucuda süzülür (open|accepted|rejected|expired).
  if (options.quoteOutcome) qs.set("quote_outcome", options.quoteOutcome);
  if (options.search) qs.set("search", options.search);
  if (options.status) qs.set("status", options.status);
  // Toplu sürüm 1: iki eksenli liste görünümü (taslak|kesildi|resmilesti|tahsil|gecikmis|iptal).
  if (options.view) qs.set("view", options.view);
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

// Dalga 2: isteğe bağlı gövde {internet_sale?} (e-Arşiv internet satışı); gövdesiz istek eski davranış.
export async function officializeLocalInvoice(token: string, id: string, body?: Record<string, unknown>) {
  return request<{ ok?: boolean; message?: string; edoc_state?: string; pending?: boolean; amount_note?: string }>(
    `/local-invoices/${encodeURIComponent(id)}/resmilestir`,
    body ? { method: "POST", body: JSON.stringify(body) } : { method: "POST" },
    token
  );
}

// Paraşüt'e gitmiş faturanın e-belge sonucunu yeniden okur (web: ObiHubInvoicesPage.js "Durumu sorgula").
export async function checkLocalInvoiceEdocStatus(token: string, id: string) {
  return request<{ ok?: boolean; edoc_state?: string; status?: string; message?: string }>(
    `/local-invoices/${encodeURIComponent(id)}/edoc-status`,
    { method: "POST" },
    token
  );
}

// Aşama 4 P2: hesap verilirse katı (404 / 422 CURRENCY_MISMATCH); verilmezse faturanın para birimindeki varsayılan/tek hesap.
// İşlem anahtarı başlıkta: aynı anahtar + aynı gövde → ilk sonuç (`replayed`), ikinci tahsilat açılmaz.
export async function addLocalInvoicePayment(
  token: string,
  id: string,
  body: { amount: number; date: string; method: string; notes?: string; account_id?: string | null; parasut_sync?: boolean; parasut_account_id?: string | null },
  idempotencyKey?: string
) {
  const payload: Record<string, unknown> = { ...body };
  if (!body.account_id) delete payload.account_id;
  if (!body.parasut_sync) { delete payload.parasut_sync; delete payload.parasut_account_id; }
  return request<{ ok?: boolean; remaining_amount?: number; status?: string; replayed?: boolean; parasut?: { ok?: boolean; error?: string } }>(
    `/local-invoices/${encodeURIComponent(id)}/payment`,
    { method: "POST", body: JSON.stringify(payload), headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined },
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
    return {
      rows: (Array.isArray(payload?.invoices) ? payload.invoices : []) as Invoice[],
      total: Number(payload?.total ?? 0),
      remote: String(payload?.source || "").startsWith("remote:"),
    };
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
    const batch = await Promise.all(pages.map((p) => fetchPage(p).catch(() => ({ rows: [] as Invoice[], total: 0, remote: false }))));
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
  // BizimHesap uzak ucunda sunucu "total" olarak yalnızca o sayfadaki satır sayısını döndürür; toplam sınır alınamaz.
  // Sayfa doluysa sıradaki sayfa istenir; boş, yinelenen ya da uzak uçtan gelmeyen sayfada durulur.
  if (source === "bizimhesap" && first.remote) {
    let lastFull = first.rows.length === perPage;
    let next = 2;
    while (lastFull && invoices.length < max) {
      const b = await fetchPage(next).catch(() => null);
      if (!b || !b.remote) break;
      let added = 0;
      b.rows.forEach((r) => {
        if (!seen.has(String(r.id))) {
          seen.add(String(r.id));
          invoices.push(r);
          added += 1;
        }
      });
      if (added === 0) break;
      lastFull = b.rows.length === perPage;
      next += 1;
    }
    return { invoices, total: invoices.length };
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

// Web paneliyle aynı sıra: kayıtlı kaynak, etkin muhasebe programı, ilk bağlı kaynak. BizimHesap ve BenimPOS gelen faturayı desteklemez.
export async function resolveIncomingSource(token: string): Promise<{ source: IncomingSource | null; connected: IncomingSource[]; benimposOnly: boolean }> {
  const [acc, turkcell, saved] = await Promise.all([
    request<any>("/settings/accounting", { method: "GET" }, token).catch(() => null),
    request<any>("/turkcell-efatura/status", { method: "GET" }, token).catch(() => null),
    request<any>("/settings/incoming-einvoice-source", { method: "GET" }, token).catch(() => null),
  ]);
  // Faz A M7: BenimPOS gelen e-fatura kaynağı değil (sunucu boş döner); kural ./incoming-source (saf, birim testli).
  return incomingSources(acc, turkcell, saved);
}

export async function getIncomingInvoices(token: string, source: IncomingSource, page = 1) {
  const perPage = 30;
  if (source === "turkcell-efatura") {
    const d = await request<any>(`/turkcell-efatura/inbox?page=${page}&page_size=${perPage}`, { method: "GET" }, token);
    return paged<IncomingInvoice>(d, "items", page, perPage);
  }
  if (source === "parasut") {
    // Sunucu "total" olarak Paraşüt'teki gerçek toplamı değil, o ana dek önbelleğe yazdığı satır sayısını döndürür ve
    // uzaktan yalnızca istenen sayfayı çeker. Bu yüzden toplam sınır alınmaz: sayfa doluysa devamı vardır; sonraki
    // sayfalar force_sync ile istenir ki sunucu o sayfayı Paraşüt'ten çekip önbelleğe yazsın (boş sayfada durulur).
    const sync = page > 1 ? "&force_sync=1" : "";
    const d = await request<any>(`/parasut/incoming-e-invoices?page=${page}&per_page=${perPage}${sync}`, { method: "GET" }, token);
    const res = paged<IncomingInvoice>(d, "invoices", page, perPage);
    return { ...res, hasMore: res.items.length >= perPage };
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


// F2 — web DashboardPage: GET /dashboard/recent-orders?limit (sunucu kayıt tarihine göre sıralar; düz Order dizisi).
export async function getRecentOrders(token: string, limit = 5) {
  const d = await request<any>(`/dashboard/recent-orders?limit=${limit}`, { method: "GET" }, token);
  return (Array.isArray(d) ? d : []) as Order[];
}

// F3 — web Header: POST /support/notifications/mark-read (destek yanıtlarını sunucuda okundu sayar; başka cihazda da düşer).
export async function markSupportNotificationsRead(token: string) {
  return request<{ success?: boolean; updated?: number }>("/support/notifications/mark-read", { method: "POST" }, token);
}

// ---------------------------------------------------------------------------
// Uzun oturum bağdaştırıcısı (docs/pm/tasarim/mobil-oturum-push.md). Sunucu alan adları sözleşme gelince burada kesinleşir;
// uygulamanın geri kalanı yalnız { access, refresh } ile çalışır.
// ---------------------------------------------------------------------------
export type SessionTokens = { access: string; refresh: string | null; trusted?: string | null };

export function sessionTokensOf(data: any): SessionTokens | null {
  const access = data?.access_token || data?.token;
  if (typeof access !== "string" || !access) return null;
  const refresh = typeof data?.refresh_token === "string" && data.refresh_token ? data.refresh_token : null;
  // Güvenilir cihaz belirteci (yalnız kalan süresi kısalınca ya da girişte gelir).
  const trusted = typeof data?.trusted_device_token === "string" && data.trusted_device_token ? data.trusted_device_token : null;
  return { access, refresh, trusted };
}

// Yenileme: her kullanımda yenileme anahtarı değişir; yenisi saklanır. Ortak request() kullanılmaz (401 döngüsü olmasın).
export async function refreshSession(refreshToken: string): Promise<SessionTokens> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, app_version: String(Constants.expoConfig?.version || "") }),
    });
  } catch {
    throw { message: "Sunucuya bağlanılamıyor.", status: 0 } as ApiError;
  }
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw { message: "Oturum yenilenemedi.", status: res.status, code: typeof data?.code === "string" ? data.code : typeof data?.detail?.code === "string" ? data.detail.code : undefined } as ApiError;
  const t = sessionTokensOf(data);
  if (!t) throw { message: "Oturum yenilenemedi.", status: 500 } as ApiError;
  return { access: t.access, refresh: t.refresh || refreshToken, trusted: t.trusted };
}

// ---------------------------------------------------------------------------
// Mobil oturum + push (docs/pm/tasarim/mobil-oturum-push.md). Giriş uçları Bearer'sız; 404/405 → eski /auth/login'e düşülür.
// ---------------------------------------------------------------------------
export async function mobileRequestCode(body: Record<string, unknown>) {
  return request<any>("/auth/mobile/login/request-code", { method: "POST", body: JSON.stringify(body) });
}
export async function mobileVerifyCode(body: Record<string, unknown>) {
  return request<any>("/auth/mobile/login/verify-code", { method: "POST", body: JSON.stringify(body) });
}

// Çıkış: oturum ailesi ve bu cihazın push kaydı sunucuda silinir. Ortak request() kullanılmaz (401 döngüsü olmasın);
// hata yutulur, en çok 4 sn beklenir. Süresi dolmuş erişim anahtarı da kabul edilir; gövdedeki refresh_token yeterlidir.
export async function logoutSession(accessToken: string | null, body: { refresh_token?: string | null; push_token?: string | null; forget_device?: boolean }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}), ...(body.push_token ? { push_token: body.push_token } : {}), forget_device: body.forget_device === true }),
      signal: ctrl.signal,
    });
  } catch {
    // Ağ hatası: yerel çıkış yine tamamlanır.
  } finally {
    clearTimeout(timer);
  }
}

export async function registerMobilePush(token: string, body: Record<string, unknown>) {
  return request<{ ok?: boolean; active?: boolean }>("/mobile/push-tokens", { method: "POST", body: JSON.stringify(body) }, token);
}

export type MobileSession = { id: string; device_name?: string; platform?: string; app_version?: string; created_at?: string; last_used_at?: string; ip_hint?: string; expires_at?: string; current?: boolean };
export async function getMobileSessions(token: string) {
  const d = await request<any>("/auth/sessions", { method: "GET" }, token);
  return (Array.isArray(d?.sessions) ? d.sessions : []) as MobileSession[];
}
export async function deleteMobileSession(token: string, id: string) {
  return request<any>(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}
export async function revokeOtherSessions(token: string) {
  return request<{ success?: boolean; revoked?: number }>("/auth/sessions/revoke-others", { method: "POST", body: "{}" }, token);
}

export type NotificationPrefs = {
  new_order: boolean;
  sound: boolean;
  time_sensitive: boolean;
  show_amount: boolean;
  quiet_hours: { enabled: boolean; start: string; end: string; timezone?: string };
  muted_channels: string[];
  available_channels?: { key: string; label: string }[];
  registered_devices?: number;
  orders_view_allowed?: boolean;
};
export async function getNotificationPrefs(token: string) {
  return request<NotificationPrefs>("/mobile/notification-preferences", { method: "GET" }, token);
}
export async function patchNotificationPrefs(token: string, patch: Partial<NotificationPrefs>) {
  return request<NotificationPrefs>("/mobile/notification-preferences", { method: "PATCH", body: JSON.stringify(patch) }, token);
}
export async function sendPushTest(token: string) {
  return request<{ ok?: boolean; devices?: number }>("/mobile/push-test", { method: "POST", body: "{}" }, token);
}

// D-30: ekip üyesi yetkileri (herkes çağırabilir). Firma sahibinde is_owner true, permissions ["*"].
export async function getTeamMe(token: string) {
  return request<{ is_owner?: boolean; company_name?: string; module_access?: Record<string, string>; permissions?: string[]; member?: any }>(
    "/team/me",
    { method: "GET" },
    token
  );
}
