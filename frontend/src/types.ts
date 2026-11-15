export type User = {
  id: string;
  email: string;
  company_name: string;
  full_name: string;
  role?: string;
  permissions?: string[];
  subscription_plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type Integration = {
  id: string;
  name: string;
  provider: string;
  status: string;
  // Sunucudaki tür: store, marketplace, cargo, accounting.
  kind?: string;
};

export type Order = {
  id: string;
  channel: string;
  channel_order_id: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  status: string;
  order_date?: string;
  created_at?: string;
  updated_at?: string;

  // Integration metadata
  integration_id?: string;
  integration_provider?: string;
  provider?: string;

  // WooCommerce
  wc_status?: string;

  // Trendyol
  trendyol_status?: string;
  trendyol_order_number?: string;
  trendyol_package_id?: string;

  // Hepsiburada
  hepsiburada_status?: string;
  hepsiburada_order_number?: string;
  hb_package_number?: string;
  hb_package_id?: string;

  // Kargo / Shipping
  cargo_provider?: string;
  cargo_barcodes?: { barcode?: string }[];
  cargo_error_message?: string;
  n11_cargo_tracking?: string;
  cargo_status?: string;
  cargo_tracking?: string;
  cargo_tracking_number?: string;
  cargoTrackingNumber?: string;
  cargo_company_name?: string;
  shipping_address?: string;
  tracking_number?: string;
  trackingNumber?: string;
  tracking_code?: string;
  trackingCode?: string;
  awb?: string;
  waybill_no?: string;
  waybillNo?: string;
  kargo_takip_no?: string;
  kargoTakipNo?: string;
  shipment?: {
    tracking_number?: string;
    tracking_code?: string;
    trackingNumber?: string;
  };
  shipping?: {
    tracking_number?: string;
    trackingNumber?: string;
  };
  cargo?: {
    tracking_number?: string;
    trackingNumber?: string;
  };
  meta?: {
    tracking_number?: string;
    trackingNumber?: string;
  };
  metadata?: Array<{ key: string; value: string }> | { tracking_number?: string; trackingNumber?: string };
  meta_data?: Array<{ key: string; value: string }>;

  items?: Array<{
    product_name?: string;
    name?: string;           // some providers use `name` instead of `product_name`
    product_id?: string;
    sku?: string;
    barcode?: string;
    image_url?: string;
    image?: string;
    images?: Array<{ url?: string; src?: string } | string>;
    url?: string;
    src?: string;
    secure_url?: string;
    thumbnail?: string;
    pictureUrl?: string;
    picture_url?: string;
    picture?: string;
    img?: string;
    imageUrl?: string;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    price?: number;          // Trendyol/N11 may use `price` instead of `unit_price`
    trendyol_line_id?: string;
    vat_rate?: number | null;
  }>;
};

export type Invoice = {
  id: string;
  description?: string;
  issue_date?: string;
  due_date?: string;
  invoice_no?: string;
  invoice_series?: string;
  net_total?: string | number;
  gross_total?: string | number;
  display_gross_total?: string | number;
  total_vat?: string | number;
  currency?: string;
  status?: string;
  archived?: boolean;
  order_no?: string;
  order_date?: string;
  billing_address?: string;
  tax_number?: string;
  contact_name?: string;
  platform?: string;
  platform_provider?: string;
  parasut_url?: string | null;
  can_officialize?: boolean;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    tax_office?: string;
    tax_number?: string;
    city?: string;
    district?: string;
    address?: string;
  };
  details?: Array<{
    id?: string;
    product_name?: string;
    quantity?: number | string;
    unit_price?: number | string;
    net_total?: number | string;
    vat_rate?: number | string;
  }>;
};

export type ReportsOverview = {
  period_days?: number;
  total_revenue?: number;
  total_orders?: number;
  average_order_value?: number;
  status_breakdown?: Array<{ status: string; count: number }>;
  daily_sales?: Array<{ date: string; label?: string; revenue: number; orders: number }>;
  channel_breakdown?: Array<{ provider: string; label: string; revenue: number; orders: number }>;
  // Tekil alanlar yalnız TRY; diğer birimlerin cirosu ayrı (toplanmaz).
  other_currencies?: Array<{ currency: string; revenue: number; orders: number }>;
};

export type HepsiJetManualCustomer = {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  city?: string;
  town?: string;
  district?: string;
  address_line?: string;
  postal_code?: string;
  notes?: string;
};

export type HepsiJetManualShipment = {
  id: string;
  customer_id: string;
  barcode?: string;
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_city?: string;
  customer_town?: string;
  customer_district?: string;
  customer_address_line?: string;
  reference_no?: string;
  notes?: string;
  desi?: number;
  total_parcels?: number;
  total_desi?: number;
  created_at?: string;
  updated_at?: string;
  last_tracked_at?: string;
  customer?: HepsiJetManualCustomer;
};

export type OfferLineItem = {
  id: string;
  description?: string;
  quantity?: number | string;
  unit_price?: number | string;
  net_total?: number | string;
  vat_rate?: number | string;
  discount_type?: string;
  discount_value?: number | string;
};

