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
    cargo_status: null,
    cargo_tracking: null,
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
      for (const k of ["session", "parasut", "stock409", "autoprint"]) if (url.searchParams.get(k)) state[k] = url.searchParams.get(k);
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
    if (path === "/orders/stats") {
      const iid = url.searchParams.get("integration_id");
      const rows = orders.filter((o) => !iid || o.integration_id === iid);
      const n = (st) => rows.filter((o) => o.status === st).length;
      return send(res, 200, {
        total: rows.length, pending: n("pending"), processing: n("processing"), shipped: n("shipped"),
        delivered: n("delivered"), cancelled: n("cancelled"), deleted: n("deleted"), needs_invoice: 0,
      });
    }
    // Sipariş/etiket/mağaza web eşitlemesi (src/api-siparis.ts).
    if (/^\/orders\/[^/]+\/product-label\/pdf$/.test(path)) {
      const pdf = "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 283 425]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
      res.writeHead(200, { "Content-Type": "application/pdf", "Access-Control-Allow-Origin": "*" });
      return res.end(pdf);
    }
    if (req.method === "PATCH" && /^\/orders\/[^/]+$/.test(path)) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const o = orders.find((x) => path.endsWith("/" + x.id));
        if (!o) return send(res, 404, { detail: "Sipariş bulunamadı" });
        const next = JSON.parse(raw || "{}").status;
        if (next) o.status = next;
        if (next === "cancelled" && state.stock409 === "1")
          return send(res, 409, { detail: "Sipariş durumu güncellendi ancak stok iadesi yapılamadı: deneme" });
        send(res, 200, o);
      });
    }
    if (req.method === "POST" && path.startsWith("/print-jobs/enqueue/"))
      return send(res, 200, state.autoprint === "0" ? { success: false, message: "Auto print kapalı veya kullanıcı yetkili değil." } : { success: true, job_id: "j1", status: "pending" });
    if (req.method === "POST" && /\/sync-orders$/.test(path)) return send(res, 200, { success: true, message: "Senkronizasyon tamamlandı", count: 0, total_fetched: 0 });
    if (req.method === "POST" && path === "/orders/resync-dates") return send(res, 200, { success: true, updated: 0, total: 0 });
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
        { type: "low_stock", severity: "warning", title: `${products.filter((p) => p.stock >= 0 && p.stock <= 5).length} ürün düşük stokta`, desc: "Stok seviyesi 5 adedin altına düşen ürünler var.", action_path: "/stok" },
        { type: "stale_orders", severity: "warning", title: "2 sipariş 3 gündür bekliyor", desc: "Beklemede olan siparişleri kontrol edin.", action_path: "/siparisler" },
      ]);
    if (path === "/integrations") return send(res, 200, [
      { id: "i1", name: "Deneme Mağaza", provider: "woocommerce", kind: "store", status: "success" },
      { id: "i2", name: "Trendyol", provider: "trendyol", kind: "marketplace", status: "success" },
      { id: "i3", name: "Hepsiburada", provider: "hepsiburada", kind: "marketplace", status: "failed" },
      { id: "i4", name: "HepsiJet", provider: "hepsijet", kind: "cargo", status: "success" },
    ]);
    if (path === "/parasut/invoices")
      return send(res, 200, { invoices: Array.from({ length: 6 }, (_, i) => ({
        id: `inv${i}`, invoice_no: `OBI2026${String(100 + i)}`, issue_date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
        gross_total: 1200 + i * 310.5, contact_name: NAMES[i % NAMES.length], can_officialize: i % 2 === 0,
      })), total: 6, page: 1, per_page: 600 });
    if (path === "/parasut/sales-offers") return send(res, 200, { offers: [], total: 0 });
    if (path === "/reports/overview") {
      // Gerçek sunucu gibi: since_date'ten bugüne, sipariş tarihine göre; 30 güne kadar günlük kova.
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let b = {};
        try { b = JSON.parse(raw || "{}"); } catch {}
        const since = b.since_date ? Date.parse(`${String(b.since_date).slice(0, 10)}T00:00:00Z`) : Date.now() - (Number(b.period_days) || 30) * 86400000;
        const days = Math.max(1, Math.floor((Date.now() - since) / 86400000) + 1);
        const hit = orders.filter((o) => Date.parse(o.order_date) >= since);
        const buckets = {};
        const chans = {};
        for (const o of hit) {
          const key = days <= 30 ? o.order_date.slice(0, 10) : o.order_date.slice(0, 7);
          buckets[key] = buckets[key] || { key, label: key, revenue: 0, orders: 0 };
          buckets[key].revenue += o.total_amount;
          buckets[key].orders += 1;
          chans[o.channel] = chans[o.channel] || { provider: o.channel, integration_id: o.integration_id, name: o.channel, revenue: 0, orders: 0 };
          chans[o.channel].revenue += o.total_amount;
          chans[o.channel].orders += 1;
        }
        const total = hit.reduce((n, o) => n + o.total_amount, 0);
        send(res, 200, {
          period_days: days,
          summary: { total_revenue: total, total_orders: hit.length, avg_order_value: hit.length ? total / hit.length : 0 },
          timeline: Object.values(buckets).sort((x, y) => x.key.localeCompare(y.key)),
          channels: Object.values(chans).sort((x, y) => y.revenue - x.revenue),
          top_products: [],
        });
      });
      return;
    }
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
    // Ürün kimliği (ad / SKU / barkod) ve stok hareketleri — gerçek uçlar: GET|PATCH /products/{id}, GET /stock/movements.
    const prodMatch = path.match(/^\/products\/([^/]+)$/);
    if (prodMatch && (req.method === "GET" || req.method === "PATCH")) {
      const p = products.find((x) => x.id === decodeURIComponent(prodMatch[1]));
      if (!p) return send(res, 404, { detail: "Ürün bulunamadı" });
      const view = () => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, stock: p.stock, price: p.price });
      if (req.method === "GET") return send(res, 200, view());
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        for (const k of ["name", "sku", "barcode"]) if (typeof b[k] === "string") p[k] = b[k];
        console.log("WRITE", path, raw);
        send(res, 200, view());
      });
      return;
    }
    if (req.method === "GET" && path === "/stock/movements") {
      const pid = url.searchParams.get("product_id") || "";
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
      const skip = Math.max(0, Number(url.searchParams.get("skip") || 0));
      const n = Number(pid.replace(/\D/g, "")) || 0;
      // Ürüne göre değişen sayıda satır: p3 → boş, diğerleri 4–45 hareket.
      const count = n % 3 === 0 ? 0 : 4 + ((n * 13) % 42);
      const kinds = [["in", "Mal kabul"], ["out", "Sipariş stok düşümü"], ["adjustment", "Manuel güncelleme"], ["out", "Trendyol siparişi"]];
      const all = Array.from({ length: count }, (_, i) => ({
        id: `sm-${pid}-${i}`, user_id: "u1", product_id: pid, movement_type: kinds[i % 4][0], quantity: 1 + ((i * 3) % 12),
        reason: kinds[i % 4][1], reference_id: null, created_at: new Date(Date.now() - i * 5400000).toISOString(),
      }));
      return send(res, 200, all.slice(skip, skip + limit));
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
        // Gerçek sunucu, ürünü silinmiş ve iletisi olmayan kayıtlarda "-" yer tutucusu döndürür.
        { id: "j3", product_name: "-", sku: "", provider_label: "Hepsiburada", integration_name: "Hepsiburada", status: "failed", message: "-", timestamp: new Date().toISOString(), retryable: false },
      ], total: 3, page: 1, per_page: 25 });
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
          { kind: "payable", date: null, undated: true, amount: 1850, currency: "TRY", title: "Kırtasiye Ltd.", reference: "GF-91", source: "obihub" },
        ] });
    // Yeni hesap ve virman (gerçek uçlar: backend/routers/finance.py create_account, create_transfer)
    if (path === "/finance/accounts" && req.method === "POST")
      return readBody((b) => {
        if (!String(b.name || "").trim()) return send(res, 400, { detail: "Hesap adı zorunludur" });
        const acc = { id: "a" + Date.now(), name: String(b.name).trim(), account_type: b.account_type || "cash", currency: String(b.currency || "TRY").toUpperCase(), opening_balance: Number(b.opening_balance || 0), balance: Number(b.opening_balance || 0), bank_name: b.bank_name || "", iban: b.iban || "", is_default: false };
        accounts.push(acc);
        send(res, 200, acc);
      });
    if (path === "/finance/transfers" && req.method === "POST")
      return readBody((b) => {
        if (b.from_account_id === b.to_account_id) return send(res, 400, { detail: "Kaynak ve hedef hesap farklı olmalıdır" });
        const src = accounts.find((a) => a.id === b.from_account_id);
        const dst = accounts.find((a) => a.id === b.to_account_id);
        if (!src || !dst) return send(res, 404, { detail: "Transfer hesaplarından biri bulunamadı" });
        if ((src.currency || "TRY") !== (dst.currency || "TRY")) return send(res, 400, { detail: "Farklı para birimleri arasında transfer için kur bilgisi gerekir" });
        const tid = "tr" + Date.now();
        src.balance -= b.amount; dst.balance += b.amount;
        const outgoing = { id: tid + "o", account_id: src.id, entry_type: "transfer_out", amount: b.amount, entry_date: b.entry_date, description: b.description || "Hesaplar arası transfer", related_account_name: dst.name };
        const incoming = { id: tid + "i", account_id: dst.id, entry_type: "transfer_in", amount: b.amount, entry_date: b.entry_date, description: b.description || "Hesaplar arası transfer", related_account_name: src.name };
        entries.unshift(outgoing, incoming);
        send(res, 200, { transfer_id: tid, outgoing, incoming });
      });
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
    // Yeni cari (gerçek uç: backend/routers/customers.py create_customer)
    if (path === "/customers" && req.method === "POST")
      return readBody((b) => {
        if (!String(b.name || "").trim()) return send(res, 400, { detail: "Müşteri adı zorunludur" });
        const party = { id: "c" + Date.now(), name: String(b.name).trim(), phone: b.phone || "", email: b.email || "", tax_no: b.tax_no || "", tax_office: b.tax_office || "", address: b.address || "", contact_role: b.contact_role || "customer", source: "registered", currency: "TRY", opening_balance: Number(b.opening_balance || 0), balance: Number(b.opening_balance || 0), payments: [] };
        parties.push(party);
        send(res, 200, { ...party, balance: 0, pos_sales_count: 0, pos_sales_total: 0 });
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
    // Yeni satış faturası: her zaman taslak açılır, tutarlar kalemlerden hesaplanır (backend/routers/local_invoices.py create_invoice)
    if (path === "/local-invoices" && req.method === "POST")
      return readBody((b) => {
        if (!Array.isArray(b.items) || b.items.length === 0) return send(res, 400, { detail: "Faturada en az bir satır olmalı" });
        const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
        const items = b.items.map((it) => ({ ...it, line_total: r2(Number(it.quantity) * Number(it.unit_price) * (1 - Number(it.discount_percent || 0) / 100)) }));
        const subtotal = r2(items.reduce((n, it) => n + it.line_total, 0));
        const vat = r2(items.reduce((n, it) => n + (it.line_total * Number(it.vat_rate || 0)) / 100, 0));
        const inv = { id: "li" + Date.now(), invoice_number: `FTR-${new Date().getFullYear()}-${String(localInvoices.length + 1).padStart(4, "0")}`, invoice_type: "satis", status: "taslak", display_status: "taslak", is_overdue: false, customer_id: b.customer_id || null, customer_name: b.customer_name, issue_date: b.issue_date, due_date: b.due_date, currency: b.currency || "TRY", notes: b.notes || "", items, subtotal, discount_amount: 0, vat_amount: vat, total: r2(subtotal + vat), paid_amount: 0, remaining_amount: r2(subtotal + vat), payments: [] };
        localInvoices.unshift(inv);
        send(res, 200, inv);
      });
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
    // Web eşitleme (src/api-gider.ts): yetenekler, gider ayarı, ObiHub gider defteri. Okuma modeli ve gelen kutusu 404 → eski uçlara düşüş.
    if (path === "/ui-capabilities")
      return send(res, 200, { version: 1, capabilities: { obihub_os: false, inbox_read: false, payable_payment: true, expense_ledger: true, expense_manual_entry: true, manual_entry_reason: null, parasut_connected: true, parasut_expense_view: true }, workspace_scope: null });
    if (path === "/accounting/expense-settings") return send(res, 200, { expense_module_enabled: true, parasut_expense_view_enabled: true, parasut_connected: true });
    if (path === "/accounting/expense-invoices/summary") return send(res, 200, { currencies: [{ currency: "TRY", payable: "9400.00", overdue: "1250.50" }] });
    if (path === "/accounting/expense-invoices") {
      const rows = [
        { id: "obihub:e1", source: "obihub", supplier_name: "Kargo Lojistik A.Ş.", document_number: "ABC2026000123", issue_date: "2026-11-09", due_date: "2026-11-24", total: "1840.60", currency: "TRY", payment_status: "pending", reversed: false, other_levies: null, remaining: "1840.60", source_kind: "import" },
        { id: "obihub:e2", source: "obihub", supplier_name: "Ofis Kırtasiye", document_number: "OK-77", issue_date: "2026-10-20", due_date: "2026-11-01", total: "1250.50", currency: "TRY", payment_status: "overdue", reversed: false, other_levies: "50.00", remaining: "1250.50", source_kind: "manual" },
        { id: "legacy:p1", source: "legacy", supplier_name: "Ambalaj Ltd.", document_number: "XYZ2026000456", issue_date: "2026-10-07", due_date: null, total: "3275.00", currency: "TRY", payment_status: "paid", reversed: false, other_levies: null, remaining: "0.00", source_kind: "legacy" },
      ];
      const pay = url.searchParams.get("payment");
      const sets = { open: ["pending", "partial", "overdue"], overdue: ["overdue"], paid: ["paid"] };
      const out = rows.filter((r) => !pay || (sets[pay] || []).includes(r.payment_status));
      return send(res, 200, { items: out, total: out.length, page: 1, per_page: 20 });
    }
    if (path.startsWith("/accounting/read-model/") || path === "/incoming-inbox") return send(res, 404, { detail: "Not Found" });
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
    if (path === "/referrals/config") return send(res, 200, { allowed_plans: ["starter", "growth", "enterprise"], default_plan: "growth" });
    if (path === "/referrals/generate-link" && req.method === "POST")
      return readBody((b) => {
        if (!["starter", "growth", "enterprise"].includes(b.plan)) return send(res, 400, { detail: "Bu abonelik planı davet için aktif değil." });
        send(res, 200, { success: true, invite_url: "https://app.obihub.com/davet/mock" + Date.now() });
      });
    if (path === "/referrals/invite-email" && req.method === "POST")
      return readBody((b) => {
        if (!["starter", "growth", "enterprise"].includes(b.plan)) return send(res, 400, { detail: "Bu abonelik planı davet için aktif değil." });
        send(res, 200, { success: true, message: "Davet gönderildi.", invite_url: "https://app.obihub.com/davet/mock" + Date.now() });
      });
    if (path === "/billing/trial-status") return send(res, 200, { plan: "pro", is_trial: false, billing_cycle: "monthly", expires_at: "2026-12-04T00:00:00Z", days_left: 23, subscription_status: "active" });
    if (path === "/usage/summary") return send(res, 200, { limits: { integrations: 5, products: 5000, orders_monthly: 3000 }, usage: { integrations: 3, products: 48, orders_monthly: 212 } });
    return send(res, 200, {});
  })
  .listen(8799, () => console.log("mock api on 8799"));
