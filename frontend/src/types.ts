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
  items?: Array<{
    product_name?: string;
    sku?: string;
    image_url?: string;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
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
};

export type HepsiJetManualShipment = {
  id: string;
  customer_id: string;
  barcode?: string;
  status?: string;
  total_parcels?: number;
  total_desi?: number;
  created_at?: string;
  customer?: HepsiJetManualCustomer;
};
