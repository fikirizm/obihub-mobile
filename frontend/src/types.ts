export type User = {
  id: string;
  email: string;
  company_name: string;
  full_name: string;
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
  daily_sales?: Array<{ date: string; revenue: number; orders: number }>;
  channel_breakdown?: Array<{ provider: string; label: string; revenue: number; orders: number }>;
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
