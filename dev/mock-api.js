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

const products = Array.from({ length: 48 }, (_, i) => ({
  id: `p${i + 1}`, name: `Deneme Ürün ${i + 1}`, sku: `SKU-${i + 1}`, barcode: `86900000${String(i + 1).padStart(5, "0")}`,
  stock: (i * 7) % 40, price: 99.9 + i * 12.5,
  ch: { i1: { stock: (i * 7) % 40, price: 109.9 + i * 12.5 }, i2: { stock: (i * 5) % 30, price: 119.9 + i * 12.5 } },
}));

const accounts = [
  { id: "a1", name: "Nakit Kasa", account_type: "cash", currency: "TRY", balance: 12450.75, is_default: true },
  { id: "a2", name: "Garanti Ticari", account_type: "bank", currency: "TRY", balance: 86320.1, bank_name: "Garanti BBVA" },
];
const entries = [
  { id: "e1", account_id: "a1", entry_type: "income", amount: 1250, entry_date: "2026-11-10", description: "Nakit satış" },
  { id: "e2", account_id: "a1", entry_type: "expense", amount: 380.5, entry_date: "2026-11-09", description: "Kargo malzemesi" },
];
const parties = [
  { id: "c1", name: "Elif Kaya", phone: "0555 111 22 33", source: "registered", balance: 6200, payments: [] },
  { id: "c2", name: "Can Öztürk", email: "can@example.test", source: "registered", balance: 12850.5, payments: [] },
  { id: "c3", name: "Tedarikçi A.Ş.", source: "registered", balance: -9400, payments: [] },
  { id: "e:ayse@example.test", name: "Ayşe Yılmaz", source: "orders", balance: 0, payments: [] },
];
const localInvoices = [
  { id: "li1", invoice_number: "OBI2026101", status: "gecikti", display_status: "gecikti", customer_name: "Elif Kaya", issue_date: "2026-10-20", due_date: "2026-11-05", currency: "TRY", subtotal: 5166.67, discount_amount: 0, vat_amount: 1033.33, total: 6200, paid_amount: 0, remaining_amount: 6200, payments: [], parasut_invoice_id: "ps0", items: [{ name: "Deneme Ürün 3", quantity: 4, unit_price: 1291.67, vat_rate: 20, total: 6200 }] },
  { id: "li2", invoice_number: "", status: "taslak", display_status: "taslak", customer_name: "Can Öztürk", issue_date: "2026-11-10", due_date: "2026-11-22", currency: "TRY", subtotal: 10708.75, discount_amount: 0, vat_amount: 2141.75, total: 12850.5, paid_amount: 0, remaining_amount: 12850.5, payments: [], items: [{ name: "Deneme Ürün 9", quantity: 10, unit_price: 1070.88, vat_rate: 20, total: 12850.5 }], notes: "Teslimat 15 Kasım." },
];
const tickets = [
  { id: "t1", ticket_code: "DST-00001234", topic: "Entegrasyon", subject: "Trendyol siparişleri gecikiyor", status: "waiting_customer", last_message_preview: "Mağaza kimliğinizi paylaşır mısınız?", last_message_at: new Date().toISOString(), unread_from_support: true,
    messages: [
      { id: "m1", sender_role: "user", message: "Trendyol siparişleri 20 dakika gecikmeyle geliyor.", created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: "m2", sender_role: "super", sender_name: "ObiHub Destek", message: "Mağaza kimliğinizi paylaşır mısınız?", created_at: new Date(Date.now() - 3600000).toISOString() },
    ] },
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
    if (path === "/parasut/product-stock" || path === "/parasut/product-prices") {
      const q = (url.searchParams.get("search") || "").replace(/\\\\/g, "").toLowerCase();
      const page = Number(url.searchParams.get("page") || 1);
      const per = Number(url.searchParams.get("per_page") || 25);
      const rows = products.filter((p) => !q || [p.name, p.sku, p.barcode].some((v) => v.toLowerCase().includes(q)));
      const slice = rows.slice((page - 1) * per, page * per);
      const integrations = [{ id: "i1", name: "Deneme Mağaza", platform: "woocommerce" }, { id: "i2", name: "Trendyol", platform: "trendyol" }];
      if (path.endsWith("stock"))
        return send(res, 200, { products: slice.map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, stock: p.stock, image_url: "", integration_stocks: [{ integration_id: "i1", stock: p.ch.i1.stock, active: true }, { integration_id: "i2", stock: p.ch.i2.stock, active: true }] })), integrations, total: rows.length, page, per_page: per });
      return send(res, 200, { products: slice.map((p) => ({ id: p.id, price: p.price.toFixed(2), integration_prices: [{ integration_id: "i1", price: p.ch.i1.price.toFixed(2), active: true }, { integration_id: "i2", price: p.ch.i2.price.toFixed(2), active: true }] })), integrations, total: rows.length, page, per_page: per });
    }
    if (req.method === "POST" && ["/stock/adjust", "/stock/channel-set", "/price/adjust", "/price/channel-set"].includes(path)) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        const p = products.find((x) => x.id === b.product_id);
        if (!p) return send(res, 404, { detail: "Ürün bulunamadı" });
        if (path === "/stock/adjust") p.stock = b.quantity;
        if (path === "/price/adjust") p.price = b.price;
        if (path === "/stock/channel-set") p.ch[b.integration_id].stock = b.stock;
        if (path === "/price/channel-set") p.ch[b.integration_id].price = b.price;
        console.log("WRITE", path, raw);
        send(res, 200, { message: "ok" });
      });
      return;
    }
    if (path === "/integration-jobs")
      return send(res, 200, { items: [
        { id: "j1", product_name: "Deneme Ürün 3", sku: "SKU-3", provider_label: "Trendyol", integration_name: "Trendyol", status: "failed", message: "Barkod Trendyol'da zaten kayıtlı.", timestamp: new Date().toISOString(), retryable: true },
        { id: "j2", product_name: "Deneme Ürün 7", sku: "SKU-7", provider_label: "WooCommerce", integration_name: "Deneme Mağaza", status: "failed", message: "Bağlantı zaman aşımına uğradı.", timestamp: new Date().toISOString(), retryable: false },
      ], total: 2, page: 1, per_page: 25 });
    if (path === "/integration-jobs/retry") return send(res, 200, { success: true, attempted: 1, success_count: 1, failed_count: 0 });
    if (path.startsWith("/hepsijet/create-shipment/")) return send(res, 200, { success: true, barcode: "HJ123456789", message: "Gönderi oluşturuldu" });
    if (path === "/push-token") return send(res, 200, { ok: true });
    // --- Finans, cari, kasa, faturalar
    const today = new Date().toISOString().slice(0, 10);
    const readBody = (cb) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { console.log("WRITE", path, raw); cb(JSON.parse(raw || "{}")); }); };
    if (path === "/finance/overview")
      return send(res, 200, { cash_balance: accounts.reduce((n, a) => n + a.balance, 0), receivable: 42850.5, overdue_receivable: 6200, payable: 18400, overdue_payable: 0, month_cash_in: 91200, month_cash_out: 37400, today,
        upcoming: [
          { kind: "receivable", date: "2026-11-05", amount: 6200, currency: "TRY", title: "Elif Kaya", reference: "OBI2026101" },
          { kind: "payable", date: "2026-11-18", amount: 9400, currency: "TRY", title: "Tedarikçi A.Ş.", reference: "GF-88" },
          { kind: "receivable", date: "2026-11-22", amount: 12850.5, currency: "TRY", title: "Can Öztürk", reference: "OBI2026104" },
        ] });
    if (path === "/finance/accounts") return send(res, 200, { items: accounts });
    if (path.startsWith("/finance/accounts/")) {
      const acc = accounts.find((a) => path.endsWith("/" + a.id));
      if (!acc) return send(res, 404, { detail: "Hesap bulunamadı" });
      return send(res, 200, { account: acc, items: entries.filter((e) => e.account_id === acc.id), total: entries.length });
    }
    if (path === "/finance/entries" && req.method === "POST")
      return readBody((b) => {
        const acc = accounts.find((a) => a.id === b.account_id);
        if (!acc) return send(res, 404, { detail: "Hesap bulunamadı" });
        acc.balance += b.entry_type === "income" ? b.amount : -b.amount;
        entries.unshift({ id: "e" + Date.now(), account_id: acc.id, entry_type: b.entry_type, amount: b.amount, entry_date: b.entry_date, description: b.description });
        send(res, 200, { ok: true });
      });
    if (path === "/customers")
      return send(res, 200, { items: parties.filter((p) => { const q = (url.searchParams.get("search") || "").toLowerCase(); const bs = url.searchParams.get("balance_status"); return (!q || p.name.toLowerCase().includes(q)) && (!bs || (bs === "receivable" ? p.balance > 0 : p.balance < 0)); }), total: parties.length, page: 1, per_page: 30, total_pages: 1, summary: { total_receivable: 19050.5, total_payable: 9400 } });
    const partyMatch = path.match(/^\/customers\/([^/]+)\/(ledger|payments)$/);
    if (partyMatch) {
      const party = parties.find((p) => p.id === partyMatch[1]);
      if (!party) return send(res, 404, { detail: "Müşteri bulunamadı" });
      if (partyMatch[2] === "ledger")
        return send(res, 200, { balance: party.balance, items: [
          ...party.payments.map((pay, i) => ({ id: "pay" + i, date: today, description: "Tahsilat", credit: pay, balance: party.balance })),
          { id: "l1", date: "2026-11-02", description: "Satış faturası OBI2026101", debit: 6200, balance: 6200 },
        ] });
      return readBody((b) => { party.balance -= b.amount; party.payments.unshift(b.amount); send(res, 200, { id: "pm" + Date.now(), amount: b.amount }); });
    }
    if (path === "/local-invoices/summary") return send(res, 200, { total_remaining: localInvoices.reduce((n, i) => n + i.remaining_amount, 0), overdue_amount: 6200, overdue_count: 1 });
    if (path === "/local-invoices") {
      const st = url.searchParams.get("status");
      const rows = localInvoices.filter((i) => !st || i.status === st);
      return send(res, 200, { items: rows, total: rows.length, page: 1, per_page: 30, total_pages: 1 });
    }
    const invMatch = path.match(/^\/local-invoices\/([^/]+)(?:\/(payment|resmilestir))?$/);
    if (invMatch) {
      const inv = localInvoices.find((i) => i.id === invMatch[1]);
      if (!inv) return send(res, 404, { detail: "Fatura bulunamadı" });
      if (!invMatch[2]) return send(res, 200, inv);
      if (invMatch[2] === "resmilestir") { inv.status = inv.display_status = "resmilesti"; inv.parasut_invoice_id = "ps1"; return send(res, 200, { ok: true, message: "Fatura resmileşti", edoc_state: "done" }); }
      return readBody((b) => {
        if (b.amount > inv.remaining_amount + 0.004) return send(res, 400, { detail: "Tutar kalan borçtan büyük olamaz" });
        inv.paid_amount += b.amount; inv.remaining_amount -= b.amount; inv.payments.push({ id: "p" + Date.now(), amount: b.amount, date: b.date, method: b.method });
        if (inv.remaining_amount < 0.005) inv.status = inv.display_status = "odendi";
        send(res, 200, { ok: true, remaining_amount: inv.remaining_amount, status: inv.status });
      });
    }
    if (path === "/parasut/expense-invoices")
      return send(res, 200, { invoices: [{ id: "x1", invoice_no: "GF-88", supplier_name: "Tedarikçi A.Ş.", issue_date: "2026-11-03", due_date: "2026-11-18", gross_total: 9400, currency: "TRL", status: "unpaid" }], total: 1, page: 1, per_page: 30 });
    if (path === "/turkcell-efatura/status") return send(res, 200, { connected: false });
    if (path === "/settings/incoming-einvoice-source") return send(res, 200, { source: null });
    if (path === "/parasut/incoming-e-invoices")
      return send(res, 200, { invoices: [
        { id: "in1", invoice_no: "ABC2026000123", sender_name: "Kargo Lojistik A.Ş.", issue_date: "2026-11-09", gross_total: 1840.6, currency: "TRL", import_status: "none" },
        { id: "in2", invoice_no: "XYZ2026000456", sender_name: "Ambalaj Ltd.", issue_date: "2026-11-07", gross_total: 3275, currency: "TRL", import_status: "applied" },
      ], total: 2, page: 1, per_page: 30 });
    if (path === "/support/tickets" && req.method === "GET") return send(res, 200, { items: tickets, total: tickets.length, page: 1, per_page: 30 });
    if (path === "/support/tickets" && req.method === "POST")
      return readBody((b) => {
        if (String(b.message || "").length < 8) return send(res, 422, { detail: "Mesaj çok kısa" });
        const t = { id: "t" + Date.now(), ticket_code: "DST-" + String(Date.now()).slice(-8), topic: b.topic, subject: b.subject || b.topic, status: "open", last_message_preview: b.message, last_message_at: new Date().toISOString(), messages: [{ id: "m" + Date.now(), sender_role: "user", message: b.message, created_at: new Date().toISOString() }] };
        tickets.unshift(t);
        send(res, 200, { success: true, ticket_id: t.id, ticket_code: t.ticket_code });
      });
    const tMatch = path.match(/^\/support\/tickets\/([^/]+)(\/messages)?$/);
    if (tMatch) {
      const t = tickets.find((x) => x.id === tMatch[1]);
      if (!t) return send(res, 404, { detail: "Talep bulunamadı" });
      if (!tMatch[2]) return send(res, 200, { ticket: t, messages: t.messages });
      return readBody((b) => { t.messages.push({ id: "m" + Date.now(), sender_role: "user", message: b.message, created_at: new Date().toISOString() }); send(res, 200, { success: true }); });
    }
    if (path === "/billing/trial-status") return send(res, 200, { plan: "pro", is_trial: false, billing_cycle: "monthly", expires_at: "2026-12-04T00:00:00Z", days_left: 23, subscription_status: "active" });
    if (path === "/usage/summary") return send(res, 200, { limits: { integrations: 5, products: 5000, orders_monthly: 3000 }, usage: { integrations: 3, products: 48, orders_monthly: 212 } });
    return send(res, 200, {});
  })
  .listen(8799, () => console.log("mock api on 8799"));
