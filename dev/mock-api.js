// Faz 0 doğrulaması için sahte ObiHub API'si. Yalnızca yerel test; gerçek veri içermez.
// Davranış: GET /__mode?session=ok|expired|locked&parasut=1|0
const http = require("http");

const state = { session: "ok", parasut: "1" };
const now = () => new Date().toISOString();

const NAMES = ["Ayşe Yılmaz", "Mehmet Demir", "Elif Kaya", "Can Öztürk", "Zeynep Arslan", "Burak Şahin", "Selin Aydın"];
const CHANNELS = [
  { integration_id: "i1", provider: "woocommerce", prefix: "WC" },
  { integration_id: "i2", provider: "trendyol", prefix: "TY" },
  { integration_id: "i3", provider: "hepsiburada", prefix: "HB" },
];
const STATUSES = ["pending", "processing", "shipped", "shipped", "delivered", "delivered", "delivered", "cancelled"];
const orders = Array.from({ length: 74 }, (_, i) => {
  const ch = CHANNELS[i % CHANNELS.length];
  const when = new Date(Date.now() - i * 5 * 3600 * 1000).toISOString();
  return {
    id: `o${i + 1}`,
    channel: ch.provider,
    integration_id: ch.integration_id,
    integration_provider: ch.provider,
    channel_order_id: `${ch.prefix}-${1000 + i}`,
    customer_name: NAMES[i % NAMES.length],
    total_amount: Math.round((149.9 + ((i * 137) % 2400)) * 100) / 100,
    currency: "TRY",
    status: STATUSES[i % STATUSES.length],
    order_date: when,
    created_at: when,
    items: [{ product_name: "Deneme Ürün", sku: `SKU-${i}`, quantity: 1 + (i % 3), unit_price: 149.9 }],
  };
});

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname.replace(/^\/api/, "");
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (url.pathname === "/__mode") {
      for (const k of ["session", "parasut"]) if (url.searchParams.get(k)) state[k] = url.searchParams.get(k);
      return send(res, 200, state);
    }
    console.log(req.method, path, JSON.stringify(state));
    const user = { id: "u1", email: "test@example.test", company_name: "Deneme A.Ş.", full_name: "Deneme Kullanıcı" };
    if (path === "/auth/login") return send(res, 200, { access_token: "test-token", token_type: "bearer", user });
    if (state.session === "expired") return send(res, 401, { detail: "Token süresi dolmuş" });
    if (path === "/auth/me") return send(res, 200, user);
    if (state.session === "locked")
      return send(res, 403, { detail: "Abonelik erişimi pasif. Aboneliğinizin süresi doldu. Devam etmek için paketinizi yenileyin." });
    if (path === "/settings/accounting")
      return send(res, 200, state.parasut === "1"
        ? { provider: "parasut", parasut: { connected: true, status: "connected" }, bizimhesap: null }
        : { provider: "bizimhesap", parasut: null, bizimhesap: { connected: true } });
    if (path === "/orders") {
      const q = url.searchParams;
      const page = Number(q.get("page") || 1);
      const per = Number(q.get("per_page") || 15);
      const search = (q.get("search") || "").toLocaleLowerCase("tr-TR");
      let rows = orders.filter(
        (o) =>
          (!q.get("status") || o.status === q.get("status")) &&
          (!q.get("integration_id") || o.integration_id === q.get("integration_id")) &&
          (!search || o.customer_name.toLocaleLowerCase("tr-TR").includes(search) || o.channel_order_id.toLowerCase().includes(search))
      );
      const total = rows.length;
      rows = rows.slice((page - 1) * per, page * per);
      return send(res, 200, { items: rows, total, page, per_page: per, total_pages: Math.max(1, Math.ceil(total / per)) });
    }
    if (path.startsWith("/orders/")) return send(res, 200, orders.find((o) => path.endsWith("/" + o.id)) || orders[0]);
    if (path === "/dashboard/stats")
      return send(res, 200, {
        total_orders: orders.length,
        pending_orders: orders.filter((o) => ["pending", "processing"].includes(o.status)).length,
        shipped_orders: orders.filter((o) => o.status === "shipped").length,
        total_revenue: 184250.4, total_products: 320, low_stock_count: 4, orders_today: 5, revenue_today: 6480.75,
      });
    if (path === "/dashboard/sales-chart") {
      const days = Number(url.searchParams.get("days") || 7);
      return send(res, 200, Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
        total: 3200 + ((i * 977) % 5200), count: 4 + ((i * 3) % 9),
      })));
    }
    if (path === "/dashboard/smart-alerts")
      return send(res, 200, [
        { type: "low_stock", severity: "warning", title: "4 ürün düşük stokta", desc: "Stok seviyesi 5 adedin altına düşen ürünler var.", action_path: "/stok" },
        { type: "stale_orders", severity: "warning", title: "2 sipariş 3 gündür bekliyor", desc: "Beklemede olan siparişleri kontrol edin.", action_path: "/siparisler" },
      ]);
    if (path === "/integrations") return send(res, 200, [
      { id: "i1", name: "Deneme Mağaza", provider: "woocommerce", status: "active" },
      { id: "i2", name: "Trendyol", provider: "trendyol", status: "active" },
      { id: "i3", name: "Hepsiburada", provider: "hepsiburada", status: "active" },
    ]);
    if (path === "/parasut/invoices")
      return send(res, 200, { invoices: Array.from({ length: 6 }, (_, i) => ({
        id: `inv${i}`, invoice_no: `OBI2026${String(100 + i)}`, issue_date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
        gross_total: 1200 + i * 310.5, contact_name: NAMES[i % NAMES.length], can_officialize: i % 2 === 0,
      })), total: 6, page: 1, per_page: 600 });
    if (path === "/parasut/sales-offers") return send(res, 200, { offers: [], total: 0 });
    if (path === "/reports/overview") return send(res, 200, { summary: { total_revenue: 84250, total_orders: 212, avg_order_value: 397.4 }, channels: [], timeline: [] });
    if (path === "/parasut/product-stock") return send(res, 200, { products: [] });
    if (path === "/push-token") return send(res, 200, { ok: true });
    return send(res, 200, {});
  })
  .listen(8799, () => console.log("mock api on 8799"));