export type SalesOffer = {
  id: string;
  description?: string;
  issue_date?: string;
  due_date?: string;
  net_total?: number | string;
  gross_total?: number | string;
  currency?: string;
  status?: string;
  contact_id?: string;
  contact_name?: string;
  contact_email?: string;
  line_items?: OfferLineItem[];
  computed_total_discount?: number | string;
};

export type OfferPayment = {
  exists: boolean;
  payment_url?: string;
  woo_order_id?: number;
  status?: string;
  contact_email?: string;
  email_sent?: boolean;
};

export type DashboardStats = {
  total_orders: number;
  pending_orders: number;
  shipped_orders: number;
  total_revenue: number;
  total_products: number;
  low_stock_count: number;
  orders_today: number;
  revenue_today: number;
};

export type SalesChartPoint = { date: string; total: number; count: number };

export type SmartAlert = {
  type: string;
  severity: "warning" | "error" | "info" | string;
  title: string;
  desc?: string;
  action_label?: string;
  action_path?: string;
};

export type OrdersPage = { items: Order[]; total: number; page: number; totalPages: number };

export type ChannelRef = { id: string; name: string; platform: string };

export type CatalogProduct = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  image_url?: string;
  // Satılabilir stok (kanala giden sayı). Aşama 3 P2: ayrılmış = stoğu düşülmüş, kargoya verilmemiş siparişler;
  // elde = satılabilir + ayrılmış. Sunucu göndermezse ayrılmış 0, elde = stok sayılır.
  stock: number;
  reserved?: number;
  onHand?: number;
  price: number;
  // `pending`: kanalın onayını bekleyen girilen değer (yoksa null); stock/price onaylı değerdir.
  channelStocks: { integration_id: string; stock: number; active?: boolean; pending?: number | null }[];
  channelPrices: { integration_id: string; price: number; active?: boolean; pending?: number | null }[];
};

export type SyncJob = {
  id: string;
  product_name?: string;
  sku?: string;
  provider?: string;
  provider_label?: string;
  integration_name?: string;
  status: string;
  message?: string;
  timestamp?: string;
  retryable?: boolean;
};

export type FinanceOverview = {
  cash_balance: number;
  receivable: number;
  overdue_receivable: number;
  payable: number;
  overdue_payable: number;
  month_cash_in: number;
  month_cash_out: number;
  // TL dışında para biriminde alacak/borç var mı.
  multiCurrency?: boolean;
  today?: string;
  upcoming: { kind: "receivable" | "payable"; date?: string | null; amount: number; currency?: string; title?: string; reference?: string }[];
};

export type CashAccount = {
  id: string;
  name: string;
  account_type?: string;
  currency?: string;
  balance: number;
  bank_name?: string;
  iban?: string;
  is_default?: boolean;
  is_active?: boolean;
  active?: boolean;
  archived?: boolean;
  is_deleted?: boolean;
};

export type CashEntry = {
  id: string;
  entry_type: "income" | "expense" | "transfer_in" | "transfer_out" | string;
  amount: number;
  entry_date?: string;
  category?: string;
  description?: string;
  counterparty_name?: string;
  running_balance?: number;
  related_account_name?: string;
};

export type Party = {
  id: string;
  name?: string;
  company_name?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  source?: "registered" | "orders" | string;
  balance: number;
  // Carinin para birimi; bakiye bu para biriminde tutulur (boşsa TL).
  currency?: string;
  contact_role?: string;
};

export type PartyLedgerRow = {
  id: string; date?: string; description?: string; reference?: string; debit?: number; credit?: number; balance?: number; currency?: string; reversed?: boolean; due_date?: string;
  // Aşama 4 / P11: tahsilat satırında düzenle / sil (yalnız sunucunun actions'ına göre).
  source?: string;
  actions?: { edit?: boolean; void?: boolean } | null;
  collection?: import("./collection-actions").Collection | null;
  // 13 Kas 2026 K9: virman satırı (kind "adjustment"); düzenle/sil actions'a göre.
  transfer?: import("./api-finans").CustomerTransfer | null;
  kind?: string;
};

export type LocalInvoice = {
  id: string;
  invoice_number?: string;
  invoice_type?: string;
  status?: string;
  display_status?: string;
  is_overdue?: boolean;
  money_state?: "overdue" | "pending" | "settled" | "not_issued" | "refund";
  customer_name?: string;
  issue_date?: string;
  due_date?: string;
  currency?: string;
  subtotal?: number;
  discount_amount?: number;
  vat_amount?: number;
  total?: number;
  paid_amount?: number;
  remaining_amount?: number;
  notes?: string;
  items?: { name?: string; description?: string; product_id?: string | null; product_name?: string; quantity?: number; unit_price?: number; vat_rate?: number; total?: number; line_total?: number }[];
  payments?: {
    id?: string; amount?: number; date?: string; method?: string; notes?: string; account_id?: string;
    source?: string; void_op?: unknown; parasut_sync_state?: string; parasut_synced?: boolean; parasut_sync_error?: string; parasut_out_of_sync?: boolean;
  }[];
  parasut_item_type?: string;
  parasut_invoice_id?: string;
  // Toplu sürüm 1 (G2): fatura ismi, tahsil edilecek tutar (tevkifat/stopaj düşülmüş), resmileşme alanları.
  document_name?: string | null;
  payable_amount?: number;
  edocument_type?: string;
  source?: string;
  // Düzenleme formu için cari alanları ve resmileştirme kilidi.
  customer_id?: string | null;
  customer_tax_no?: string;
  customer_tax_office?: string;
  customer_address?: string;
  officialize_lock?: unknown;
  edoc_state?: string;
  edoc_error?: string;
};

