// Faz 0 doğrulaması için sahte ObiHub API'si. Yalnızca yerel test; gerçek veri içermez.
// Davranış: GET /__mode?session=ok|expired|locked&parasut=1|0
const http = require("http");

const state = { session: "ok", parasut: "1" };
const now = () => new Date().toISOString();

const orders = [
  { id: "o1", channel: "woocommerce", integration_id: "i1", integration_provider: "woocommerce", channel_order_id: "WC-1001", customer_name: "Test Müşteri", total_amount: 1250.5, status: "processing", order_date: now(), created_at: now(), items: [{ product_name: "Deneme Ürün", quantity: 2, unit_price: 625.25 }] },
  { id: "o2", channel: "trendyol", integration_id: "i2", integration_provider: "trendyol", channel_order_id: "TY-2002", customer_name: "İkinci Müşteri", total_amount: 349.9, status: "shipped", order_date: now(), created_at: now(), items: [] },
];

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
    if (path === "/orders") return send(res, 200, { items: orders, total: orders.length, page: 1, per_page: 100, total_pages: 1 });
    if (path.startsWith("/orders/")) return send(res, 200, orders.find((o) => path.endsWith(o.id)) || orders[0]);
    if (path === "/integrations") return send(res, 200, [{ id: "i1", name: "Deneme Mağaza", provider: "woocommerce", status: "active" }]);
    if (path === "/parasut/product-stock") return send(res, 200, { products: [] });
    if (path === "/push-token") return send(res, 200, { ok: true });
    return send(res, 200, {});
  })
  .listen(8799, () => console.log("mock api on 8799"));
