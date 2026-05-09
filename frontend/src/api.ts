// Premium ObiHub API client targeting api.obihub.app/api by default.
// Override via EXPO_PUBLIC_OBIHUB_API_URL env if needed.

import type {
  HepsiJetManualCustomer,
  HepsiJetManualShipment,
  Integration,
  Invoice,
  LoginResponse,
  Order,
  ReportsOverview,
  User,
} from "./types";

export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_OBIHUB_API_URL && String(process.env.EXPO_PUBLIC_OBIHUB_API_URL)) ||
  "https://api.obihub.app/api";

type ApiError = { message: string; status: number };

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err: ApiError = {
      message: data?.detail || data?.message || `HTTP ${res.status}`,
      status: res.status,
    };
    throw err;
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

export async function getShippingLabel(token: string, orderId: string) {
  return request<{ success?: boolean; data?: string; format?: string }>(
    `/orders/${orderId}/shipping-label`,
    { method: "GET" },
    token
  );
}

export async function createHepsiJetShipment(token: string, orderId: string) {
  return request<{ success?: boolean; message?: string; barcode?: string }>(
    `/hepsijet/create-shipment/${orderId}`,
    { method: "POST" },
    token
  );
}

export async function getHepsiJetLabel(token: string, barcode: string) {
  return request<{ success?: boolean; data?: string; format?: string }>(
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

export async function getHepsiJetLabelWithProducts(token: string, orderId: string, barcode: string) {
  const qs = new URLSearchParams();
  qs.set("barcode", barcode);
  return request<{ success?: boolean; data?: string; format?: string }>(
    `/hepsijet/label-with-products/${orderId}?${qs.toString()}`,
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

export async function getSalesReportsOverview(token: string, periodDays = 30) {
  const payload = await request<any>(`/reports/overview?period_days=${periodDays}`, { method: "GET" }, token);
  const channel_breakdown = Array.isArray(payload?.channel_breakdown)
    ? payload.channel_breakdown.map((x: any) => ({
        provider: x?.provider ?? x?.channel ?? "-",
        label: x?.label ?? x?.provider ?? x?.channel ?? "-",
        revenue: Number(x?.revenue ?? x?.amount ?? 0),
        orders: Number(x?.orders ?? x?.count ?? 0),
      }))
    : [];
  const daily_sales = Array.isArray(payload?.daily_sales)
    ? payload.daily_sales.map((x: any) => ({
        date: String(x?.date ?? "-"),
        revenue: Number(x?.revenue ?? x?.amount ?? 0),
        orders: Number(x?.orders ?? x?.count ?? 0),
      }))
    : [];
  return {
    ...payload,
    total_revenue: Number(payload?.total_revenue ?? payload?.revenue ?? 0),
    total_orders: Number(payload?.total_orders ?? payload?.orders ?? 0),
    average_order_value: Number(payload?.average_order_value ?? payload?.avg_order ?? 0),
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
  return request<any>(`/${prefix}/${integrationId}/sync-orders?days=${Math.max(1, days)}`, { method: "POST" }, token);
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
  return request<HepsiJetManualCustomer>(
    `/hepsijet/manual/customers`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
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
  payload: { customer_id: string; total_parcels?: number; total_desi?: number; note?: string }
) {
  return request<HepsiJetManualShipment>(
    `/hepsijet/manual/shipments`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function getHepsiJetManualShipmentLabel(token: string, shipmentId: string) {
  return request<{ success?: boolean; data?: string; data_base64?: string; format?: string; message?: string }>(
    `/hepsijet/manual/shipments/${shipmentId}/label`,
    { method: "GET" },
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