export type ExpenseInvoice = {
  id: string;
  invoice_no?: string;
  description?: string;
  supplier_name?: string;
  issue_date?: string;
  due_date?: string;
  gross_total?: number | string;
  currency?: string;
  status?: string;
};

export type IncomingSource = "parasut" | "benimpos" | "turkcell-efatura";

export type IncomingInvoice = {
  id: string;
  invoice_no?: string;
  sender_name?: string;
  sender_tax_no?: string;
  issue_date?: string;
  gross_total?: number | string;
  currency?: string;
  status?: string;
  import_status?: string;
  // Geri alınmış faturayı yeniden içeri alma izni (yalnız sunucu söyler).
  import_reimportable?: boolean;
  // PDF için sağlayıcı kimliği (gelen kutusunda native_id; eski listede id ile aynı).
  pdf_id?: string;
  // D-17 gelen kutusu satırı (src/inbox-ui.ts inboxRow): durum metni, tür, içeri alma durumu, arşiv, kabul/red.
  inbox_row?: boolean;
  statusText?: string | null;
  statusKind?: "success" | "info" | "warning" | "error" | "neutral";
  type_label?: string | null;
  importLabel?: string | null;
  importedElsewhere?: boolean;
  archived?: boolean;
  can_respond?: boolean;
  response_request?: { decision?: string; state?: string; requested_at?: string | null; message?: string | null } | null;
};

export type SupportTicket = {
  id: string;
  ticket_code?: string;
  topic?: string;
  subject?: string;
  status?: string;
  last_message_preview?: string;
  last_message_at?: string;
  unread_from_support?: boolean | number;
};

export type SupportMessage = { id: string; sender_role?: "user" | "super" | "system" | string; sender_name?: string; message?: string; created_at?: string };

export type TrialStatus = {
  plan?: string;
  is_trial?: boolean;
  billing_cycle?: string;
  expires_at?: string | null;
  days_left?: number | null;
  subscription_status?: string;
  // 13 Kas 2026 sözleşmesi (docs/mobil-oturum-icin-notlar.md).
  renewal?: { kind?: "trial" | "subscription"; phase?: "none" | "window" | "expired" | "suspended"; can_renew?: boolean; window_days?: number; days_left?: number; expires_at?: string | null } | null;
  usage?: Record<string, number> | null;
  limits?: Record<string, number> | null;
};

export type UsageSummary = {
  limits?: Record<string, number>;
  usage?: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Web eşitleme (gider, cari, gelen kutusu) — src/api-gider.ts
// ---------------------------------------------------------------------------

// GET /ui-capabilities → capabilities (backend/routers/ui_capabilities.py). Alan yoksa ya da bool değilse KAPALI.
export type UiCapabilities = {
  inboxRead: boolean;
  expenseLedger: boolean;
  manualEntry: boolean;
  manualEntryReason: string | null;
  parasutView: boolean;
  parasutConnected: boolean;
  payablePayment: boolean;
  // Aşama 3 P3: stok sahibi (obihub | accounting) ve program; okunamazsa null.
  inventoryOwner: { owner: "obihub" | "accounting"; program: string | null } | null;
};

// GET /accounting/expense-invoices satırı (backend domain/accounting/read_model.py PurchaseInvoiceItem.to_dict).
// Tutarlar sunucuda Decimal dizedir; burada sayıya çevrilmiş hâlidir. `total` KDV dışı vergileri (other_levies) içerir.
export type ExpenseLedgerRow = {
  id: string;
  supplier_name?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total: number | null;
  remaining: number | null;
  currency?: string | null;
  payment_status?: string;
  reversed?: boolean;
  source_kind?: string;
};

export type ExpenseSummaryRow = { currency: string; payable: number; overdue: number };

export type PartyActions = { view_ledger: boolean; view_orders: boolean; edit: boolean; delete: boolean; collect: boolean };

// Cari listesi satırı: okuma modeli (/accounting/read-model/parties) ya da eski uç (/customers) aynı biçime çevrilir.
export type PartyView = Party & {
  // "read_model": yeni okuma modeli; "customers": eski uç (okuma modeli 404 döndü).
  origin: "read_model" | "customers";
  // `source`: okuma modelinde "obihub" | "legacy"; eski uçta "registered" | "orders".
  actions: PartyActions;
  balanceAvailable: boolean;
};
