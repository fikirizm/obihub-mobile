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

// Dalga 1 tohumları: o1 (Woo) HepsiJet barkodlu, o2 (Trendyol) işleme alınmayı bekliyor, o5 (Trendyol) faturalı,
// o8 ve o16 mağazada silinmiş.
Object.assign(orders[0], { cargo_barcodes: [{ barcode: "HJ100200300" }, { barcode: "HJ100200301" }], cargo_tracking: "HJ100200301" });
Object.assign(orders[1], { trendyol_status: "Created" });
// Sipariş ayrıntısı premium turu (PM 13 Kas 2026): o1 müşteri iletişimi + c1 carisiyle eşleşir, ürün görseli, KDV ve indirim;
// o2 (Trendyol) yalnız teslimat adresi (pazaryeri telefon / e-posta göndermez).
Object.assign(orders[0], {
  customer_name: "Elif Kaya", customer_phone: "0555 111 22 33", customer_email: "elif.kaya@example.test",
  shipping_address: "Moda Cad. No:12 D:4\nKadıköy / İstanbul", total_amount: 419.7,
  items: [
    { product_name: "Seramik Kupa", sku: "SKU-1", quantity: 2, unit_price: 149.9, total_price: 299.8, vat_rate: 20, image_url: "http://localhost:8799/__img/urun-1.png" },
    { product_name: "Bambu Altlık", sku: "SKU-2", quantity: 1, unit_price: 149.9, total_price: 149.9, vat_rate: 20, image_url: "http://localhost:8799/__img/urun-2.png" },
  ],
});
Object.assign(orders[1], { shipping_address: "Atatürk Mah. 1203 Sk. No:5\nBornova / İzmir" });
// 13 Kas 2026 sözleşmesi: o1 sunucu dökümü + adres parçaları + fatura adresi; bir "gönderime hazır" ve bir iade (iç durum iptal,
// kanal ham durumu iade) siparişi.
Object.assign(orders[0], {
  shipping_district: "Kadıköy", shipping_city: "İstanbul", shipping_postcode: "34710", shipping_country: "TR",
  billing_address: "Kaya Kozmetik Ltd., Bağdat Cad. 200, Maltepe, İstanbul",
  amount_breakdown: { subtotal: "449.70", shipping: "0.00", discount: "30.00", tax: null, total: "419.70" },
});
orders[9].status = "ready_to_ship";
// Dalga 5a: pazaryeri iade talebi işareti.
orders[1].return_request = { state: "requested", label: "İade talebi", claim_id: "cl1", provider: "trendyol", reason: "Beden uymadı" };
Object.assign(orders[23], { hepsiburada_status: "Returned" });
// backend/order_status.py group_filter ile aynı bölünme (her sipariş tam bir grup).
function orderGroup(o) {
  const raw = [o.trendyol_status, o.hepsiburada_status, o.wc_status, o.n11_status].some((v) => /^(returned|refunded|refund)$/i.test(String(v || "")));
  if (["returned", "refunded"].includes(o.status) || (["cancelled", "deleted"].includes(o.status) && raw)) return "returned";
  if (o.status === "completed") return "delivered";
  if (["ready_to_ship", "shipped", "delivered", "cancelled", "deleted"].includes(o.status)) return o.status;
  return "pending";
}
Object.assign(orders[4], { parasut_invoice_id: "inv1", invoice_number: "OBI2026000123" });
orders[7].status = "deleted";
orders[15].status = "deleted";

const products = Array.from({ length: 48 }, (_, i) => ({
  id: `p${i + 1}`, name: `Deneme Ürün ${i + 1}`, sku: `SKU-${i + 1}`, barcode: `86900000${String(i + 1).padStart(5, "0")}`,
  stock: (i * 7) % 40, price: 99.9 + i * 12.5,
  ch: { i1: { stock: (i * 7) % 40, price: 109.9 + i * 12.5 }, i2: { stock: (i * 5) % 30, price: 119.9 + i * 12.5 } },
  // Dalga 2 / B1: p6 Trendyol'la eşleşmemiş; diğerleri iki mağazaya bağlı.
  links: i === 5 ? { woocommerce: `wc-${i + 1}` } : { woocommerce: `wc-${i + 1}`, trendyol: `ty-${i + 1}` },
  details: i === 5 ? { woocommerce: { integration_id: "i1" } } : { woocommerce: { integration_id: "i1" }, trendyol: { integration_id: "i2", barcode: `86900000${String(i + 1).padStart(5, "0")}` } },
}));
products[0].images = ["https://picsum.photos/seed/obi1/300", "https://picsum.photos/seed/obi2/300"];
products[0].image_url = products[0].images[0];
// Trendyol mağaza ürünleri (source-products): p6 için barkodu aynı olan aday ve barkodu farklı bir aday.
const tySource = [
  { id: "ty-6", name: "Deneme Ürün 6 (Trendyol)", sku: "SKU-6", barcode: "8690000000006" },
  { id: "ty-6b", name: "Deneme Ürün 6 – Kırmızı", sku: "SKU-6-K", barcode: "8690000099906" },
  ...Array.from({ length: 30 }, (_, i) => ({ id: `ty-x${i}`, name: `Trendyol Ürünü ${i + 1}`, sku: `TY-${i + 1}`, barcode: `86999${String(i).padStart(8, "0")}` })),
];

// D-15 (/__mode?kasa=1): gruplu liste, arşiv, imleçli hareketler, açılış tarihi öncesi satırlar.
const kasaExtra = [
  { id: "prs-77", name: "Paraşüt Akbank", account_type: "bank", currency: "TRY", balance: 4200, group: "parasut", read_only: true, mirror: { provider: "parasut", synced_at: "2026-11-15T09:00:00Z" } },
  { id: "a-usd", name: "Dolar Hesabı", account_type: "bank", currency: "USD", balance: 1250, bank_name: "İş Bankası" },
  { id: "a-arch", name: "Eski Banka", account_type: "bank", currency: "TRY", balance: 500, archived: true },
  { id: "a-empty", name: "Boş Kasa", account_type: "cash", currency: "TRY", balance: 0 },
];
const kasaMoves = Array.from({ length: 62 }, (_, i) => {
  const day = 62 - i; // en yeni önce
  const inc = i % 3 !== 0;
  return { id: `mv-${i}`, entry_date: `2026-${day > 31 ? "10" : "11"}-${String(((day - 1) % 31) + 1).padStart(2, "0")}`, entry_type: i % 7 === 0 ? "transfer_out" : inc ? "income" : "expense", direction: i % 7 === 0 ? "out" : inc ? "in" : "out", amount: 100 + i * 5, description: i % 7 === 0 ? "Bankaya aktarım" : inc ? `Satış tahsilatı ${i}` : "Kırtasiye", related_account_name: i % 7 === 0 ? "Garanti Ticari" : "", counterparty_name: inc && i % 2 ? "Deniz Ltd" : "", source: { type: "manual", label: "Elle girilen hareket" }, running_balance: i >= 58 ? null : 12450.75 - i * 40, before_opening: i >= 58 };
});
const accounts = [
  { id: "a1", name: "Nakit Kasa", account_type: "cash", currency: "TRY", balance: 12450.75, is_default: true },
  { id: "a2", name: "Garanti Ticari", account_type: "bank", currency: "TRY", balance: 86320.1, bank_name: "Garanti BBVA", iban: "TR330006100519786457841326" },
  { id: "a3", name: "POS (Kart)", account_type: "pos", currency: "TRY", balance: 0 },
  { id: "a4", name: "Eski Kasa", account_type: "cash", currency: "TRY", balance: 0, is_active: false },
];
// Dalga 3 / C2 gider durumları (detay + ödeme).
const expenseState = {
  "obihub:e1": { supplier: "Kargo Lojistik A.Ş.", doc: "ABC2026000123", kind: "import", total: "1840.60", remaining: 1840.6, levies: "0", status: "pending", payments: [], seenKeys: [] },
  "obihub:e2": { supplier: "Ofis Kırtasiye", doc: "OK-77", kind: "manual", total: "1250.50", remaining: 1250.5, levies: "50.00", status: "overdue", payments: [{ id: "pp-old", date: "2026-10-25", amount: "0.00", currency: "TRY", account_name: "Nakit Kasa", status: "completed" }].slice(1), seenKeys: [] },
};
// Dalga 3 / C1: gelen fatura içeri alma durumları.
const importState = { in2: "applied" };
const remembered = {};
let refreshCalls = 0;
let otpTries = 0;
const notifPrefs = { new_order: true, sound: true, time_sensitive: false, show_amount: true, quiet_hours: { enabled: false, start: "23:00", end: "07:00", timezone: "Europe/Istanbul" },
  muted_channels: [], available_channels: [{ key: "trendyol", label: "Trendyol" }, { key: "hepsiburada", label: "Hepsiburada" }, { key: "woocommerce", label: "WooCommerce" }], registered_devices: 2, orders_view_allowed: true, sound_name: "cha_ching.wav" };
let mobileSessions = [
  { id: "s1", device_name: "iPhone 15", platform: "ios", app_version: "1.1.14", created_at: "2026-11-15T09:00:00Z", last_used_at: "2026-11-15T17:00:00Z", ip_hint: "88.23.•.•", current: true },
  { id: "s2", device_name: "Ofis iPad", platform: "ios", app_version: "1.1.13", created_at: "2026-11-01T09:00:00Z", last_used_at: "2026-11-12T12:00:00Z", ip_hint: "85.10.•.•", current: false },
];
let currentRefresh = null;
const inboxDoc = (k, no, name, tax, date, amt, status, label, extra = {}) => ({ provider: "parasut", document_key: k, native_id: k, ettn: null, invoice_no: no, issue_date: date, supplier: { name, tax_no: tax },
  payable_amount: amt, tax_exclusive_amount: Math.round((amt / 1.2) * 100) / 100, currency: "TRY", provider_status: status, status, status_label: label, response_days_left: null, response_deadline: null,
  type_label: "e-Fatura · Temel", invoice_type_label: "Satış", imported_elsewhere: false, user_state: "new", archived: false, response_request: null, can_respond: false,
  import_status: "none", import_state: "not_imported", import_state_label: "İçeri alınmadı", ...extra });
const inboxDocs = [
  inboxDoc("in1", "ABC2026000123", "Kargo Lojistik A.Ş.", "1111111111", "2026-11-09", 1840.6, "awaiting_response", "Onay bekliyor", { response_days_left: 3, can_respond: true, type_label: "e-Fatura · Ticari",
    import_block: { code: "ACCEPT_REQUIRED", detail: "Önce faturayı kabul edin. Bu ticari fatura onay bekliyor; kabul etmeden gider ve borç olarak içeri alınamaz." } }),
  inboxDoc("in3", "TED2026000777", "Ofis Kırtasiye", "2222222222", "2026-11-12", 412.5, "accepted_basic", "Kabul edildi (temel)"),
  inboxDoc("in4", "PRS2026000010", "Yazılım Ltd.", "3333333333", "2026-11-05", 2400, "accepted_basic", "Kabul edildi (temel)", { import_state: "imported_elsewhere", import_state_label: "Paraşüt'te içeri alındı" }),
  inboxDoc("in5", "RED2026000001", "Hatalı Tedarik", "4444444444", "2026-11-01", 999, "rejected", "Reddedildi"),
  inboxDoc("in6", "ARS2026000002", "Eski Tedarikçi", "5555555555", "2026-10-20", 150, "accepted_basic", "Kabul edildi (temel)", { archived: true }),
];
const posSales = [];
const entryKeys = new Set();
const hjCustomers = [
  { id: "hc1", full_name: "Ayşe Demir", phone: "05551112233", city: "İstanbul", town: "Kadıköy", district: "Moda", address_line: "Moda Cad. 1" },
  ...Array.from({ length: 14 }, (_, i) => ({ id: "hc" + (i + 2), full_name: ["Örnek Butik", "Demo Spor", "Örnek Kafe", "Demo Kırtasiye", "Örnek Ofis", "Demo Lojistik", "Örnek Kozmetik"][i % 7] + " " + (i + 1), phone: "0555000" + String(1000 + i), city: i % 2 ? "Ankara" : "İzmir", town: "Merkez", district: "Örnek Mah.", address_line: "Örnek Sk. " + (i + 1) })),
];
const hjShipments = [];
const entries = [
  { id: "e1", account_id: "a1", entry_type: "income", amount: 1250, entry_date: "2026-11-10", description: "Nakit satış" },
  { id: "e2", account_id: "a1", entry_type: "expense", amount: 380.5, entry_date: "2026-11-09", description: "Kargo malzemesi" },
];
const parties = [
  { id: "c9", name: "Hareketli Cari Ltd.", source: "registered", balance: 0, has_activity: true, payments: [] },
  { id: "c1", name: "Elif Kaya", phone: "0555 111 22 33", source: "registered", balance: 4725, advance: 250, payments: [],
    // P11: cari tahsilatı (faturaya dağıtılmış) — ekstrede düzenle / sil
    collections: [{ id: "cp1", type: "customer", amount: "1500.00", currency: "TRY", date: "2026-11-05", method: "havale", note: "Kasım ödemesi", account_id: "a2", invoices: [{ invoice_id: "li1", invoice_number: "OBI2026101", amount: "1500.00" }], parasut: false }] },
  { id: "c2", name: "Can Öztürk", email: "can@example.test", source: "registered", balance: 12850.5, payments: [] },
  { id: "c3", name: "Tedarikçi A.Ş.", contact_role: "supplier", source: "registered", balance: -9400, payments: [] },
  { id: "e:ayse@example.test", name: "Ayşe Yılmaz", source: "orders", balance: 0, payments: [] },
];
const localInvoices = [
  { id: "li1", invoice_number: "OBI2026101", status: "gecikti", display_status: "gecikti", money_state: "overdue", customer_id: "c1", customer_name: "Elif Kaya", issue_date: "2026-10-20", due_date: "2026-11-05", currency: "TRY", subtotal: 5166.67, discount_amount: 0, vat_amount: 1033.33, total: 6200, paid_amount: 2125, remaining_amount: 4075,
    payments: [{ id: "ip1", amount: 400, date: "2026-11-06", method: "nakit", notes: "Elden", account_id: "a1", parasut_synced: true }, { id: "cp1", amount: 1500, date: "2026-11-05", method: "havale", source: "customer_payment" },
      { id: "ip2", amount: 100, date: "2026-11-07", method: "havale", account_id: "a2", parasut_sync_state: "failed", parasut_sync_error: "Paraşüt hesabı kapalı" },
      { id: "ip3", amount: 50, date: "2026-11-08", method: "nakit", account_id: "a1", parasut_synced: false },
      { id: "ip4", amount: 75, date: "2026-10-25", method: "nakit", account_id: "a1", parasut_sync_state: "not_sent" }], voided_payments: [], parasut_invoice_id: "ps0", items: [{ name: "Deneme Ürün 3", quantity: 4, unit_price: 1291.67, vat_rate: 20, total: 6200 }] },
  { id: "li2", invoice_number: "", status: "taslak", display_status: "taslak", money_state: "not_issued", customer_name: "Can Öztürk", issue_date: "2026-11-10", due_date: "2026-11-22", currency: "TRY", subtotal: 10708.75, discount_amount: 0, vat_amount: 2141.75, total: 12850.5, paid_amount: 0, remaining_amount: 12850.5, payments: [], items: [{ name: "Deneme Ürün 9", quantity: 10, unit_price: 1070.88, vat_rate: 20, total: 12850.5 }], notes: "Teslimat 15 Kasım." },
  // P8: c1'in ikinci açık faturası ve bir taslağı (K4: taslağa dağıtım yok; sahte sunucu taslağı da döndürür, istemci eler)
  { id: "li4", invoice_number: "OBI2026110", status: "gonderildi", display_status: "gonderildi", money_state: "pending", customer_id: "c1", customer_name: "Elif Kaya", issue_date: "2026-11-01", due_date: "2026-11-25", currency: "TRY", subtotal: 750, discount_amount: 0, vat_amount: 150, total: 900, paid_amount: 0, remaining_amount: 900, payments: [], voided_payments: [], items: [{ name: "Deneme Ürün 5", quantity: 1, unit_price: 750, vat_rate: 20, total: 900 }] },
  { id: "li5", invoice_number: "", status: "taslak", display_status: "taslak", money_state: "not_issued", customer_id: "c1", customer_name: "Elif Kaya", issue_date: "2026-11-12", due_date: "2026-11-30", currency: "TRY", subtotal: 100, discount_amount: 0, vat_amount: 20, total: 120, paid_amount: 0, remaining_amount: 120, payments: [], voided_payments: [], items: [] },
  { id: "li3", invoice_number: "OBI2026102", status: "gecikti", display_status: "gonderildi", money_state: "pending", customer_name: "Acme GmbH", issue_date: "2026-11-08", due_date: "2026-12-08", currency: "USD", subtotal: 1000, discount_amount: 0, vat_amount: 200, total: 1200, paid_amount: 0, remaining_amount: 1200, payments: [], items: [{ name: "İhracat", quantity: 1, unit_price: 1000, vat_rate: 20, total: 1200 }] },
];
// Toplu sürüm 1 (G2 §5 örneği): P1 belgesi — ara toplam indirimi, ÖTV/konaklama, tevkifat, stopaj; fatura ismi; Paraşüt'e resmileşmemiş.
// Dalga 2: kesilmiş iade faturası (iade e-belgesi) ve mahsup satırlı fatura.
localInvoices.push({ id: "li8", doc_schema: 1, invoice_number: "IADE2026001", invoice_type: "iade", return_kind: "iade_faturasi", status: "gonderildi", display_status: "gonderildi", money_state: "refund",
  customer_id: "c1", customer_name: "Elif Kaya", issue_date: "2026-11-16", due_date: "2026-11-16", currency: "TRY", subtotal: 100, discount_amount: 0, vat_amount: 20, total: 120, paid_amount: 0, remaining_amount: 0, payments: [], items: [] });
localInvoices.push({ id: "li9", doc_schema: 1, invoice_number: "OBI2026150", invoice_type: "satis", status: "gonderildi", display_status: "gonderildi", money_state: "partial",
  customer_id: "c1", customer_name: "Elif Kaya", issue_date: "2026-11-10", due_date: "2026-11-30", currency: "TRY", subtotal: 1000, discount_amount: 0, vat_amount: 200, total: 1200, paid_amount: 400, remaining_amount: 800,
  payments: [{ id: "pof1", amount: 400, date: "2026-11-15", method: "mahsup", source: "offset", offset_id: "op-offset-0001", parasut_sync_state: "local_only" }], items: [] });
// Dalga 1: resmileşmiş e-Arşiv fatura (e-belge iptali, resmi PDF).
localInvoices.push({ id: "li7", doc_schema: 1, invoice_number: "OBI2026140", invoice_type: "satis", status: "resmilesti", display_status: "resmilesti", money_state: "pending", edoc_state: "done", edoc_type: "e_archive", parasut_invoice_id: "prs-inv-7",
  customer_id: "c1", customer_name: "Elif Kaya", issue_date: "2026-11-15", due_date: "2026-11-30", currency: "TRY", subtotal: 1000, discount_amount: 0, vat_amount: 200, total: 1200, paid_amount: 0, remaining_amount: 1200,
  payments: [], items: [{ line_key: "l-7", product_name: "Danışmanlık", quantity: 1, unit_price: 1000, vat_rate: 20, total: 1200 }], actions: { cancel_edoc: true, official_pdf: true, cancel: true } });
localInvoices.push({ id: "li6", doc_schema: 1, invoice_number: "OBI2026120", document_name: "Kasım danışmanlık", status: "gonderildi", display_status: "gonderildi", money_state: "pending", lifecycle: "issued",
  customer_id: "c2", customer_name: "Can Öztürk", issue_date: "2026-11-14", due_date: "2026-12-14", currency: "TRY", subtotal: 1150, discount_amount: 150, vat_amount: 201.25, other_taxes_total: 2.88,
  withholding_total: 100.63, accommodation_tax_rate: "1", accommodation_tax_total: 11.5, stopaj_rate: "10", stopaj_total: 115, total: 1365.63, payable_amount: 1150, paid_amount: 0, remaining_amount: 1150,
  payments: [], voided_payments: [], items: [{ line_key: "l-aaaaaaaaaaaa", description: "Danışmanlık", quantity: 2, unit_price: 500, vat_rate: 20, line_total: 1035 }, { line_key: "l-bbbbbbbbbbbb", description: "Konaklama paketi", quantity: 1, unit_price: 300, vat_rate: 10, line_total: 319.13 }] });
// WP-21 teklifleri: q1 açık (düzenlenebilir), q2 faturaya çevrilmiş (li6), q3 süresi dolmuş.
localInvoices.push(
  { id: "q1", doc_schema: 1, invoice_type: "teklif", invoice_number: "TKL2026001", document_name: "Yıllık bakım", status: "taslak", quote_outcome: "open", valid_until: "2026-11-30",
    customer_id: "c2", customer_name: "Can Öztürk", issue_date: "2026-11-14", currency: "TRY", subtotal: 1000, discount_amount: 0, vat_amount: 200, total: 1200, paid_amount: 0, remaining_amount: 0,
    items: [{ line_key: "l-q1aaaaaaaaaa", description: "Bakım hizmeti", quantity: 1, unit: "ADET", unit_price: "1000", vat_rate: 20 }], payments: [], voided_payments: [] },
  { id: "q2", doc_schema: 1, invoice_type: "teklif", invoice_number: "TKL2026002", status: "taslak", quote_outcome: "accepted", converted_invoice_id: "li6", valid_until: "2026-11-20",
    customer_id: "c2", customer_name: "Can Öztürk", issue_date: "2026-11-10", currency: "TRY", subtotal: 1150, vat_amount: 201.25, total: 1365.63, items: [], payments: [], voided_payments: [] },
  { id: "q3", doc_schema: 1, invoice_type: "teklif", invoice_number: "TKL2026003", status: "taslak", quote_outcome: "open", valid_until: "2026-11-01",
    customer_name: "Elif Kaya", issue_date: "2026-10-20", currency: "TRY", subtotal: 500, vat_amount: 100, total: 600, items: [], payments: [], voided_payments: [] }
);
const QUOTE_FILTER = {
  open: (q) => !q.converted_invoice_id && (q.quote_outcome || "open") === "open" && !(q.valid_until && q.valid_until < "2026-11-15"),
  accepted: (q) => Boolean(q.converted_invoice_id) || q.quote_outcome === "accepted",
  rejected: (q) => !q.converted_invoice_id && q.quote_outcome === "rejected",
  expired: (q) => !q.converted_invoice_id && (q.quote_outcome === "expired" || ((q.quote_outcome || "open") === "open" && q.valid_until && q.valid_until < "2026-11-15")),
};
// G4-30 ayna denemesi: li4 Paraşüt'ten gelen salt okunur fatura; a2 Paraşüt hesabı.
{ const li4 = localInvoices.find((i) => i.id === "li4"); if (li4) Object.assign(li4, { source_kind: "parasut", read_only: true, mirror: { provider: "parasut", synced_at: "2026-11-15T10:00:00Z", state: "synced" } }); }
{ const a2 = accounts.find((a) => a.id === "a2"); if (a2) Object.assign(a2, { source_kind: "parasut", read_only: true, group: "parasut", actions: { add_movement: false } }); }
const VIEW_FILTER = {
  taslak: (i) => i.status === "taslak",
  kesildi: (i) => !["taslak", "iptal", "resmilesti"].includes(i.status) && i.edoc_state !== "done",
  resmilesti: (i) => i.status === "resmilesti" || i.edoc_state === "done",
  tahsil: (i) => !["taslak", "iptal"].includes(i.status) && i.remaining_amount > 0 && i.money_state !== "overdue",
  gecikmis: (i) => i.money_state === "overdue",
  iptal: (i) => i.status === "iptal" && !i.archived,
  arsiv: (i) => i.archived === true,
};
const payKeys = new Map(); // Aşama 4 P2: tahsilat işlem anahtarları (anahtar → ilk yanıt)
const tickets = [
  { id: "t1", ticket_code: "DST-00001234", topic: "Entegrasyon", subject: "Trendyol siparişleri gecikiyor", status: "waiting_customer", last_message_preview: "Mağaza kimliğinizi paylaşır mısınız?", last_message_at: new Date().toISOString(), unread_from_support: true,
    messages: [
      { id: "m1", sender_role: "user", message: "Trendyol siparişleri 20 dakika gecikmeyle geliyor.", created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: "m2", sender_role: "super", sender_name: "ObiHub Destek", message: "Mağaza kimliğinizi paylaşır mısınız?", created_at: new Date(Date.now() - 3600000).toISOString() },
    ] },
];

const recon = [
  { id: "r1", product_id: "p4", product_name: "Deneme Ürün 4", sku: "SKU-4", program: "bizimhesap", remote_qty: 25, pending_out: 1, expected: 24, observed_stock: 21, diff: 3, status: "open" },
  { id: "r2", product_id: "p5", product_name: "Deneme Ürün 5", sku: "SKU-5", program: "bizimhesap", remote_qty: 20, pending_out: 0, expected: 20, observed_stock: 28, diff: -8, status: "open" },
];
const colKeys = new Map();
const transfers = [];
const trKeys = new Map();
const offers = [
  // Salt okuma Paraşüt teklifi örneği (15 Kas 2026: Paraşüt teklifleri mobilde yalnız görüntülenir).
  { id: "of1", description: "Ekim kampanyası", contact_name: "Elif Kaya", contact_email: "elif@example.test", status: "waiting", issue_date: "2026-10-25", due_date: "2026-11-25", currency: "TRL", net_total: 2400,
    line_items: [{ id: "x1", description: "Paket A", quantity: 2, unit_price: 1000, net_total: 2000 }] },
];
const offerKeys = new Map();
// P11: c1'in tahsilat satırları (cari tahsilatı + li1'in kendi tahsilatı); silinenler ters kayıtla.
function colLedgerRows(party) {
  const today = new Date().toISOString().slice(0, 10);
  const li1 = localInvoices.find((i) => i.id === "li1");
  const rows = [];
  const own = [...li1.payments, ...li1.voided_payments].filter((p) => p.source !== "customer_payment");
  for (const c of party.collections) {
    const col = { type: "customer", id: c.id, customer_id: party.id, amount: c.amount, currency: "TRY", date: c.date, method: c.method, note: c.note, account_id: c.account_id, allocated_amount: c.amount, invoices: c.invoices, parasut: false };
    rows.push({ id: "col-" + c.id, date: c.date, description: "Tahsilat (" + c.method + ")", credit: Number(c.amount), currency: "TRY", source: "customer_payment", reversed: Boolean(c.voided), actions: c.voided ? { edit: false, void: false } : { edit: true, void: true }, collection: c.voided ? null : col });
    if (c.voided) rows.push({ id: "rev-" + c.id, date: today, description: "Ters kayıt: tahsilat iptal edildi", debit: Number(c.amount), currency: "TRY", reversed: true, actions: null, collection: null });
  }
  for (const p of own) {
    const col = { type: "invoice", id: p.id, customer_id: party.id, invoice_id: "li1", invoice_number: "OBI2026101", amount: String(Number(p.amount).toFixed(2)), currency: "TRY", date: p.date, method: p.method, note: p.notes || "", account_id: p.account_id, parasut: Boolean(p.parasut_synced) };
    rows.push({ id: "col-" + p.id, date: p.date, description: "Fatura tahsilatı OBI2026101", credit: Number(p.amount), currency: "TRY", source: "invoice_payment", reversed: Boolean(p.voided), actions: p.voided ? { edit: false, void: false } : { edit: true, void: true }, collection: p.voided ? null : col });
    if (p.voided) rows.push({ id: "rev-" + p.id, date: today, description: "Ters kayıt: fatura tahsilatı iptal edildi", debit: Number(p.amount), currency: "TRY", reversed: true, actions: null, collection: null });
  }
  return rows;
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
  res.end(demoText(JSON.stringify(body)));
}

// Pazarlama ekran görüntüleri için demo modu (/__mode?demo=1): yanıtlardaki kişi, firma, mağaza ve ürün adları
// "Demo / Örnek" adlarla değişir. Veri yapısı ve tutarlar aynı kalır.
const DEMO_PRODUCTS = ["Seramik Kupa", "Pamuk Havlu", "Bambu Kesme Tahtası", "Cam Saklama Kabı", "Keten Masa Örtüsü", "Termos Matara", "Ahşap Servis Tabağı", "Aromalı Mum", "Örgü Battaniye", "Bakır Cezve"];
const DEMO_MAP = [
  ["Ayşe Yılmaz", "Örnek Butik"], ["Mehmet Demir", "Demo Kırtasiye"], ["Elif Kaya", "Örnek Kozmetik"], ["Can Öztürk", "Demo Elektronik Ltd."],
  ["Zeynep Arslan", "Örnek Ev Tekstili"], ["Burak Şahin", "Demo Spor"], ["Selin Aydın", "Örnek Kafe"], ["Acme GmbH", "Demo Export GmbH"],
  ["Tedarikçi A.Ş.", "Örnek Tedarik A.Ş."], ["Acme Ticaret A.Ş.", "Örnek Toptan A.Ş."], ["Acar Lojistik", "Demo Lojistik"],
  ["Kargo Lojistik A.Ş.", "Demo Kargo A.Ş."], ["Ofis Kırtasiye", "Örnek Ofis"], ["Ambalaj Ltd.", "Demo Ambalaj Ltd."],
  ["Deneme Kullanıcı", "Demo Ticaret A.Ş."], ["Deneme A.Ş.", "Demo Ticaret A.Ş."], ["Deneme Mağaza", "Demo Mağaza"],
];
function demoText(text) {
  if (state.demo !== "1") return text;
  let t = text.replace(/Deneme Ürün ?(\d*)/g, (_, n) => `Örnek ${DEMO_PRODUCTS[(Number(n || 1) - 1) % DEMO_PRODUCTS.length]}`);
  for (const [a, b] of DEMO_MAP) t = t.split(a).join(b);
  return t.replace(/test@example\.test/g, "demo@obihub.app");
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname.replace(/^\/api/, "");
    if (req.method === "OPTIONS") return send(res, 204, {});
    // Canlıyla aynı: HepsiJet entegrasyon kaydı değil, ayar (user_settings.hepsijet). /__mode?hj=0 → kurulu değil; hj=err → 500.
    if (path === "/hepsijet/config") {
      if (state.hj === "err") return send(res, 500, { detail: "Sunucu hatası" });
      return send(res, 200, state.hj === "0" ? { configured: false } : { configured: true, username: "demo", company_name: "Örnek Butik", integration_id: "i1", integration_name: "WooCommerce" });
    }
    // Deneme ürün görselleri (dev/img); dış görsel servisine bağımlı kalınmaz.
    const imgHit = url.pathname.match(/^\/__img\/([a-z0-9-]+\.png)$/);
    if (imgHit) {
      try {
        const buf = require("fs").readFileSync(require("path").join(__dirname, "img", imgHit[1]));
        res.writeHead(200, { "Content-Type": "image/png", "Access-Control-Allow-Origin": "*" });
        return res.end(buf);
      } catch {
        return send(res, 404, { detail: "yok" });
      }
    }
    if (url.pathname === "/__mode") {
      for (const k in remembered) delete remembered[k];
      for (const k of ["session", "parasut", "stock409", "autoprint", "payFail", "posFail", "entryFail", "ieEmpty", "posAccts", "posPending", "colFail", "psFail", "psCaps", "curMismatch", "offerFail", "pwWeak", "demo", "loginErr", "hj", "ledgerBlock", "subDays", "subOld", "iaGate", "iaKurus", "iaOwner", "inbox", "expire", "otp", "member", "kasa"]) if (url.searchParams.get(k)) state[k] = url.searchParams.get(k);
      return send(res, 200, state);
    }
    console.log(req.method, path, JSON.stringify(state));
    const user = { id: "u1", email: "test@example.test", company_name: "Deneme A.Ş.", full_name: "Deneme Kullanıcı" };
    // Giriş hata kodları: /__mode?loginErr=invalid|suspended|expired|locked (kalıcı; 0 ile kapanır)
    if (path === "/auth/login" && state.loginErr && state.loginErr !== "0") {
      const E = { invalid: [401, "INVALID_CREDENTIALS", "E-posta veya şifre hatalı"], suspended: [403, "ACCOUNT_SUSPENDED", "Abonelik erişimi duraklatıldı."], expired: [403, "SUBSCRIPTION_EXPIRED", "Aboneliğinizin süresi doldu."], locked: [429, "LOGIN_LOCKED", "Çok fazla deneme."] }[state.loginErr];
      if (E) {
        res.writeHead(E[0], { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "Retry-After", ...(E[0] === 429 ? { "Retry-After": "420" } : {}) });
        return res.end(JSON.stringify({ code: E[1], detail: E[2] }));
      }
    }
    // Uzun oturum denemesi (/__mode?expire=1): giriş "acc-old" verir; bu anahtarla her istek 401 döner. /auth/refresh
    // geçerli yenileme anahtarıyla "acc-N" + yeni yenileme anahtarı verir (her kullanımda değişir); eski anahtar 401.
    if (path === "/auth/refresh" && req.method === "POST") {
      let rawBody = "";
      req.on("data", (c) => (rawBody += c));
      req.on("end", () => {
        const b = JSON.parse(rawBody || "{}");
        refreshCalls++;
        console.log("REFRESH", JSON.stringify(b), "calls", refreshCalls);
        if (!b.refresh_token || b.refresh_token !== currentRefresh) return send(res, 401, { code: "REFRESH_TOKEN_INVALID", detail: "Oturum yenilenemedi." });
        currentRefresh = "r" + (refreshCalls + 1);
        return send(res, 200, { access_token: "acc-" + refreshCalls, refresh_token: currentRefresh, token_type: "bearer" });
      });
      return;
    }
    // Mobil kodlu giriş (/__mode?otp=1): yeni cihazda kod 123456; güvenilir cihaz belirteciyle doğrudan oturum.
    if (state.otp && /^\/auth\/mobile\/login\/(request-code|verify-code)$/.test(path) && req.method === "POST") {
      let rawBody = "";
      req.on("data", (c) => (rawBody += c));
      req.on("end", () => {
        const b = JSON.parse(rawBody || "{}");
        console.log("OTP", path, JSON.stringify({ ...b, password: b.password ? "***" : undefined }));
        const session = () => { currentRefresh = "r1"; return { access_token: "test-token", token_type: "bearer", expires_in: 86400, refresh_token: "r1", session_id: "s1", trusted_device_token: "trust-" + b.device_id, user }; };
        if (path.endsWith("request-code")) {
          if (b.password !== "demo1234") return send(res, 401, { code: "INVALID_CREDENTIALS", detail: "E-posta veya şifre hatalı." });
          if (b.device_token && b.device_token === "trust-" + b.device_id) return send(res, 200, { ...session(), skip_verification: true });
          otpTries = 0;
          return send(res, 200, { success: true, verification_required: true, message: "Doğrulama kodu e-posta adresinize gönderildi.", expires_in: 300, resend_after: 5 });
        }
        if (b.code !== "123456") { otpTries++; return send(res, 400, { code: otpTries >= 5 ? "CODE_LOCKED" : "CODE_INVALID", detail: otpTries >= 5 ? "Çok fazla hatalı deneme. Yeni kod isteyin." : "Kod hatalı. Tekrar deneyin." }); }
        return send(res, 200, session());
      });
      return;
    }
    // Mobil push tercihleri, test bildirimi ve oturumlar (sözleşme §3–§4).
    // Kodlu giriş modu kapalıyken yeni giriş uçları yok (eski sunucu): 404 → istemci eski /auth/login'e düşer.
    if (!state.otp && path.startsWith("/auth/mobile/login/")) return send(res, 404, { detail: "Not Found" });
    if (path === "/mobile/notification-preferences" && req.method === "GET") return send(res, 200, notifPrefs);
    if (path === "/mobile/notification-preferences" && req.method === "PATCH") {
      let rawBody = "";
      req.on("data", (c) => (rawBody += c));
      req.on("end", () => { const b = JSON.parse(rawBody || "{}"); console.log("WRITE prefs", rawBody); Object.assign(notifPrefs, b); send(res, 200, notifPrefs); });
      return;
    }
    if (path === "/mobile/push-test" && req.method === "POST") return send(res, 200, { ok: true, devices: 1 });
    if (path === "/mobile/push-tokens") return send(res, 200, { ok: true, active: true });
    if (path === "/auth/sessions" && req.method === "GET") return send(res, 200, { sessions: mobileSessions });
    if (path === "/auth/sessions/revoke-others" && req.method === "POST") { const n = mobileSessions.filter((x) => !x.current).length; mobileSessions = mobileSessions.filter((x) => x.current); return send(res, 200, { success: true, revoked: n }); }
    let smt;
    if ((smt = path.match(/^\/auth\/sessions\/([^/]+)$/)) && req.method === "DELETE") { mobileSessions = mobileSessions.filter((x) => x.id !== smt[1]); return send(res, 200, { success: true }); }
    if (path === "/auth/logout" && req.method === "POST") { console.log("LOGOUT"); return send(res, 200, { success: true, revoked: true }); }
    if (path === "/auth/login" && state.expire) { currentRefresh = "r1"; return send(res, 200, { access_token: "acc-old", refresh_token: "r1", token_type: "bearer", user }); }
    if (state.expire && req.headers.authorization === "Bearer acc-old") return send(res, 401, { detail: "Oturum süresi doldu." });
    if (path === "/auth/login") return send(res, 200, { access_token: "test-token", token_type: "bearer", user });
    // Şifre sıfırlama (sunucu kuralı: en az 8, harf + rakam, e-postayla aynı değil → 400 PASSWORD_WEAK). /__mode?pwWeak=1 → bir kez zayıf say.
    // 17 Kas: web ucu artık Turnstile ister; mobil kendi ucunu kullanır. Aynı adrese 45 sn içinde ikinci istek 429 + Retry-After.
    if (path === "/auth/password-reset/request-code" && req.method === "POST") return send(res, 400, { code: "TURNSTILE_REQUIRED", detail: "Doğrulama gerekli." });
    if (path === "/auth/mobile/password-reset/request-code" && req.method === "POST") {
      const now = Date.now();
      if (state.resetAt && now - state.resetAt < 45000) { res.writeHead(429, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After", "Retry-After": "45" }); return res.end(JSON.stringify({ code: "RATE_LIMITED", detail: "Çok sık istek." })); }
      state.resetAt = now; return send(res, 200, { success: true, message: "Kod gönderildi", expires_in: 600 });
    }
    if (path === "/auth/password-reset/confirm" && req.method === "POST") {
      let raw = ""; req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}"); const pw = String(b.new_password || "");
        console.log("PW-RESET email=" + b.email + " code=" + b.code + " len=" + pw.length);
        const forced = state.pwWeak === "1"; state.pwWeak = "0";
        if (forced || pw.length < 8 || !/\p{L}/u.test(pw) || !/\d/.test(pw) || pw.toLowerCase() === String(b.email || "").toLowerCase())
          return send(res, 400, { code: "PASSWORD_WEAK", detail: "Şifre en az 8 karakter olmalı, en az bir harf ve bir rakam içermeli ve e-posta adresinizle aynı olmamalı." });
        if (b.code === "000000") return send(res, 400, { detail: "Doğrulama kodu geçersiz ya da süresi dolmuş." });
        send(res, 200, { success: true });
      });
      return;
    }
    if (state.session === "expired") return send(res, 401, { detail: "Token süresi dolmuş" });
    // D-30 ekip üyesi denemesi (/__mode?member=1): mali müşavir (her modül görüntüle, ayarlar yok).
    if (path === "/auth/me" && state.member && state.member !== "0") return send(res, 200, { ...user, role: "member", full_name: "Ece Yılmaz" });
    if (path === "/team/me")
      return send(res, 200, state.member && state.member !== "0"
        ? { is_owner: false, member: { id: "m1", full_name: "Ece Yılmaz", preset: "mali_musavir" }, module_access: { sales: "view", expenses: "view", cash: "view", stock: "view", reports: "view", settings: "none" },
            permissions: ["dashboard.view", "orders.view", "customers.view", "catalog.view", "inventory.view", "reports.view", "billing.view"] }
        : { is_owner: true, member: null, permissions: ["*"] });
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
          (q.get("status") ? q.get("status").split(",").includes(o.status) : !q.get("status_group") || q.get("status_group") === "all" || orderGroup(o) === q.get("status_group")) &&
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
        groups: Object.fromEntries(["pending", "ready_to_ship", "shipped", "delivered", "cancelled", "returned", "deleted"].map((g) => [g, rows.filter((o) => orderGroup(o) === g).length]).concat([["all", rows.length]])),
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
    // --- Dalga 1 sipariş işlemleri
    let m; // dalga 1
    if (req.method === "POST" && (m = path.match(/^\/orders\/([^/]+)\/create-invoice$/))) {
      const o = orders.find((x) => x.id === m[1]);
      if (state.invoiceBusy === "1") return send(res, 200, { success: false, in_progress: true, message: "Bu sipariş için fatura kesimi sürüyor" });
      Object.assign(o, { parasut_invoice_id: "inv-" + o.id, invoice_number: "OBI2026" + o.id.slice(1).padStart(6, "0") });
      return send(res, 200, { success: true, message: "Fatura oluşturuldu: " + o.invoice_number });
    }
    if (req.method === "POST" && (m = path.match(/^\/orders\/([^/]+)\/share-invoice-to-store$/))) {
      const o = orders.find((x) => x.id === m[1]);
      o.trendyol_invoice_shared = true;
      return send(res, 200, { success: true, message: "Fatura mağazaya iletildi" });
    }
    if (req.method === "POST" && (m = path.match(/^\/(trendyol|idefix)\/orders\/([^/]+)\/take-in-processing$/))) {
      const o = orders.find((x) => x.id === m[2]);
      o.trendyol_status = "Picking";
      o.status = "processing";
      return send(res, 200, { success: true, message: "Sipariş işleme alındı" });
    }
    if (req.method === "DELETE" && (m = path.match(/^\/hepsijet\/shipment\/([^/]+)$/))) {
      const bc = decodeURIComponent(m[1]);
      const o = orders.find((x) => (x.cargo_barcodes || []).some((b) => b.barcode === bc));
      if (o) {
        o.cargo_barcodes = o.cargo_barcodes.filter((b) => b.barcode !== bc);
        o.cargo_tracking = o.cargo_barcodes.length ? o.cargo_barcodes[o.cargo_barcodes.length - 1].barcode : null;
      }
      return send(res, 200, { status: "OK" });
    }
    if (req.method === "POST" && path === "/orders/bulk-delete")
      return (() => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        const ids = (b.order_ids || []).filter((id) => orders.some((o) => o.id === id && o.status === "deleted"));
        for (const id of ids) orders.splice(orders.findIndex((o) => o.id === id), 1);
        send(res, 200, { deleted_count: ids.length });
      }); })();
    if (req.method === "POST" && /\/sync-order-by-number$/.test(path)) {
      const no = url.searchParams.get("order_number");
      const hit = orders.find((o) => o.channel_order_id === no);
      return send(res, 200, { success: true, message: hit ? "Sipariş güncellendi" : "Sipariş bulunamadı", count: 0, updated_count: hit ? 1 : 0, total_fetched: hit ? 1 : 0 });
    }
    if (req.method === "POST" && path.startsWith("/print-jobs/enqueue/"))
      return send(res, 200, state.autoprint === "0" ? { success: false, message: "Auto print kapalı veya kullanıcı yetkili değil." } : { success: true, job_id: "j1", status: "pending" });
    // İlk kullanım dalgası: 15 günü aşan çekim arka plan işi (202 + job_id); sürerken 409 + X-Job-Id.
    if (path.startsWith("/integration-jobs/")) {
      const j = state.job; if (!j) return send(res, 404, { detail: "İşlem bulunamadı ya da süresi doldu." });
      j.done = Math.min(j.total, j.done + 40);
      if (j.done >= j.total) j.state = "done";
      return send(res, 200, { job_id: j.id, state: j.state, progress: { done: j.done, total: j.total, label: `Sayfa ${Math.ceil(j.done / 40)}/${j.total / 40}` }, partial: false, error_tr: null, message: j.state === "done" ? "120 sipariş çekildi" : "" });
    }
    if (req.method === "POST" && /\/sync-orders$/.test(path)) {
      const days = Number(url.searchParams.get("days") || 0);
      if (days > 15) {
        if (state.job && state.job.state === "running") { res.writeHead(409, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Job-Id", "X-Job-Id": state.job.id }); return res.end(JSON.stringify({ detail: "Bu entegrasyon için eşitleme sürüyor." })); }
        state.job = { id: "job-" + Date.now(), state: "running", done: 0, total: 120 };
        return send(res, 202, { success: true, accepted: true, job_id: state.job.id, state: "running", message: "Çekim arka planda başladı. İlerleme bu sayfada görünür." });
      }
      return send(res, 200, { success: true, message: "Senkronizasyon tamamlandı", count: 0, total_fetched: 0 });
    }
    if (req.method === "POST" && path === "/orders/resync-dates") return send(res, 200, { success: true, updated: 0, total: 0 });
    // E2: etiketler (orijinal HepsiJet PDF / ürünlü etiket). Küçük geçerli PDF base64 döner.
    const PDF64 = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
    let lm2;
    if ((lm2 = path.match(/^\/orders\/([^/]+)\/shipping-label$/))) {
      const o = orders.find((x) => x.id === lm2[1]);
      const bcs = (o && o.cargo_barcodes) || [];
      return send(res, 200, { barcode: bcs.length ? bcs[bcs.length - 1].barcode : null, cargo_barcodes: bcs, cargo_provider: bcs.length ? "hepsijet" : null });
    }
    if ((lm2 = path.match(/^\/hepsijet\/label\/([^/]+)$/))) { console.log("LABEL original " + lm2[1] + " format=" + url.searchParams.get("format")); return send(res, 200, { success: true, data: PDF64, format: "PDF" }); }
    if ((lm2 = path.match(/^\/hepsijet\/label-with-products\/([^/]+)$/))) { console.log("LABEL products " + lm2[1] + " barcode=" + url.searchParams.get("barcode")); return send(res, 200, { success: true, data: PDF64, format: "PDF" }); }
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
      { id: "i1", name: "Deneme Mağaza", provider: "woocommerce", kind: "store", status: "success", last_sync_error: "WooCommerce geçici olarak yanıt vermedi", last_sync_error_kind: "transient" },
      { id: "i2", name: "Trendyol", provider: "trendyol", kind: "marketplace", status: "success", sync_running: Boolean(state.job && state.job.state === "running") },
      { id: "i3", name: "Hepsiburada", provider: "hepsiburada", kind: "marketplace", status: "success", auto_sync_status: "auth_failed", last_sync_error_kind: "auth" },
    ]);
    if (path === "/parasut/invoices")
      return send(res, 200, { invoices: Array.from({ length: 6 }, (_, i) => ({
        id: `inv${i}`, invoice_no: `OBI2026${String(100 + i)}`, issue_date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
        gross_total: 1200 + i * 310.5, contact_name: NAMES[i % NAMES.length], can_officialize: i % 2 === 0,
      })), total: 6, page: 1, per_page: 600 });
    if (path === "/parasut/sales-offers" && req.method !== "POST") return send(res, 200, { offers, total: offers.length });
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
          by_currency: { TRY: { summary: { total_revenue: total, total_orders: hit.length } }, USD: { summary: { total_revenue: 420.5, total_orders: 3 } } },
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
        return send(res, 200, { products: slice.map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, stock: p.stock, reserved: p.id === "p2" ? 2 : 0, on_hand: p.stock + (p.id === "p2" ? 2 : 0), image_url: "", integration_stocks: [{ integration_id: "i1", stock: p.ch.i1.stock, active: true, ...(p.id === "p3" ? { pending: true, pending_stock: p.ch.i1.stock + 4, pending_at: new Date().toISOString() } : {}) }, { integration_id: "i2", stock: p.ch.i2.stock, active: true }].filter((r) => r.integration_id !== "i2" || p.links.trendyol) })), integrations, total: rows.length, page, per_page: per });
      return send(res, 200, { products: slice.map((p) => ({ id: p.id, price: p.price.toFixed(2), integration_prices: [{ integration_id: "i1", price: p.ch.i1.price.toFixed(2), active: true, ...(p.id === "p3" ? { pending: true, pending_price: (p.ch.i1.price + 10).toFixed(2), pending_at: new Date().toISOString() } : {}) }, { integration_id: "i2", price: p.ch.i2.price.toFixed(2), active: true }].filter((r) => r.integration_id !== "i2" || p.links.trendyol) })), integrations, total: rows.length, page, per_page: per });
    }
    // Ürün kimliği (ad / SKU / barkod) ve stok hareketleri — gerçek uçlar: GET|PATCH /products/{id}, GET /stock/movements.
    // --- F2 / F3 / B5
    if (path === "/dashboard/recent-orders") return send(res, 200, orders.slice(0, Number(url.searchParams.get("limit") || 5)));
    if (path === "/support/notifications/mark-read" && req.method === "POST") { console.log("WRITE mark-read"); return send(res, 200, { success: true, updated: 1 }); }
    if (/^\/products\/[^/]+\/insights$/.test(path)) {
      const r = url.searchParams.get("range") || "month"; const k = r === "week" ? 1 : r === "year" ? 12 : 3;
      return send(res, 200, { range: r, sales: { total_revenue: 1240.5 * k, total_quantity: 11 * k, total_orders: 7 * k, by_provider: [
        { provider: "trendyol", integration_name: "Trendyol", revenue: 840.5 * k, quantity: 7 * k, orders: 5 * k },
        { provider: "woocommerce", integration_name: "Deneme Mağaza", revenue: 400 * k, quantity: 4 * k, orders: 2 * k },
        { provider: "n11", integration_name: "N11", revenue: 0, quantity: 0, orders: 0 } ] } });
    }
    // --- D1: POS. /__mode?posFail=1 → satış kaydedilir ama yanıt 500 (bir kez).
    if (req.method === "POST" && path === "/pos/sales") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const key = req.headers["idempotency-key"];
        console.log("WRITE", path, "key=" + key, raw);
        const b = JSON.parse(raw || "{}");
        const fp = JSON.stringify(b.items.map((i) => [i.product_id, i.quantity])) + b.discount_amount + b.payment_type;
        const prev = posSales.find((x) => x.key === key);
        if (prev) {
          if (prev.fp !== fp) return send(res, 409, { detail: "Bu ödeme anahtarı farklı bir sepetle kullanılmış; yeni satış başlatın" });
          return send(res, 200, prev.resp);
        }
        // P4: kasa bacakları
        const totalC = Math.round(b.total * 100);
        let legs;
        if (b.payment_type === "acik_hesap") {
          const c = parties.find((x) => x.id === b.customer_id);
          if (!b.customer_id) return send(res, 400, { code: "POS_CUSTOMER_REQUIRED", detail: "Açık hesap için cari seçin." });
          if (!c || c.source !== "registered") return send(res, 404, { code: "CUSTOMER_NOT_FOUND", detail: "Cari bulunamadı." });
          if (c.contact_role === "supplier") return send(res, 422, { code: "POS_CUSTOMER_NOT_CUSTOMER", detail: "Tedarikçi kartına açık hesap satışı yazılamaz." });
          for (const it of b.items) { const p = products.find((x) => x.id === it.product_id); if (p) p.stock -= it.quantity; }
          c.balance += b.total;
          const resp = { id: "s" + (posSales.length + 1), sale_number: "POS-20261112-" + String(posSales.length + 1).padStart(4, "0"), total: b.total, payment_type: "acik_hesap", customer_name: c.name, customer_id: c.id, item_count: b.items.length,
            cash_status: "none", cash_entries: [], payments: [{ method: "acik_hesap", amount: Number(b.total).toFixed(2) }], ledger_status: state.posPending === "1" ? "pending" : "posted" };
          console.log("POS acik_hesap customer_id=" + b.customer_id + " paid=" + b.paid_amount);
          posSales.push({ key, fp, resp });
          return send(res, 200, resp);
        }
        if (b.payment_type === "karma") {
          if (!Array.isArray(b.payments)) return send(res, 422, { code: "POS_PAYMENT_SPLIT_REQUIRED", detail: "Karma ödemede nakit ve kart tutarları gerekli." });
          const sum = b.payments.reduce((t, x) => t + Math.round(Number(x.amount) * 100), 0);
          if (Math.abs(sum - totalC) > 1) return send(res, 422, { code: "POS_PAYMENT_SPLIT_MISMATCH", detail: "Nakit + kart toplamı fiş tutarına eşit değil." });
          legs = b.payments.filter((x) => Number(x.amount) > 0).map((x) => ({ method: x.method, amount: Number(x.amount).toFixed(2) }));
        } else legs = [{ method: b.payment_type, amount: Number(b.total).toFixed(2) }];
        const cardLeg = legs.some((l) => l.method === "kart");
        if (cardLeg && state.posAccts === "2" && !b.card_account_id) return send(res, 400, { code: "POS_CARD_ACCOUNT_REQUIRED", detail: "Birden çok POS hesabı var; kart ödemesinin yazılacağı hesabı seçin." });
        for (const it of b.items) { const p = products.find((x) => x.id === it.product_id); if (p) p.stock -= it.quantity; }
        const cardName = b.card_account_id === "a5" ? "Yapı Kredi POS" : "POS (Kart)";
        const pending = state.posPending === "1";
        const resp = { id: "s" + (posSales.length + 1), sale_number: "POS-20261112-" + String(posSales.length + 1).padStart(4, "0"), created_at: new Date().toISOString(), total: b.total, payment_type: b.payment_type, customer_name: b.customer_name, item_count: b.items.length,
          cash_status: pending ? "pending" : "posted",
          cash_entries: pending ? [] : legs.map((l, i) => ({ method: l.method, account_id: l.method === "kart" ? (b.card_account_id || "a3") : "a1", account_name: l.method === "kart" ? cardName : "Nakit Kasa", amount: l.amount, entry_id: "ce" + i })),
          payments: legs };
        console.log("POS card_account_id=" + (b.card_account_id || "-") + " payments=" + JSON.stringify(b.payments || null));
        posSales.push({ key, fp, resp });
        if (state.posFail === "1") { state.posFail = "0"; return send(res, 500, { detail: `Satış ${resp.sale_number} kaydedildi ancak stok düşülemedi (deneme). Aynı ödemeyi tekrar deneyin; stok yalnız bir kez düşülür.` }); }
        send(res, 200, resp);
      });
      return;
    }
    // --- B3: yeni ürün, görsel, satış durumu
    if (req.method === "POST" && path === "/products") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        console.log("WRITE", path, raw);
        const b = JSON.parse(raw || "{}");
        const id = "p" + (products.length + 1);
        products.unshift({ id, name: b.name, sku: b.sku, barcode: b.barcode || "", stock: b.stock || 0, price: b.price || 0, ch: { i1: { stock: 0, price: b.price || 0 }, i2: { stock: 0, price: b.price || 0 } }, links: {}, details: {} });
        send(res, 200, { id, name: b.name, sku: b.sku, barcode: b.barcode, stock: b.stock, price: b.price });
      });
      return;
    }
    let im; // b3
    if (req.method === "POST" && (im = path.match(/^\/products\/([^/]+)\/images$/))) {
      const p = products.find((x) => x.id === im[1]);
      let size = 0;
      req.on("data", (c) => (size += c.length));
      req.on("end", () => {
        console.log("WRITE", path, "multipart bytes=" + size);
        const n = Date.now();
        const url = `https://cdn.example.test/tenants/t1/${p.id}/${n}.jpg`;
        p.images = [...(p.images || []), url];
        if (!p.image_url) p.image_url = url;
        send(res, 201, { product_id: p.id, images: [{ id: "img" + n, url, filename: "x.jpg", content_type: "image/jpeg", size }], image_url: p.image_url });
      });
      return;
    }
    if (req.method === "POST" && (im = path.match(/^\/products\/([^/]+)\/bulk-sales-status$/))) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        console.log("WRITE", path, raw);
        const p = products.find((x) => x.id === im[1]);
        const action = JSON.parse(raw || "{}").action;
        const provs = Object.keys(p.links || {});
        p.sales = Object.fromEntries(provs.map((k) => [k, action === "open" ? "active" : "inactive"]));
        send(res, 200, { success: true, action, affected_count: provs.length, providers: provs, status: action === "open" ? "active" : "inactive" });
      });
      return;
    }
    // --- Dalga 2 / B1 eşleştirme
    let lm; // b1
    if (req.method === "GET" && (lm = path.match(/^\/integrations\/([^/]+)\/source-products$/))) {
      const q = (url.searchParams.get("search") || "").toLocaleLowerCase("tr-TR");
      const pg = Number(url.searchParams.get("page") || 1), per = Number(url.searchParams.get("per_page") || 25);
      const rows = tySource.filter((x) => !q || [x.name, x.sku, x.barcode].some((v) => v.toLocaleLowerCase("tr-TR").includes(q)));
      return send(res, 200, { items: rows.slice((pg - 1) * per, pg * per).map((x) => ({ ...x, external_id: x.id })), page: pg, per_page: per, total: rows.length, total_known: true, total_pages: Math.ceil(rows.length / per), has_more: pg * per < rows.length });
    }
    if (req.method === "POST" && (lm = path.match(/^\/products\/([^/]+)\/(link|unlink)-channel$/))) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        console.log("WRITE", path, raw);
        const b = JSON.parse(raw || "{}");
        const p = products.find((x) => x.id === lm[1]);
        if (lm[2] === "link") {
          p.links[b.provider] = b.external_id;
          p.details[b.provider] = { integration_id: b.integration_id, ...(b.barcode ? { barcode: b.barcode } : {}) };
        } else {
          delete p.links[b.provider];
          delete p.details[b.provider];
        }
        send(res, 200, { success: true, message: "Entegrasyon eşleştirmesi kaydedildi" });
      });
      return;
    }
    const prodMatch = path.match(/^\/products\/([^/]+)$/);
    if (prodMatch && (req.method === "GET" || req.method === "PATCH")) {
      const p = products.find((x) => x.id === decodeURIComponent(prodMatch[1]));
      if (!p) return send(res, 404, { detail: "Ürün bulunamadı" });
      // channel_push: p2'de Trendyol barkodu bilinmiyor (red), Woo kabul; p3'te Trendyol sonucu bekleniyor.
      const pushFor = (x) =>
        x.id === "p2"
          ? { i1: { provider: "woocommerce", ok: true, state: "ok", at: new Date().toISOString(), code: null, detail: null },
              i2: { provider: "trendyol", ok: false, state: "failed", at: new Date().toISOString(), code: "CHANNEL_BARCODE_UNKNOWN", detail: "Barkod Trendyol'da yok" } }
          : x.id === "p3"
          ? { i2: { provider: "trendyol", ok: null, state: "pending", at: new Date().toISOString(), code: null, detail: null } }
          : {};
      const view = () => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, stock: p.stock, price: p.price, channel_push: pushFor(p), channel_links: p.links, channel_details: p.details, images: p.images || [], image_url: p.image_url || null, channel_sales_status: p.sales || {} });
      if (req.method === "GET") return send(res, 200, view());
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        for (const k of ["name", "sku", "barcode"]) if (typeof b[k] === "string") p[k] = b[k];
        if (Array.isArray(b.images)) p.images = b.images;
        if ("image_url" in b) p.image_url = b.image_url;
        console.log("WRITE", path, raw);
        send(res, 200, view());
      });
      return;
    }
    if (req.method === "GET" && path === "/stock/summary") {
      const tot = products.reduce((t, p) => { const r = p.id === "p2" ? 2 : 0; t.products++; t.sellable += p.stock; t.reserved += r; t.on_hand += p.stock + r; return t; }, { products: 0, sellable: 0, reserved: 0, on_hand: 0 });
      return send(res, 200, { items: [], totals: tot });
    }
    if (req.method === "GET" && path === "/stock/movements") {
      const pid = url.searchParams.get("product_id") || "";
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
      const skip = Math.max(0, Number(url.searchParams.get("skip") || 0));
      if (!pid) {
        // Tüm ürünler (Ürünler ekranındaki "Son stok hareketleri"): ürünler arasında dönen 35 hareket.
        const kinds = [["in", "Mal kabul"], ["sale", "POS satışı"], ["accounting_sync", "Muhasebe senkronu"], ["out", "Trendyol siparişi"], ["purchase_in", "Alış faturası"]];
        const rows = Array.from({ length: 35 }, (_, i) => ({
          id: `sm-all-${i}`, user_id: "u1", product_id: `p${(i % 9) + 1}`, movement_type: kinds[i % 5][0], quantity: kinds[i % 5][0] === "sale" ? -(1 + (i % 3)) : 1 + ((i * 3) % 12),
          delta: kinds[i % 5][0] === "accounting_sync" ? (i % 2 ? 4 : -2) : null,
          reason: kinds[i % 5][1], reference_id: null, created_at: new Date(Date.now() - i * 3600000).toISOString(), product_name: `Deneme Ürün ${(i % 9) + 1}`,
        }));
        return send(res, 200, rows.slice(skip, skip + limit));
      }
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
        if (path === "/stock/adjust") {
          // Sunucu gibi: in/out miktar kadar ekler/düşer, adjustment mutlak değer yazar.
          const q = Number(b.quantity) || 0;
          if ((b.movement_type === "in" || b.movement_type === "out") && q <= 0) return send(res, 400, { detail: "Miktar sıfırdan büyük olmalı" });
          if (b.movement_type === "out" && p.stock - q < 0) return send(res, 400, { detail: "Stok yetersiz" });
          p.stock = b.movement_type === "in" ? p.stock + q : b.movement_type === "out" ? p.stock - q : q;
          console.log("IDEMPOTENCY", req.headers["idempotency-key"] || "-");
        }
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
    // --- E1: HepsiJet manuel gönderi (alıcılar, gönderiler, il/ilçe/mahalle, toplu oluşturma)
    if (path === "/hepsijet/cities") return send(res, 200, { data: [{ cityId: 34, cityName: "İstanbul" }, { cityId: 6, cityName: "Ankara" }, { cityId: 35, cityName: "İzmir" }] });
    if (path.startsWith("/hepsijet/towns/")) return send(res, 200, { data: [{ townId: 1, townName: "Kadıköy" }, { townId: 2, townName: "Beşiktaş" }] });
    if (path.startsWith("/hepsijet/districts/")) return send(res, 200, { data: [{ districtId: 11, districtName: "Moda" }, { districtId: 12, districtName: "Fenerbahçe" }] });
    if (path === "/hepsijet/manual/customers" && req.method === "GET") return send(res, 200, { items: hjCustomers });
    if (path === "/hepsijet/manual/customers" && req.method === "POST")
      return (() => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { console.log("WRITE", path, raw); const c = { id: "hc" + (hjCustomers.length + 1), ...JSON.parse(raw || "{}") }; hjCustomers.unshift(c); send(res, 200, { success: true, customer: c }); }); })();
    // Alıcı düzelt / sil (13 Kas: listeden silme kalktı, ayrıntı ekranında)
    let hm;
    if ((hm = path.match(/^\/hepsijet\/manual\/customers\/([^/]+)$/)) && (req.method === "PUT" || req.method === "DELETE")) {
      const i = hjCustomers.findIndex((x) => x.id === decodeURIComponent(hm[1]));
      if (i < 0) return send(res, 404, { detail: "Müşteri bulunamadı" });
      if (req.method === "DELETE") { console.log("HJ-CUSTOMER DELETE", hm[1]); hjCustomers.splice(i, 1); return send(res, 200, { success: true }); }
      let raw = ""; req.on("data", (c) => (raw += c));
      req.on("end", () => { console.log("HJ-CUSTOMER PUT", hm[1], raw); Object.assign(hjCustomers[i], JSON.parse(raw || "{}")); send(res, 200, { success: true, customer: hjCustomers[i] }); });
      return;
    }
    if (path === "/hepsijet/manual/shipments" && req.method === "GET") return send(res, 200, { items: hjShipments });
    if ((path === "/hepsijet/manual/shipments" || path === "/hepsijet/manual/shipments/bulk") && req.method === "POST")
      return (() => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
        console.log("WRITE", path, raw);
        const b = JSON.parse(raw || "{}");
        const mk = (p) => { const c = hjCustomers.find((x) => x.id === p.customer_id) || {}; const sh = { id: "hs" + Date.now() + Math.random().toString(36).slice(2, 5), barcode: "HJM" + Math.floor(Math.random() * 1e8), status: "new", customer_name: c.full_name, total_parcels: p.total_parcels, desi: p.desi, created_at: new Date().toISOString() }; hjShipments.unshift(sh); return sh; };
        if (path.endsWith("/bulk")) return send(res, 200, { results: (b.shipments || []).map((p) => ({ success: true, shipment: mk(p) })) });
        send(res, 200, { success: true, shipment: mk(b) });
      }); })();
    if (path.startsWith("/hepsijet/create-shipment/")) return send(res, 200, { success: true, barcode: "HJ123456789", message: "Gönderi oluşturuldu" });
    if (path === "/push-token") return send(res, 200, { ok: true });
    // --- Finans, cari, kasa, faturalar
    const today = new Date().toISOString().slice(0, 10);
    const readBody = (cb) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { console.log("WRITE", path, raw); cb(JSON.parse(raw || "{}")); }); };
    // --- Muhasebe farkları (P5). r2'de "Farkı al" 409 ITEM_OUTDATED döner (eski kayıt yolu denensin).
    if (path === "/stock/reconciliation" && req.method === "GET")
      return send(res, 200, { items: state.demo === "1" ? [] : recon, open_count: state.demo === "1" ? 0 : recon.length, owner: { owner: "obihub", program: "bizimhesap", label: "ObiHub" }, last_run: null });
    if (req.method === "POST" && (path === "/stock/reconciliation/apply" || path === "/stock/reconciliation/dismiss"))
      return readBody((b) => {
        const ids = b.item_ids || [];
        if (path.endsWith("/apply") && ids.includes("r2"))
          return send(res, 409, { detail: { code: "ITEM_OUTDATED", message: "Seçilen fark kaydı son stok turundan eski; liste yenilendi.", item_ids: ["r2"] } });
        const before = recon.length;
        for (let i = recon.length - 1; i >= 0; i--) if (ids.includes(recon[i].id)) recon.splice(i, 1);
        const n = before - recon.length;
        return send(res, 200, path.endsWith("/apply") ? { applied: n, stale: 0, failed: 0, not_found: 0 } : { dismissed: n, not_found: 0 });
      });
    if (path === "/finance/overview")
      return send(res, 200, { cash_balance: accounts.reduce((n, a) => n + a.balance, 0), receivable: 42850.5, overdue_receivable: 6200, payable: 18400, overdue_payable: 0, month_cash_in: 91200, month_cash_out: 37400, today,
        upcoming: [
          { kind: "receivable", date: "2026-11-05", amount: 6200, currency: "TRY", title: "Elif Kaya", reference: "OBI2026101" },
          { kind: "payable", date: "2026-11-18", amount: 9400, currency: "TRY", title: "Tedarikçi A.Ş.", reference: "GF-88" },
          { kind: "receivable", date: "2026-11-22", amount: 12850.5, currency: "TRY", title: "Can Öztürk", reference: "OBI2026104" },
          { kind: "payable", date: null, undated: true, amount: 1850, currency: "TRY", title: "Kırtasiye Ltd.", reference: "GF-91", source: "obihub" },
        ] });
    // Dalga 5a: irsaliye, tekrarlayan belgeler, fiyat listesi.
    state.notes5 = state.notes5 || [{ id: "dn-0001", direction: "out", number: "IRS-2026-000001", party_name: "Elif Kaya", customer_id: "c1", issue_date: "2026-11-15", shipment_date: "2026-11-15",
      cargo: { carrier: "Aras Kargo", tracking_no: "AR123" }, lines: [{ line_key: "l-000000000001", product_id: "p1", product_name: "Deneme Ürün 1", quantity: "2", unit: "adet" }],
      invoice_status: "not_invoiced", invoice_link: null, edoc: { status: "none" }, editable: true, deletable: true, can_invoice: true, can_send_edoc: true }];
    let dnm;
    if (path === "/dispatch-notes" && req.method === "GET") {
      const dir = url.searchParams.get("direction") || "out"; const st = url.searchParams.get("status") || "";
      return send(res, 200, { items: state.notes5.filter((n) => n.direction === dir && (!st || n.invoice_status === st)), next_cursor: null });
    }
    if (path === "/dispatch-notes/prefill") {
      const oid = url.searchParams.get("order_id"); const iid = url.searchParams.get("invoice_id");
      return send(res, 200, { direction: "out", party_name: "Elif Kaya", customer_id: "c1", issue_date: "2026-11-16", shipment_method: "cargo", cargo: { carrier: oid ? "Trendyol Express" : "", tracking_no: oid ? "TEX987" : "" },
        order_id: oid || null, source_invoice_id: iid || null, order_no: oid ? "TY-1001" : "", lines: [{ product_id: "p2", product_name: "Deneme Ürün 2", quantity: "1", unit: "adet" }] });
    }
    if (path === "/dispatch-notes" && req.method === "POST") return readBody((b) => {
      const n = { ...b, id: "dn-" + Date.now(), number: "IRS-2026-00000" + (state.notes5.length + 1), invoice_status: "not_invoiced", invoice_link: null, edoc: { status: "none" }, editable: true, deletable: true, can_invoice: true, can_send_edoc: true };
      state.notes5.unshift(n); console.log("WRITE DISPATCH", req.headers["idempotency-key"], JSON.stringify(b).slice(0, 200)); return send(res, 201, { note: n, created: true, warnings: [] });
    });
    if (path === "/dispatch-notes/invoice" && req.method === "POST") return readBody((b) => {
      (b.note_ids || []).forEach((id) => { const n = state.notes5.find((x) => x.id === id); if (n) { n.invoice_status = "invoiced"; n.invoice_link = { invoice_id: "li5", invoice_number: "", kind: "converted" }; n.can_invoice = false; n.deletable = n.editable = false; } });
      console.log("WRITE DN INVOICE", JSON.stringify(b)); return send(res, 200, { invoice: { id: "li5", invoice_number: "" }, notes: b.note_ids });
    });
    if ((dnm = path.match(/^\/dispatch-notes\/([^/]+)(?:\/(e-dispatch|pdf))?$/))) {
      const n = state.notes5.find((x) => x.id === dnm[1]);
      if (!n) return send(res, 404, { code: "DISPATCH_NOT_FOUND", detail: "İrsaliye bulunamadı." });
      if (dnm[2] === "pdf") { res.writeHead(200, { "Content-Type": "application/pdf", "Access-Control-Allow-Origin": "*" }); return res.end(Buffer.from("%PDF-1.4\n%mock\n")); }
      if (dnm[2] === "e-dispatch") return readBody((b) => { if (b.confirm !== true) return send(res, 422, { code: "CONFIRMATION_REQUIRED", detail: "Onay gerekli." }); n.edoc = { status: "sent" }; n.can_send_edoc = false; n.editable = n.deletable = false; return send(res, 200, n); });
      if (req.method === "DELETE") { state.notes5 = state.notes5.filter((x) => x !== n); return send(res, 200, { id: n.id, deleted: true }); }
      return send(res, 200, n);
    }
    state.plans = state.plans || [{ id: "rp1", kind: "sales_invoice", kind_label: "Satış faturası", title: "Aylık bakım · Elif Kaya", frequency: "monthly", every: 1, start_date: "2026-10-05", status: "active", next_run_date: "2026-12-05", run_count: 2, source_invoice_id: "li1", summary: { customer_name: "Elif Kaya", source_number: "OBI2026101" } }];
    if (path === "/recurring-documents") return send(res, 200, { items: state.plans, summary: {} });
    if ((dnm = path.match(/^\/recurring-documents\/([^/]+)(?:\/(pause|resume))?$/))) {
      const pl = state.plans.find((x) => x.id === dnm[1]); if (!pl) return send(res, 404, { code: "NOT_FOUND", detail: "Plan bulunamadı." });
      if (dnm[2]) { pl.status = dnm[2] === "pause" ? "paused" : "active"; console.log("WRITE PLAN", dnm[2]); return send(res, 200, pl); }
      return send(res, 200, { ...pl, runs: [{ period: "2026-11-05", status: "done", ref_type: "sales_invoice", issued: false, ref_number: "" }, { period: "2026-10-05", status: "done", ref_type: "sales_invoice", issued: true, ref_number: "OBI2026101" }] });
    }
    if (path === "/price-lists/resolve" && req.method === "POST") return readBody((b) => send(res, 200, { price_list: b.customer_id === "c1" ? { id: "pl1", name: "Bayi" } : null, reason: null, prices: b.customer_id === "c1" ? Object.fromEntries((b.product_ids || []).map((id) => [id, { unit_price: "77.5000", gross_unit_price: "93.00", source: "list" }])) : {}, date: b.date, exchange_rate_type: "selling" }));
    // Dalga 4: bakiye sabitleme, hareket geri alma, düşük stok, toplu sayım.
    let bam;
    if ((bam = path.match(/^\/finance\/accounts\/([^/]+)\/balance-at$/))) {
      const acc = accounts.find((x) => x.id === bam[1]); return send(res, 200, { account_id: bam[1], date: url.searchParams.get("date"), balance: Number(acc ? acc.balance : 0).toFixed(2), currency: "TRY" });
    }
    if ((bam = path.match(/^\/finance\/accounts\/([^/]+)\/balance-adjustments$/)) && req.method === "POST") return readBody((b) => {
      const acc = accounts.find((x) => x.id === bam[1]);
      if (!req.headers["idempotency-key"]) return send(res, 422, { code: "IDEMPOTENCY_KEY_REQUIRED", detail: "Anahtar gerekli." });
      const diff = Number(b.target_balance) - acc.balance;
      if (Math.abs(diff) < 0.005) return send(res, 422, { code: "BALANCE_ALREADY_AT_TARGET", detail: "Bakiye o gün zaten bu tutarda." });
      acc.balance = Number(b.target_balance); entries.unshift({ id: "adj" + Date.now(), account_id: acc.id, entry_type: diff > 0 ? "income" : "expense", amount: Math.abs(diff), entry_date: b.entry_date, description: b.description || "Bakiye düzeltme", source_type: "balance_adjustment" });
      console.log("WRITE BALANCE ADJ", JSON.stringify(b)); return send(res, 200, { entry: entries[0], replayed: false, before_balance: (acc.balance - diff).toFixed(2), target_balance: Number(b.target_balance).toFixed(2), difference: diff.toFixed(2) });
    });
    if ((bam = path.match(/^\/finance\/entries\/([^/]+)$/)) && req.method === "DELETE") {
      const e = entries.find((x) => x.id === decodeURIComponent(bam[1]));
      if (!e) return send(res, 404, { detail: "Hareket bulunamadı" });
      if (e.source_type && !["manual", "transfer", "balance_adjustment"].includes(e.source_type)) return send(res, 400, { code: "ENTRY_LOCKED", detail: "Kaynağından geri alın." });
      entries.splice(entries.indexOf(e), 1); console.log("WRITE UNDO", path); return send(res, 200, { ok: true, replayed: false });
    }
    if (path === "/dashboard/low-stock") return send(res, 200, { count: 2, items: products.slice(0, 2).map((c) => ({ id: c.id, name: c.name, sku: c.sku, stock: 3, low_warehouses: [] })) });
    if (path === "/stock/count-bulk/preview" && req.method === "POST") return readBody((b) => {
      const rows = (b.lines || []).map((ln, i) => {
        const c = products.find((x) => x.barcode === ln.code || x.sku === ln.code);
        if (!c) return { index: i, code_input: ln.code, counted: ln.counted_quantity, status: "error", code: "PRODUCT_NOT_FOUND", detail: "Ürün bulunamadı.", product_id: null };
        const expected = 5; const diff = ln.counted_quantity - expected;
        return { index: i, code_input: ln.code, counted: ln.counted_quantity, product_id: c.id, name: c.name, expected, diff, status: diff ? "change" : "same" };
      });
      const sm = { lines: rows.length, changes: rows.filter((r) => r.status === "change").length, same: rows.filter((r) => r.status === "same").length, errors: rows.filter((r) => r.status === "error").length,
        increase: rows.reduce((a, r) => a + (r.diff > 0 ? r.diff : 0), 0), decrease: rows.reduce((a, r) => a + (r.diff < 0 ? -r.diff : 0), 0) };
      return send(res, 200, { warehouse: { id: b.warehouse_id, name: "Ana depo" }, lines: rows, summary: sm });
    });
    if (path === "/stock/count-bulk/apply" && req.method === "POST") return readBody((b) => {
      if (!req.headers["idempotency-key"]) return send(res, 422, { code: "IDEMPOTENCY_KEY_REQUIRED", detail: "Anahtar gerekli." });
      console.log("WRITE COUNT APPLY", JSON.stringify(b)); return send(res, 200, { status: "done", applied: b.lines.length, unchanged: 0, replayed: 0, failed: [], movement_ids: [] });
    });
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
        if ((src.currency || "TRY") !== (dst.currency || "TRY") && !b.to_amount) return send(res, 400, { code: "TRANSFER_TARGET_AMOUNT_REQUIRED", detail: "Karşı hesaba geçen tutarı girin." });
        const tid = "tr" + Date.now();
        src.balance -= b.amount; dst.balance += b.to_amount ? Number(b.to_amount) : b.amount; console.log("WRITE TRANSFER", JSON.stringify(b));
        const outgoing = { id: tid + "o", account_id: src.id, entry_type: "transfer_out", amount: b.amount, entry_date: b.entry_date, description: b.description || "Hesaplar arası transfer", related_account_name: dst.name };
        const incoming = { id: tid + "i", account_id: dst.id, entry_type: "transfer_in", amount: b.amount, entry_date: b.entry_date, description: b.description || "Hesaplar arası transfer", related_account_name: src.name };
        entries.unshift(outgoing, incoming);
        send(res, 200, { transfer_id: tid, outgoing, incoming });
      });
    if (state.kasa === "1") {
      const all = () => [...accounts, ...kasaExtra].filter((a) => !a.deleted && a.is_active !== false);
      const view = (a) => {
        const mirror = a.read_only === true;
        const hasMoves = a.id === "a1" || Math.abs(Number(a.balance) || 0) > 0;
        return { ...a, archived: a.archived === true, group: a.group || "obihub", read_only: mirror, has_movements: hasMoves, opening_balance_date: a.id === "a1" ? "2026-10-04" : null,
          actions: mirror ? { add_movement: false, transfer: false, edit: false, archive: false, unarchive: false, delete: false }
            : { add_movement: !a.archived, transfer: !a.archived, edit: true, archive: !a.archived && !a.is_default, unarchive: a.archived === true, delete: !a.is_default && !hasMoves } };
      };
      let km;
      if (path === "/finance/accounts" && req.method === "GET") {
        const st = url.searchParams.get("status") || "active";
        const rows = all().map(view).filter((a) => (st === "all" ? true : st === "archived" ? a.archived : !a.archived));
        const tot = {}; rows.forEach((a) => { tot[a.currency] = (tot[a.currency] || 0) + a.balance; });
        const arch = {}; all().filter((a) => a.archived).forEach((a) => { arch[a.currency] = (arch[a.currency] || 0) + a.balance; });
        const prs = rows.filter((a) => a.group === "parasut").map((a) => a.id);
        const groups = [...(prs.length ? [{ key: "parasut", label: "Paraşüt hesapları", count: prs.length, account_ids: prs }] : []), { key: "obihub", label: "ObiHub hesapları", count: rows.length - prs.length, account_ids: rows.filter((a) => a.group !== "parasut").map((a) => a.id) }];
        return send(res, 200, { items: rows, groups, counts: { active: all().filter((a) => !a.archived).length, archived: all().filter((a) => a.archived).length }, totals_by_currency: tot, archived_totals_by_currency: arch });
      }
      if ((km = path.match(/^\/finance\/accounts\/([^/]+)\/(archive|unarchive)$/)) && req.method === "POST") {
        const a = all().find((x) => x.id === decodeURIComponent(km[1]));
        if (!a) return send(res, 404, { code: "ACCOUNT_NOT_FOUND", detail: "Hesap bulunamadı" });
        if (a.read_only) return send(res, 409, { code: "MIRROR_ACCOUNT_READ_ONLY", detail: "Bu hesap Paraşüt'ten geliyor." });
        if (a.is_default) return send(res, 409, { code: "ACCOUNT_DEFAULT_LOCKED", detail: "Varsayılan kasa arşivlenemez." });
        if (km[2] === "unarchive") { a.archived = false; return send(res, 200, view(a)); }
        return readBody((b) => {
          if (Math.abs(a.balance) > 0.004 && !b.confirm_nonzero_balance) return send(res, 409, { code: "ACCOUNT_BALANCE_NOT_ZERO", detail: "Hesabın bakiyesi sıfır değil. Yine de arşivlemek için onaylayın; hareketler ve bakiye korunur.", balance: a.balance, currency: a.currency });
          a.archived = true; send(res, 200, view(a));
        });
      }
      if ((km = path.match(/^\/finance\/accounts\/([^/]+)$/)) && req.method === "DELETE") {
        const a = all().find((x) => x.id === decodeURIComponent(km[1]));
        if (!a) return send(res, 404, { code: "ACCOUNT_NOT_FOUND", detail: "Hesap bulunamadı" });
        if (view(a).has_movements) return send(res, 409, { code: "ACCOUNT_HAS_MOVEMENTS", detail: "Hareketi olan hesap silinemez; arşivleyebilirsiniz." });
        a.deleted = true; return send(res, 200, { status: "deleted", id: a.id });
      }
      if ((km = path.match(/^\/finance\/accounts\/([^/]+)\/movements$/))) {
        const a = all().find((x) => x.id === decodeURIComponent(km[1]));
        if (!a) return send(res, 404, { code: "ACCOUNT_NOT_FOUND", detail: "Hesap bulunamadı" });
        const rows = a.id === "a1" ? kasaMoves : [];
        const limit = Number(url.searchParams.get("limit") || 50);
        const start = Number(url.searchParams.get("cursor") || 0);
        const pageRows = rows.slice(start, start + limit);
        const counted = rows.filter((r) => !r.before_opening);
        const sum = (d) => counted.filter((r) => r.direction === d).reduce((x, r) => x + r.amount, 0);
        const before = rows.filter((r) => r.before_opening);
        return send(res, 200, { account: view(a), items: pageRows, next_cursor: start + limit < rows.length ? String(start + limit) : null, has_more: start + limit < rows.length, total: rows.length, order: "desc", running_balance_available: true,
          totals: { currency: a.currency, in: sum("in"), out: sum("out"), net: sum("in") - sum("out"), count: rows.length, before_opening: { in: before.reduce((x, r) => x + (r.direction === "in" ? r.amount : 0), 0), out: 0, count: before.length } },
          ...(url.searchParams.get("include_undone") === "true" ? { undone_items: a.id === "a1" ? [{ id: "u1", entry_type: "income", amount: 75, entry_date: "2026-11-10", description: "Yanlış giriş", undone: true }, { id: "u2", entry_type: "income", amount: 300, entry_date: "2026-11-09", description: "Tahsilat · Deniz Ltd", undone_kind: "payment_voided" }] : [] } : {}) });
      }
    }
    if (path === "/finance/accounts") return send(res, 200, { items: state.posAccts === "2" ? [...accounts, { id: "a5", name: "Yapı Kredi POS", account_type: "pos", currency: "TRY", balance: 0 }] : accounts });
    if (path.startsWith("/finance/accounts/")) {
      const acc = accounts.find((a) => path.endsWith("/" + a.id));
      if (!acc) return send(res, 404, { detail: "Hesap bulunamadı" });
      return send(res, 200, { account: acc, items: entries.filter((e) => e.account_id === acc.id), total: entries.length });
    }
    if (path === "/finance/entries" && req.method === "POST")
      return readBody((b) => {
        // Aşama 4 P1: işlem anahtarı (aynı anahtar → ilk sonuç, replayed); /__mode?entryFail=1 → işlenir ama 500 (bir kez).
        const ek = req.headers["idempotency-key"];
        console.log("entries key=" + ek + " category=" + b.category);
        if (ek && entryKeys.has(ek)) return send(res, 200, { id: "cash_entry:" + ek + ":main", replayed: true });
        if (ek) entryKeys.add(ek);
        if (state.entryFail === "1") { state.entryFail = "0"; const acc0 = accounts.find((a) => a.id === b.account_id); if (acc0) acc0.balance += b.entry_type === "income" ? b.amount : -b.amount; return send(res, 500, { code: "INTERNAL", detail: "Sunucu hatası" }); }
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
      return send(res, 200, { items: parties.filter((p) => { const q = (url.searchParams.get("search") || "").toLowerCase(); const bs = url.searchParams.get("balance_status"); const rl = url.searchParams.get("role"); return (!q || p.name.toLowerCase().includes(q)) && (!bs || (bs === "receivable" ? p.balance > 0 : p.balance < 0)) && (!rl || (rl === "supplier" ? p.balance < 0 : p.balance >= 0)); }), total: parties.length, page: 1, per_page: 30, total_pages: 1, summary: { total_receivable: 19050.5, total_payable: 9400, by_currency: { TRY: { total_receivable: 19050.5, total_payable: 9400 }, USD: { total_receivable: 1200, total_payable: 0 } } } });
    // C5: cari oku / düzenle / sil / siparişleri
    let ca; // Dalga 1: cari arşivle
    if ((ca = path.match(/^\/customers\/([^/]+)\/(archive|unarchive)$/)) && req.method === "POST") {
      const party = parties.find((p) => p.id === decodeURIComponent(ca[1]));
      if (!party) return send(res, 404, { detail: "Müşteri bulunamadı" });
      party.archived = ca[2] === "archive"; console.log("WRITE ARCHIVE", path); return send(res, 200, { ok: true, archived: party.archived });
    }
    let cm; // c5
    if ((cm = path.match(/^\/customers\/([^/]+)$/))) {
      const party = parties.find((p) => p.id === decodeURIComponent(cm[1]));
      if (!party) return send(res, 404, { detail: "Müşteri bulunamadı" });
      if (req.method === "GET") return send(res, 200, { contact_role: "customer", customer_type: "individual", ...party });
      if (req.method === "DELETE" && Math.abs(party.balance) > 0.004) return send(res, 409, { detail: { code: "CUSTOMER_HAS_BALANCE", message: "Bu carinin açık bakiyesi var; bakiye kapanmadan silinemez." } });
      if (req.method === "DELETE" && party.has_activity) return send(res, 409, { code: "CUSTOMER_HAS_ACTIVITY", detail: "Hesap hareketi olan cari silinemez; bakiyesi sıfır olsa da faturaları ve tahsilatları bu kartta durur. Kartı silmek yerine arşivleyin." });
      if (req.method === "DELETE") { parties.splice(parties.indexOf(party), 1); console.log("WRITE DELETE", path); return send(res, 200, { ok: true }); }
      if (req.method === "PUT") return readBody((b) => { if ("opening_balance" in b) console.log("UYARI: opening_balance gönderildi"); Object.assign(party, b); send(res, 200, party); });
    }
    if ((cm = path.match(/^\/customers\/([^/]+)\/orders$/)))
      return send(res, 200, { items: orders.slice(0, 3).map((o, i) => ({ id: o.id, channel_order_id: o.channel_order_id, channel: o.channel, status: o.status, total_amount: o.total_amount, currency: "TRY", order_date: o.order_date, ...(i === 0 ? { invoice_number: "OBI2026101" } : i === 1 ? { parasut_invoice_id: 98765 } : {}) })), total: 3 });
    // C8: teklif oluşturma (Paraşüt kişi/ürün arama + POST /parasut/sales-offers; /__mode?offerFail=1 → teklif oluşur ama 502)
    if (path === "/parasut/contacts") {
      const q = (url.searchParams.get("search") || "").toLocaleLowerCase("tr-TR");
      const all = [{ id: "k1", name: "Acme Ticaret A.Ş.", email: "satin@acme.test", city: "İstanbul" }, { id: "k2", name: "Elif Kaya", email: "elif@example.test", city: "Ankara" }, { id: "k3", name: "Acar Lojistik", city: "İzmir" }];
      return send(res, 200, { contacts: all.filter((c) => !q || c.name.toLocaleLowerCase("tr-TR").includes(q)), total: 3 });
    }
    if (path === "/parasut/products") return send(res, 200, { items: [{ id: "pp1", name: "Danışmanlık (saat)", list_price: "1250.50", vat_rate: "20", currency: "TRL" }, { id: "pp2", name: "Kurulum hizmeti", sales_price: 800, vat_rate: "18" }, { id: "pp3", name: "Kitap", list_price: "95", vat_rate: "0" }], total: 3 });
    if (path === "/parasut/sales-offers" && req.method === "POST")
      return readBody((b) => {
        const key = req.headers["idempotency-key"];
        const bodyText = JSON.stringify(b);
        console.log("OFFER-CREATE key=" + (key || "-") + " " + bodyText);
        if (key && offerKeys.has(key)) {
          const prev = offerKeys.get(key);
          if (prev.body !== bodyText) return send(res, 409, { code: "IDEMPOTENCY_CONFLICT", detail: "Farklı gövde." });
          if (!prev.out) return send(res, 409, { code: "PARASUT_RESULT_UNCERTAIN", detail: "Sonuç belirsiz." });
          return send(res, 200, { ...prev.out, replayed: true });
        }
        if (!b.contact_id) return send(res, 422, { detail: "contact_id zorunlu" });
        const r2 = (n) => Math.round(n * 100) / 100;
        let sub = 0, disc = 0, vat = 0;
        const line_items = b.items.map((it, i) => { const g = it.quantity * it.unit_price; const d = it.discount_type === "amount" ? it.discount_value : g * it.discount_value / 100; sub += g; disc += d; vat += (g - d) * it.vat_rate / 100; return { id: "ol" + i, description: it.description, quantity: it.quantity, unit_price: it.unit_price, vat_rate: it.vat_rate, discount_type: it.discount_type, discount_value: it.discount_value }; });
        const c = { k1: "Acme Ticaret A.Ş.", k2: "Elif Kaya", k3: "Acar Lojistik" }[b.contact_id] || "Müşteri";
        const offer = { id: "of" + Date.now(), description: b.description, issue_date: b.issue_date, due_date: b.due_date, currency: b.currency, status: "waiting", contact_id: b.contact_id, contact_name: c, net_total: r2(sub - disc + vat).toFixed(2), gross_total: r2(sub - disc + vat).toFixed(2), subtotal: r2(sub).toFixed(2), total_vat: r2(vat).toFixed(2), total_discount: r2(disc).toFixed(2), computed_total_discount: r2(disc).toFixed(2), line_items };
        const out = { id: offer.id, description: offer.description, status: offer.status, gross_total: offer.gross_total, currency: offer.currency, parasut_url: null, replayed: false };
        // 13 Kas sözleşmesi: /__mode?offerFail=codeless|pending|timeout|validation|presend (bir kez)
        const mode = state.offerFail; state.offerFail = "0";
        if (mode === "validation") return send(res, 422, { code: "PARASUT_VALIDATION", detail: "Vergi numarası geçersiz" });
        if (mode === "presend") return send(res, 503, { code: "PARASUT_PRESEND_UNAVAILABLE", detail: "Paraşüt'e bağlanılamadı, teklif gönderilmedi. Tekrar deneyin." });
        if (mode === "pending") { console.log("OFFER pending"); return send(res, 409, { code: "OPERATION_PENDING", detail: "İşlem sürüyor." }); }
        offers.unshift(offer);
        if (key) offerKeys.set(key, { body: bodyText, out: mode === "timeout" ? null : out });
        if (mode === "timeout") return send(res, 504, { code: "PARASUT_TIMEOUT", detail: "Paraşüt zamanında yanıt vermedi." });
        if (mode === "codeless") return send(res, 502, { detail: "Bad gateway" });
        send(res, 200, out);
      });
    let om;
    if ((om = path.match(/^\/parasut\/sales-offers\/([^/]+)$/)) && req.method === "GET") {
      const o = offers.find((x) => x.id === om[1]);
      return o ? send(res, 200, o) : send(res, 404, { detail: "Teklif bulunamadı" });
    }
    // Aşama 4 / P8: dağıtım durumu ve avans dağıtımı
    let am;
    const openFor = (cid) => localInvoices.filter((i) => i.customer_id === cid && i.currency === "TRY" && i.remaining_amount > 0.004).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    // K9: cari virman (Idempotency-Key zorunlu)
    let tm;
    if ((tm = path.match(/^\/customers\/([^/]+)\/transfers(?:\/([^/]+))?$/))) {
      const party = parties.find((p) => p.id === decodeURIComponent(tm[1]));
      if (!party) return send(res, 404, { code: "CUSTOMER_NOT_FOUND", detail: "Cari bulunamadı" });
      if (req.method === "GET") return send(res, 200, { items: transfers.filter((t) => t.source_customer_id === party.id || t.target_customer_id === party.id).map((t) => ({ ...t, direction: t.source_customer_id === party.id ? "out" : "in" })), total: transfers.length });
      const key = req.headers["idempotency-key"];
      if (!key) return send(res, 422, { code: "IDEMPOTENCY_KEY_REQUIRED", detail: "İşlem anahtarı gerekli." });
      return readBody((b) => {
        console.log(`TRANSFER ${req.method} ${path} key=${key} body=${JSON.stringify(b)}`);
        if (trKeys.has(key)) return send(res, 200, { ...trKeys.get(key), replayed: true });
        if (req.method === "POST") {
          const tgt = parties.find((p) => p.id === b.target_customer_id);
          if (!tgt) return send(res, 404, { code: "CUSTOMER_NOT_FOUND", detail: "Hedef cari bulunamadı" });
          if (tgt.id === party.id) return send(res, 422, { code: "TRANSFER_SAME_CUSTOMER", detail: "Aynı cari" });
          if (!String(b.note || "").trim()) return send(res, 422, { code: "TRANSFER_NOTE_REQUIRED", detail: "Açıklama zorunlu" });
          const t = { id: "t" + Date.now(), source_customer_id: party.id, source_name: party.name, target_customer_id: tgt.id, target_name: tgt.name, currency: "TRY", amount: Number(b.amount).toFixed(2), date: b.date, note: b.note, voided: false, replayed: false };
          transfers.push(t); party.balance -= Number(b.amount); tgt.balance += Number(b.amount);
          trKeys.set(key, t);
          if (state.colFail === "1") { state.colFail = "0"; return send(res, 500, { code: "MONEY_INCOMPLETE", detail: "İşlem tamamlanamadı." }); }
          return send(res, 200, t);
        }
        const t = transfers.find((x) => x.id === tm[2]);
        if (!t) return send(res, 404, { code: "TRANSFER_NOT_FOUND", detail: "Virman bulunamadı" });
        if (t.voided) return send(res, 409, { code: "TRANSFER_VOIDED", detail: "Virman silinmiş" });
        const src = parties.find((p) => p.id === t.source_customer_id), tgt = parties.find((p) => p.id === t.target_customer_id);
        src.balance += Number(t.amount); tgt.balance -= Number(t.amount); t.voided = true;
        if (req.method === "DELETE") { const out = { ok: true, voided: true, transfer_id: t.id, operation_id: "op" + Date.now(), transfer: t, replayed: false }; trKeys.set(key, out); return send(res, 200, out); }
        const nt = { ...t, id: "t" + Date.now(), amount: Number(b.amount ?? t.amount).toFixed(2), date: b.date || t.date, note: b.note ?? t.note, voided: false, replaces: t.id };
        t.replaced_by = nt.id; transfers.push(nt); src.balance -= Number(nt.amount); tgt.balance += Number(nt.amount);
        const out = { ok: true, mode: "replaced", replaced: t.id, replaced_by: nt.id, operation_id: "op" + Date.now(), transfer: nt, replayed: false };
        trKeys.set(key, out); send(res, 200, out);
      });
    }
    // K8: "Eşleşmeyi kaldır"
    if (req.method === "DELETE" && (tm = path.match(/^\/local-invoices\/([^/]+)\/allocations\/([^/]+)$/))) {
      const inv = localInvoices.find((i) => i.id === tm[1]);
      if (!inv) return send(res, 404, { code: "INVOICE_NOT_FOUND", detail: "Fatura bulunamadı" });
      const p = inv.payments.find((x) => x.id === tm[2]);
      if (!p) return send(res, 404, { code: "COLLECTION_NOT_FOUND", detail: "Eşleşme bulunamadı" });
      if (p.source !== "customer_payment") return send(res, 409, { code: "COLLECTION_NOT_ALLOCATION", detail: "Doğrudan tahsilat" });
      console.log("UNMATCH", tm[1], tm[2], "key=" + req.headers["idempotency-key"]);
      inv.payments = inv.payments.filter((x) => x !== p); inv.voided_payments.push({ ...p, released: true });
      inv.paid_amount -= Number(p.amount); inv.remaining_amount += Number(p.amount);
      const c1 = parties.find((x) => x.id === inv.customer_id); if (c1) c1.advance = Number(c1.advance || 0) + Number(p.amount);
      return send(res, 200, { ok: true, operation_id: "op" + Date.now(), released: [{ payment_id: p.id, amount: p.amount }], released_amount: Number(p.amount), credit_remaining: c1 ? c1.advance : 0, currency: "TRY", invoice: { invoice_id: inv.id, status: inv.status, paid_amount: inv.paid_amount, remaining_amount: inv.remaining_amount }, warnings: [], warning_texts: [], replayed: false });
    }
    if ((am = path.match(/^\/customers\/([^/]+)\/allocation-state$/))) {
      const party = parties.find((p) => p.id === am[1]);
      if (!party) return send(res, 404, { detail: "Müşteri bulunamadı" });
      // K8/K10: credit, has_credit, can_match, match_blocked_reason (/__mode?ledgerBlock=pending|issue)
      const credit = Number(party.advance || 0);
      const opens = openFor(party.id).filter((i) => i.status !== "taslak");
      const blocked = state.ledgerBlock === "pending" ? "ledger_pending" : state.ledgerBlock === "issue" ? "ledger_issue" : null;
      return send(res, 200, { currency: "TRY", advance: credit.toFixed(2), credit, has_credit: credit > 0, can_match: !blocked && credit > 0 && opens.length > 0, match_blocked_reason: blocked,
        open_invoices: openFor(party.id).map((i) => ({ id: i.id, invoice_number: i.invoice_number, invoice_date: i.issue_date, due_date: i.due_date, total: Number(i.total).toFixed(2), remaining: Number(i.remaining_amount).toFixed(2), status: i.status })) });
    }
    const applyAlloc = (party, items) => {
      for (const it of items) { const i = localInvoices.find((q) => q.id === it.invoice_id); const a = Number(it.amount); i.paid_amount += a; i.remaining_amount -= a; i.payments.push({ id: "al" + Date.now() + i.id, amount: a, date: new Date().toISOString().slice(0, 10), method: "havale", source: "customer_payment" }); }
    };
    const checkAlloc = (party, items) => {
      const seen = new Set();
      for (const it of items) {
        const i = localInvoices.find((q) => q.id === it.invoice_id);
        if (!i || i.customer_id !== party.id || seen.has(it.invoice_id)) return [422, { code: "ALLOCATION_INVALID", detail: "Dağıtım geçersiz." }];
        seen.add(it.invoice_id);
        if (i.status === "taslak") return [409, { code: "INVOICE_NOT_ISSUED", detail: "Taslak faturaya dağıtım yapılamaz." }];
        if (Number(it.amount) > i.remaining_amount + 0.004) return [409, { code: "PAYMENT_EXCEEDS_REMAINING", detail: "Fatura kalanı aşıldı." }];
      }
      return null;
    };
    if (req.method === "POST" && (am = path.match(/^\/customers\/([^/]+)\/allocations$/))) {
      const party = parties.find((p) => p.id === am[1]);
      const key = req.headers["idempotency-key"];
      return readBody((b) => {
        console.log(`ALLOCATE key=${key} body=${JSON.stringify(b)}`);
        if (key && payKeys.has(key)) return send(res, 200, { ...payKeys.get(key), replayed: true });
        const items = Array.isArray(b.allocations) ? b.allocations : [];
        if (!items.length) return send(res, 422, { code: "ALLOCATION_REQUIRED", detail: "En az bir dağıtım gerekli." });
        const bad = checkAlloc(party, items); if (bad) return send(res, bad[0], bad[1]);
        const total = items.reduce((t, x) => t + Math.round(Number(x.amount) * 100), 0);
        if (total > Math.round(Number(party.advance || 0) * 100)) return send(res, 409, { code: "ADVANCE_INSUFFICIENT", detail: "Avans yetersiz." });
        applyAlloc(party, items); party.advance = (Math.round(Number(party.advance) * 100) - total) / 100;
        const out = { ok: true, allocations: items, skipped: [], advance_remaining: party.advance.toFixed(2), currency: "TRY", replayed: false };
        if (key) payKeys.set(key, out);
        if (state.colFail === "1") { state.colFail = "0"; return send(res, 500, { code: "MONEY_INCOMPLETE", detail: "İşlem tamamlanamadı." }); }
        send(res, 200, out);
      });
    }
    const partyMatch = path.match(/^\/customers\/([^/]+)\/(ledger|payments)$/);
    if (partyMatch) {
      const party = parties.find((p) => p.id === partyMatch[1]);
      if (!party) return send(res, 404, { detail: "Müşteri bulunamadı" });
      if (partyMatch[2] === "ledger")
      {
        // P3: sayfalı ekstre (en yeni önce). 130 satır → 100 + 30.
        const all = [
          ...party.payments.map((pay, i) => ({ id: "pay" + i, date: today, description: "Tahsilat", credit: pay, balance: party.balance, currency: "TRY" })),
          ...(party.id === "c1" ? colLedgerRows(party) : []),
          // K9: virman satırları (kind "adjustment"; etkinse actions edit/void)
          ...transfers.filter((t) => t.source_customer_id === party.id || t.target_customer_id === party.id).map((t) => {
            const out = t.source_customer_id === party.id;
            return { id: "tr-" + t.id, date: t.date, kind: "adjustment", description: out ? `Virman: ${t.target_name} carisine` : `Virman: ${t.source_name} carisinden`, reference: t.note,
              credit: out ? Number(t.amount) : undefined, debit: out ? undefined : Number(t.amount), currency: "TRY", reversed: t.voided, transfer: { ...t, direction: out ? "out" : "in" }, actions: t.voided ? { edit: false, void: false } : { edit: true, void: true } };
          }),
          { id: "l1", date: "2026-11-02", description: "Satış faturası OBI2026101", debit: 6200, balance: 6200, currency: "TRY", reversed: false },
          { id: "l2", date: "2026-10-30", description: "Satış faturası OBI2026099", debit: 900, balance: 0, currency: "TRY", reversed: true },
          ...Array.from({ length: 127 }, (_, i) => ({ id: "old" + i, date: "2026-0" + (1 + (i % 9)) + "-15", description: "Satış faturası ESK" + (1000 + i), debit: 100, balance: 0, currency: "TRY" })),
        ];
        const pg = Math.max(1, Number(url.searchParams.get("page") || 1)); const pp = Math.min(1000, Number(url.searchParams.get("per_page") || 100));
        console.log("LEDGER page=" + pg + " per_page=" + pp);
        const balances = [{ currency: "TRY", balance: party.balance }, ...(party.id === "c1" ? [{ currency: "USD", balance: 350 }] : [])];
        return send(res, 200, { balance: party.balance, balance_currency: "TRY", balances, total: all.length, page: pg, per_page: pp, items: all.slice((pg - 1) * pp, pg * pp) });
      }
      return readBody((b) => {
        const pk = req.headers["idempotency-key"];
        console.log("PARTY-PAY key=" + (pk || "-") + " account=" + (b.account_id || "-") + " allocations=" + JSON.stringify(b.allocations));
        if (pk && payKeys.has(pk)) return send(res, 200, { ...payKeys.get(pk), replayed: true });
        console.log("PARTY-PAY body=" + JSON.stringify(b));
        if (state.curMismatch === "1") return send(res, 422, { code: "CURRENCY_MISMATCH", detail: "Hesap para birimi uyuşmuyor." });
        const amt = Number(b.amount);
        let items;
        if (Array.isArray(b.allocations)) {
          items = b.allocations;
          const sum = items.reduce((t, x) => t + Math.round(Number(x.amount) * 100), 0);
          if (sum > Math.round(amt * 100)) return send(res, 422, { code: "ALLOCATION_EXCEEDS_AMOUNT", detail: "Dağıtım tutarı aşıyor." });
          const bad = checkAlloc(party, items); if (bad) return send(res, bad[0], bad[1]);
        } else {
          let left = Math.round(amt * 100); items = [];
          for (const i of openFor(party.id).filter((x) => x.status !== "taslak")) { if (left <= 0) break; const take = Math.min(left, Math.round(i.remaining_amount * 100)); items.push({ invoice_id: i.id, amount: (take / 100).toFixed(2) }); left -= take; }
        }
        const allocatedC = items.reduce((t, x) => t + Math.round(Number(x.amount) * 100), 0);
        applyAlloc(party, items);
        party.balance -= amt; party.payments.unshift(amt); party.advance = Number(party.advance || 0) + (Math.round(amt * 100) - allocatedC) / 100;
        const out = { id: "pm" + Date.now(), amount: amt.toFixed(2), currency: party.currency || "TRY", allocated_amount: (allocatedC / 100).toFixed(2), advance_amount: ((Math.round(amt * 100) - allocatedC) / 100).toFixed(2), allocations: items, skipped: [], replayed: false };
        if (pk) payKeys.set(pk, out);
        if (state.payFail === "1") { state.payFail = "0"; return send(res, 500, { code: "INTERNAL", detail: "Sunucu hatası" }); }
        send(res, 200, out);
      });
    }
    // Aşama 4 / P11: tahsilat sil / düzenle (cari ve fatura)
    let cx;
    if ((cx = path.match(/^\/(customers|local-invoices)\/([^/]+)\/payments\/([^/]+)$/)) && (req.method === "DELETE" || req.method === "PATCH")) {
      const [, kind, ownerId, pid] = cx;
      const key = req.headers["idempotency-key"];
      if (!key) return send(res, 400, { code: "IDEMPOTENCY_KEY_REQUIRED", detail: "İşlem anahtarı gerekli." });
      if (colKeys.get(key)) return send(res, 200, { ...colKeys.get(key), replayed: true });
      const li1 = localInvoices.find((i) => i.id === "li1");
      const c1 = parties.find((p) => p.id === "c1");
      return readBody((b) => {
        console.log(`COLLECTION ${req.method} ${path} key=${key} body=${JSON.stringify(b)}`);
        let target, inv, parasut = false;
        if (kind === "customers") {
          const party = parties.find((p) => p.id === decodeURIComponent(ownerId));
          target = (party?.collections || []).find((c) => c.id === pid);
          if (!target) {
            inv = li1; target = inv.payments.find((p) => p.id === pid && p.source !== "customer_payment");
            if (!target) return send(res, 404, { code: "COLLECTION_NOT_FOUND", detail: "Tahsilat bulunamadı." });
            parasut = Boolean(target.parasut_synced);
          }
        } else {
          inv = localInvoices.find((i) => i.id === decodeURIComponent(ownerId));
          target = inv && inv.payments.find((p) => p.id === pid);
          if (!target) return send(res, 404, { code: "COLLECTION_NOT_FOUND", detail: "Tahsilat bulunamadı." });
          if (target.source === "customer_payment") return send(res, 409, { code: "COLLECTION_IS_CUSTOMER_PAYMENT", detail: "Bu satır cari tahsilatından dağıtılmış; cariden silin." });
          parasut = Boolean(target.parasut_synced);
        }
        if (target.voided) return send(res, 409, { code: "COLLECTION_VOIDED", detail: "Tahsilat zaten silinmiş." });
        if (state.colFail === "1") { state.colFail = "0"; colKeys.set(key, null); return send(res, 500, { code: "MONEY_INCOMPLETE", detail: "İşlem tamamlanamadı." }); }
        const warn = parasut ? { warnings: ["PARASUT_NOT_UPDATED"], warning_texts: ["Bu tahsilat Paraşüt'e de işlenmişti; Paraşüt'teki kayıt değiştirilmedi."] } : { warnings: [], warning_texts: [] };
        const amt = Number(target.amount);
        let out;
        if (req.method === "DELETE") {
          target.voided = true;
          c1.balance += amt;
          if (inv) { inv.payments = inv.payments.filter((p) => p !== target); inv.voided_payments.push(target); }
          const back = inv ? [{ invoice_id: inv.id, amount: amt }] : (target.invoices || []);
          for (const x of back) { const i = localInvoices.find((q) => q.id === x.invoice_id); if (i) { i.paid_amount -= Number(x.amount); i.remaining_amount += Number(x.amount); if (!inv) i.payments = i.payments.filter((p) => p.id !== target.id); } }
          out = { ok: true, voided: true, payment_id: pid, operation_id: "op" + Date.now(), invoices: back.map((x) => ({ invoice_id: x.invoice_id, invoice_number: "OBI2026101" })), ...warn, replayed: false };
        } else {
          const newAmt = Number(b.amount ?? amt);
          const newDate = b.payment_date || b.date || target.date;
          const newAcc = b.account_id || target.account_id;
          const moneyChanged = Math.round(newAmt * 100) !== Math.round(amt * 100) || newDate !== target.date || newAcc !== target.account_id;
          if (inv && newAmt - amt > inv.remaining_amount + 0.004) return send(res, 409, { code: "PAYMENT_EXCEEDS_REMAINING", detail: "Tutar kalan borçtan büyük." });
          const diff = newAmt - amt;
          c1.balance -= diff;
          const invs = inv ? [inv] : (target.invoices || []).map((x) => localInvoices.find((q) => q.id === x.invoice_id)).filter(Boolean);
          for (const i of invs) { i.paid_amount += diff; i.remaining_amount -= diff; const row = i.payments.find((p) => p.id === target.id); if (row && row !== target) row.amount = newAmt; }
          Object.assign(target, { amount: typeof target.amount === "string" ? newAmt.toFixed(2) : newAmt, date: newDate, account_id: newAcc });
          if (kind === "customers" && !inv) Object.assign(target, { method: b.payment_method || target.method, note: b.note ?? target.note });
          else Object.assign(target, { method: b.method || b.payment_method || target.method, notes: b.notes ?? b.note ?? target.notes });
          out = { mode: moneyChanged ? "replaced" : "in_place", payment: target, replaced_by: moneyChanged ? "r" + Date.now() : null, ...warn, replayed: false,
            ...(inv ? { paid_amount: inv.paid_amount, remaining_amount: inv.remaining_amount, status: inv.status } : {}) };
        }
        colKeys.set(key, out);
        send(res, 200, out);
      });
    }
    if (path === "/finance/income-expense-summary") {
      const basis = url.searchParams.get("basis") || "accrual";
      const from = url.searchParams.get("date_from"), to = url.searchParams.get("date_to");
      console.log("IE-SUMMARY", from, to, basis);
      if (from && to && from > to) return send(res, 422, { code: "SUMMARY_PARAMS_INVALID", detail: "Başlangıç tarihi bitişten sonra olamaz." });
      if (state.ieEmpty === "1") return send(res, 200, { period: { from, to }, basis, currencies: [], scope: { excluded: [] } });
      const cash = basis === "cash";
      const src = (net, vat, count, origin = "obihub") => ({ net, vat: cash ? null : vat, gross: cash ? net : (Number(net) + Number(vat)).toFixed(2), count, origin });
      const tr = cash
        ? { currency: "TRY", income: { net: "21480.00", vat: null, gross: "21480.00", sources: { invoice_collections: src("12400.00", null, 3), customer_collections: src("4580.00", null, 2), pos: src("3800.00", null, 14), manual: src("700.00", null, 1) } },
            expense: { net: "9310.40", vat: null, gross: "9310.40", vat_unknown: "0.00", sources: { payable_payments: src("7810.40", null, 4), manual: src("1500.00", null, 2) } }, result: "12169.60", categories: [] }
        : { currency: "TRY", income: { net: "28250.00", vat: "5430.00", gross: "33680.00", sources: { sales_invoices: src("18500.00", "3700.00", 6), parasut_imported_invoices: src("6450.00", "1290.00", 4, "parasut"), pos: src("3166.67", "633.33", 14), manual: src("133.33", "0.00", 1) } },
            expense: { net: "13898.06", vat: "2180.00", gross: "16078.06", vat_unknown: "600.00", sources: { expense_records: src("12398.06", "2180.00", 9), manual: src("1500.00", "0.00", 2) } }, result: "14351.94",
            categories: [
              { kind: "income", category_id: "sales_invoices", name: "Satış faturaları", source: "sales_invoices", net: "18500.00" },
              { kind: "expense", category_id: "kira", name: "Kira", source: "expense_records", net: "6000.00" },
              { kind: "expense", category_id: "kargo", name: "Kargo giderleri", source: "expense_records", net: "3898.06" },
              { kind: "expense", category_id: "malzeme", name: "Ambalaj malzemesi", source: "expense_records", net: "2500.00" },
              { kind: "expense", category_id: "manual:other", name: "Diğer (kasa)", source: "manual", net: "1500.00" },
            ] };
      const usd = { currency: "USD", income: { net: "1000.00", vat: cash ? null : "200.00", gross: cash ? "1000.00" : "1200.00", sources: { sales_invoices: src("1000.00", "200.00", 1) } }, expense: { net: "0.00", vat: cash ? null : "0.00", gross: "0.00", vat_unknown: "0.00", sources: {} }, result: "1000.00", categories: [] };
      return send(res, 200, { period: { from, to }, basis, currencies: [tr, usd],
        scope: { source: "obihub_ledger", as_of: new Date().toISOString().slice(0, 10), parasut_last_import: cash ? null : "2026-11-01T10:00:00+00:00", unsplit_pos_mixed: 1, refund_split_unknown: cash ? 0 : 2,
          excluded: cash ? ["internal_transfers", "pos_not_posted_to_cash"] : ["uninvoiced_orders", "purchase_invoices_in_parasut", "draft_quote_cancelled_invoices", "internal_transfers"] } });
    }
    if (path === "/local-invoices/summary") return send(res, 200, { total_remaining: localInvoices.filter((i) => i.currency === "TRY" && i.status !== "taslak").reduce((n, i) => n + i.remaining_amount, 0), overdue_amount: 6200, overdue_count: 1, scalar_currency: "TRY", by_currency: { USD: { total_remaining: localInvoices.filter((i) => i.currency === "USD").reduce((n, i) => n + i.remaining_amount, 0), overdue_amount: 0 } } });
    // Yeni satış faturası: her zaman taslak açılır, tutarlar kalemlerden hesaplanır (backend/routers/local_invoices.py create_invoice)
    // G2: belge meta ve önizleme (sahte hesap; gerçek kural backend/documents/totals.py). P1 gövdesi create_key ile idempotent.
    if (path === "/documents/meta")
      return send(res, 200, { vat_rates: [0, 1, 10, 20], units: [{ key: "ADET", label: "Adet" }, { key: "KGM", label: "Kilogram" }, { key: "LTR", label: "Litre" }, { key: "SAAT", label: "Saat" }], withholding: [20, 30, 40, 50, 70, 90, 100].map((rate) => ({ code: null, label: `${rate / 10}/10`, rate })),
        tax_codes: [{ code: "0071", label: "ÖTV", types: ["rate", "amount"] }, { code: "4080", label: "ÖİV", types: ["rate"] }, { code: "0059", label: "Konaklama vergisi", types: ["rate"] }],
        doc_taxes: { stopaj_rates: [20, 17, 15, 10, 5, 3], accommodation_rates: [0, 1] }, stock: { owner: "obihub", default_mode: "with_document", warehouses: [{ id: "w1", name: "Ana depo" }] } });
    if (path === "/documents/preview" && req.method === "POST")
      return readBody((b) => {
        const f2 = (n) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
        const L = (b.lines || []).map((l) => {
          const gross = Number(l.quantity) * Number(l.unit_price);
          const d = l.discount ? (l.discount.type === "percentage" ? (gross * Number(l.discount.value)) / 100 : Number(l.discount.value)) : 0;
          return { l, gross, d, net: gross - d };
        });
        const net0 = L.reduce((n, x) => n + x.net, 0);
        const dd = b.doc_discount ? (b.doc_discount.type === "percentage" ? (net0 * Number(b.doc_discount.value)) / 100 : Number(b.doc_discount.value)) : 0;
        let vat = 0, ot = 0, wh = 0;
        const lines = L.map((x) => {
          const share = net0 ? (dd * x.net) / net0 : 0;
          const net = x.net - share;
          const taxes = (x.l.other_taxes || []).reduce((n, t) => n + (t.type === "rate" ? (net * Number(t.value)) / 100 : Number(t.value)), 0);
          const otv = (x.l.other_taxes || []).filter((t) => t.code === "0071").reduce((n, t) => n + (t.type === "rate" ? (net * Number(t.value)) / 100 : Number(t.value)), 0);
          const v = ((net + otv) * Number(x.l.vat_rate)) / 100;
          const w = b.withholding_all && !x.l.withholding && v > 0 ? b.withholding_all : x.l.withholding;
          const lw = w ? (v * Number(w.rate)) / 100 : 0;
          vat += v; ot += taxes; wh += lw;
          return { line_key: x.l.line_key, line_net: f2(net), line_vat: f2(v), line_total: f2(net + taxes + v), line_discount: f2(x.d), doc_discount_share: f2(share), line_withholding: f2(lw), line_other_taxes: f2(taxes) };
        });
        const gross = L.reduce((n, x) => n + x.gross, 0), ld = L.reduce((n, x) => n + x.d, 0), sub = net0 - dd;
        const totals = { gross: f2(gross), line_discount: f2(ld), doc_discount: f2(dd), discount: f2(ld + dd), subtotal: f2(sub), other_taxes: f2(ot), vat: f2(vat), withholding: f2(wh) };
        let total = sub + ot + vat;
        if (b.accommodation_tax_rate != null) { const a = (sub * Number(b.accommodation_tax_rate)) / 100; totals.accommodation_tax = f2(a); total += a; }
        let st = 0;
        if (b.stopaj_rate) { st = (sub * Number(b.stopaj_rate)) / 100; totals.stopaj = f2(st); }
        totals.total = f2(total); totals.payable = f2(total - wh - st);
        send(res, 200, { lines, totals, profit: null, stock_warnings: [], warnings: [] });
      });
    if (path === "/local-invoices" && req.method === "POST")
      return readBody((b) => {
        if (!Array.isArray(b.items) || b.items.length === 0) return send(res, 400, { detail: "Faturada en az bir satır olmalı" });
        console.log("WRITE /local-invoices", JSON.stringify(b).slice(0, 600));
        if (b.create_key) {
          const prev = localInvoices.find((i) => i.create_key === b.create_key);
          if (prev) return send(res, 200, prev);
          const issued = b.action === "issue";
          const inv = { id: "li" + Date.now(), doc_schema: 1, create_key: b.create_key, invoice_number: issued ? "OBI2026" + String(130 + localInvoices.length) : "", invoice_type: "satis",
            status: issued ? "gonderildi" : "taslak", display_status: issued ? "gonderildi" : "taslak", money_state: issued ? "pending" : "not_issued", note_options: b.note_options || null,
            customer_id: b.customer_id, customer_name: b.customer_name, document_name: b.document_name || null, issue_date: b.issue_date, due_date: b.due_date, currency: "TRY", subtotal: 0, discount_amount: 0, vat_amount: 0, total: 0, paid_amount: 0, remaining_amount: 0,
            stopaj_rate: b.stopaj_rate || null, accommodation_tax_rate: b.accommodation_tax_rate ?? null, stock_mode: b.stock_mode, items: b.items, payments: [], voided_payments: [] };
          localInvoices.unshift(inv);
          return send(res, 200, inv);
        }
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
      const vw = url.searchParams.get("view");
      if (vw && !VIEW_FILTER[vw]) return send(res, 422, { code: "FILTER_INVALID", detail: "Görünüm geçersiz." });
      const it = url.searchParams.get("invoice_type") || "satis";
      const qo = url.searchParams.get("quote_outcome");
      const rows = localInvoices.filter((i) => (i.invoice_type || "satis") === it && (!st || i.status === st) && (vw ? VIEW_FILTER[vw](i) : !i.archived) && (!qo || QUOTE_FILTER[qo](i)));
      return send(res, 200, { items: rows, total: rows.length, page: 1, per_page: 30, total_pages: 1 });
    }
    // C4 eki: Paraşüt tahsilat senkronu
    if (path === "/local-invoices/import/parasut/capabilities") return send(res, 200, { import_sales: true, import_purchases: false, payment_sync: state.psCaps !== "0" });
    if (path === "/parasut/accounts") return send(res, 200, [{ id: 11, name: "Paraşüt Kasa" }, { id: 12, name: "Paraşüt Akbank" }]);
    let pz;
    if (req.method === "POST" && (pz = path.match(/^\/local-invoices\/([^/]+)\/payments\/([^/]+)\/(parasut-sync|parasut-resolve)$/))) {
      const inv = localInvoices.find((i) => i.id === pz[1]);
      const p = inv && inv.payments.find((x) => x.id === pz[2]);
      if (!p) return send(res, 404, { detail: "Tahsilat bulunamadı" });
      return readBody((b) => {
        console.log(`PARASUT ${pz[3]} ${pz[2]} body=${JSON.stringify(b)}`);
        if (pz[3] === "parasut-resolve") { delete p.parasut_synced; p.parasut_sync_state = b.outcome === "synced" ? "synced" : "failed"; p.parasut_sync_error = b.outcome === "synced" ? undefined : "Paraşüt'te yok olarak işaretlendi"; return send(res, 200, { ok: true }); }
        if (p.parasut_sync_state === "not_sent" && !b.parasut_account_id) return send(res, 200, { ok: false, error: "Paraşüt hesabı seçin." });
        p.parasut_sync_state = "synced"; p.parasut_sync_error = undefined;
        send(res, 200, { ok: true });
      });
    }
    // D-12 yaşam döngüsü: iptal (gerekçe, e-belge adımı), iade, kopya, arşiv, geçmiş, PDF.
    let lcm;
    if ((lcm = path.match(/^\/local-invoices\/([^/]+)\/(cancel|cancel\/edoc|returns|copy|archive|unarchive|events|pdf|share|share-preview)$/))) {
      const inv = localInvoices.find((i) => i.id === lcm[1]);
      if (!inv) return send(res, 404, { code: "NOT_FOUND", detail: "Fatura bulunamadı." });
      const ev = (type, summary, data = {}) => (inv.events = [{ id: "ev" + Date.now() + Math.random(), type, at: new Date().toISOString(), actor: { name: "Demo Kullanıcı" }, summary, data }, ...(inv.events || [])]);
      const op = lcm[2];
      if (op === "events") return send(res, 200, { items: inv.events || [{ id: "ev0", type: "created", at: "2026-11-14T09:00:00+03:00", actor: { name: "Demo Kullanıcı" }, summary: "Fatura oluşturuldu" }], next_before: null });
      if (op === "share-preview") return send(res, 200, { kind: inv.invoice_type === "teklif" ? "quote" : "invoice", to: ["elif@example.test"], subject: `Deneme A.Ş. · Fatura ${inv.invoice_number}`, message: "", attachment: { type: "link", official: inv.status === "resmilesti" }, can_send: true });
      if (op === "pdf") { res.writeHead(200, { "Content-Type": "application/pdf", "Access-Control-Allow-Origin": "*" }); return res.end(Buffer.from("%PDF-1.4\n%mock\n")); }
      if (op === "returns" && req.method === "GET") return send(res, 200, { items: [], returned_totals: inv.returned_totals || {} });
      return readBody((b) => {
        console.log("WRITE", path, JSON.stringify(b));
        if (op === "cancel") {
          if (String(b.reason || "").trim().length < 3) return send(res, 422, { code: "CANCEL_REASON_REQUIRED", detail: "İptal gerekçesi zorunlu." });
          if (inv.paid_amount > 0) return send(res, 409, { code: "HAS_PAYMENTS", detail: "Tahsilatı olan fatura iptal edilemez." });
          if (inv.edoc_state === "done" && !inv.edoc_cancelled) return send(res, 409, { code: "EDOC_CANCEL_REQUIRED", detail: "e-Belge iptali gerekli." });
          Object.assign(inv, { status: "iptal", display_status: "iptal", lifecycle: "cancelled", cancel_reason: b.reason, money_state: "not_issued" }); ev("cancelled", "Fatura iptal edildi", { reason: b.reason });
          return send(res, 200, { ok: true, id: inv.id, status: "iptal", lifecycle: "cancelled", replayed: false });
        }
        if (op === "cancel/edoc") {
          if (inv.edoc_type === "e_invoice") return send(res, 409, { code: "EDOC_CANCEL_NOT_SUPPORTED", detail: "e-Fatura iptal edilemez." });
          Object.assign(inv, { edoc_cancelled: true, edoc_cancelled_at: new Date().toISOString(), edoc_state: "cancelled", status: "gonderildi", display_status: "gonderildi", actions: { ...(inv.actions || {}), cancel_edoc: false, official_pdf: false } });
          ev("edoc_cancelled", "e-Belge iptal edildi"); return send(res, 200, { ok: true, edoc_state: "cancelled", next: "cancel" });
        }
        if (op === "share") {
          if (b.confirm !== true) return send(res, 409, { code: "CONFIRM_REQUIRED", detail: "Onay gerekli." });
          ev("shared", "Paylaşıldı"); return send(res, 200, { ok: true, sent_to: (b.to || []).map((a) => a.replace(/^(.).*@/, "$1***@")), replayed: false });
        }
        if (op === "returns") {
          inv.returned_totals = inv.returned_totals || {};
          for (const l of b.lines || []) inv.returned_totals[l.source_line_key] = String(Number(inv.returned_totals[l.source_line_key] || 0) + Number(l.quantity));
          const r = { id: "ret" + Date.now(), invoice_type: "iade", return_of: inv.id, kind: b.kind, status: "taslak", display_status: "taslak", customer_name: inv.customer_name, invoice_number: "", issue_date: b.date, currency: "TRY", total: 0, items: [], payments: [], voided_payments: [] };
          localInvoices.unshift(r); ev("returned", "İade oluşturuldu");
          return send(res, 201, { ...r, replayed: false, warnings: [] });
        }
        if (op === "copy") {
          const c = { ...inv, id: "li" + Date.now(), status: "taslak", display_status: "taslak", money_state: "not_issued", invoice_number: "", paid_amount: 0, payments: [], copied_from: inv.id, issue_date: "2026-11-15", events: [], archived: false };
          localInvoices.unshift(c); ev("copied", "Kopyalandı");
          return send(res, 201, c);
        }
        inv.archived = op === "archive"; ev(op === "archive" ? "archived" : "unarchived", op === "archive" ? "Arşivlendi" : "Arşivden çıkarıldı");
        return send(res, 200, { ok: true, archived: inv.archived });
      });
    }
    if (path === "/finance/fx-rates") return send(res, 200, { date: "2026-11-16", rate_date: "2026-11-14", available: true, source: "tcmb", rates: { USD: { buying: "34.3796", selling: "34.4416" }, EUR: { buying: "36.5", selling: "36.6" } } });
    // Dalga 3: çekler (portföy; kasaya girmez).
    state.cheques = state.cheques || [{ id: "chq1", direction: "received", status: "portfoy", status_label: "Portföyde", amount: "2500.00", currency: "TRY", cheque_no: "A-1001", bank_name: "Garanti", due_date: "2026-11-20", days_to_due: 4, due_state: "soon", customer_name: "Elif Kaya", invoices: [{ invoice_id: "li1", invoice_number: "OBI2026101", amount: "2500.00" }], detached: false, actions: { collect: true, endorse: true, return: true, pay: false, delete: true, receipt: true } }];
    let chm;
    if (path === "/cheques" && req.method === "GET") {
      const dir = url.searchParams.get("direction") || "received"; const st = url.searchParams.get("status") || "";
      const all = state.cheques.filter((c) => c.direction === dir && c.status !== "silindi");
      const tot = {}; all.forEach((c) => { (tot[c.status] = tot[c.status] || [{ currency: c.currency, amount: "0.00", count: 0 }]); tot[c.status][0].amount = (Number(tot[c.status][0].amount) + Number(c.amount)).toFixed(2); tot[c.status][0].count++; });
      const items = all.filter((c) => !st || (st === "due_soon" ? c.due_state === "soon" : c.status === st));
      return send(res, 200, { items, totals: tot, due_soon: [{ currency: "TRY", amount: "2500.00", count: 1 }], overdue: [] });
    }
    if (path === "/cheques/suppliers") return send(res, 200, { items: [{ party_id: "s1", name: "Kargo Lojistik A.Ş.", open_payables: [] }] });
    if (path === "/cheques/receive" && req.method === "POST") return readBody((b) => {
      if (!req.headers["idempotency-key"]) return send(res, 422, { code: "IDEMPOTENCY_KEY_REQUIRED", detail: "Anahtar gerekli." });
      if (!b.due_date) return send(res, 422, { code: "CHEQUE_DUE_REQUIRED", detail: "Çekin vade tarihini girin." });
      const c = { id: "chq" + Date.now(), direction: "received", status: "portfoy", status_label: "Portföyde", amount: b.amount, currency: "TRY", cheque_no: b.cheque_no || "", bank_name: b.bank_name || "", due_date: b.due_date, days_to_due: 10, due_state: "later", customer_name: b.drawer || "Müşteri", invoices: b.invoice_id ? [{ invoice_id: b.invoice_id, invoice_number: "", amount: b.amount }] : [], detached: false, actions: { collect: true, endorse: true, return: true, pay: false, delete: true, receipt: true } };
      state.cheques.unshift(c);
      const inv = b.invoice_id && localInvoices.find((x) => x.id === b.invoice_id);
      if (inv) { inv.payments.push({ id: "pc" + Date.now(), amount: Number(b.amount), date: b.date || "2026-11-16", method: "cek", source: "cheque" }); inv.paid_amount += Number(b.amount); inv.remaining_amount -= Number(b.amount); }
      console.log("WRITE CHEQUE RECEIVE", JSON.stringify(b)); return send(res, 200, { cheque: c, replayed: false });
    });
    if ((chm = path.match(/^\/cheques\/([^/]+)(?:\/(collect|endorse|return|pay))?$/)) && (req.method === "POST" || req.method === "DELETE")) {
      const c = state.cheques.find((x) => x.id === chm[1]);
      if (!c) return send(res, 404, { code: "CHEQUE_NOT_FOUND", detail: "Çek bulunamadı." });
      return readBody((b) => {
        const to = { collect: ["tahsil_edildi", "Tahsil edildi"], endorse: ["ciro_edildi", "Ciro edildi"], return: [b.reason === "bounced" ? "karsiliksiz" : "iade_edildi", b.reason === "bounced" ? "Karşılıksız" : "İade edildi"], pay: ["odendi", "Ödendi"] }[chm[2]] || ["silindi", "Silindi"];
        if (chm[2] === "collect" && String(b.account_id || "").startsWith("prs")) return send(res, 409, { code: "MIRROR_ACCOUNT_READ_ONLY", detail: "Paraşüt hesabına tahsil edilemez." });
        c.status = to[0]; c.status_label = to[1]; c.actions = { delete: true, receipt: true };
        console.log("WRITE CHEQUE", req.method, path, JSON.stringify(b)); return send(res, 200, { cheque: c });
      });
    }
    // Dalga 2: yaşlandırma, tahsilat takibi, hatırlatma, cari zaman çizelgesi ve notlar.
    if (path === "/reports/aging") {
      const z = { current: "0.00", "1-30": "0.00", "31-60": "0.00", "61-90": "0.00", "90+": "0.00" };
      return send(res, 200, { as_of: "2026-11-16", currencies: [
        { currency: "TRY", receivable: { totals: { current: "1200.00", "1-30": "4075.00", "31-60": "900.00", "61-90": "0.00", "90+": "500.00", total: "6675.00" }, count: 5,
          parties: [{ party_name: "Elif Kaya", total: "5275.00", count: 3 }, { party_name: "Can Öztürk", total: "900.00", count: 1 }, { party_name: "Bora Ltd", total: "500.00", count: 1 }] },
          payable: { totals: { ...z, "1-30": "1840.60", "90+": "1250.50", total: "3091.10" }, count: 2, parties: [{ party_name: "Kargo Lojistik A.Ş.", total: "1840.60", count: 1 }, { party_name: "Ofis Kırtasiye", total: "1250.50", count: 1 }] } },
        { currency: "USD", receivable: { totals: { ...z, "1-30": "1200.00", total: "1200.00" }, count: 1, parties: [{ party_name: "Acme GmbH", total: "1200.00", count: 1 }] }, payable: { totals: { ...z, total: "0.00" }, count: 0, parties: [] } },
      ], scope: { source: "obihub_ledger" } });
    }
    let fum;
    if ((fum = path.match(/^\/local-invoices\/([^/]+)\/collection-followup$/))) {
      const inv = localInvoices.find((x) => x.id === fum[1]);
      if (!inv) return send(res, 404, { code: "INVOICE_NOT_FOUND", detail: "Fatura bulunamadı." });
      const overdue = Math.max(0, Math.round((Date.parse("2026-11-16") - Date.parse(inv.due_date || "2026-11-16")) / 864e5));
      return send(res, 200, { invoice_id: inv.id, invoice_number: inv.invoice_number, currency: inv.currency || "TRY", remaining: inv.remaining_amount, due_date: inv.due_date,
        overdue_days: overdue, due_in_days: overdue ? 0 : Math.max(0, Math.round((Date.parse(inv.due_date || "2026-11-16") - Date.parse("2026-11-16")) / 864e5)),
        aging_bucket: overdue ? "1-30" : "current", offset_candidates: [], offsets: [], reminders: inv.reminders || [], offset_notice: null,
        default_recipient: "elif@example.test", actions: { offset: false, due_change: inv.status !== "iptal", remind: inv.remaining_amount > 0 } });
    }
    if ((fum = path.match(/^\/local-invoices\/([^/]+)\/reminder$/)) && req.method === "POST") {
      const inv = localInvoices.find((x) => x.id === fum[1]);
      return readBody((b) => {
        if (!Array.isArray(b.to) || !b.to.length) return send(res, 422, { code: "RECIPIENT_REQUIRED", detail: "Alıcı gerekli." });
        if (b.confirm !== true) return send(res, 200, { sent: false, needs_confirmation: true, preview: { to: b.to, subject: `Deneme A.Ş.: ${inv.invoice_number} numaralı fatura için ödeme hatırlatması`, message: b.message || "", remaining: "₺" + inv.remaining_amount, overdue_days: 11, invoice_number: inv.invoice_number } });
        inv.reminders = [{ at: new Date().toISOString(), to: b.to.map((a) => a.replace(/^(.).*@/, "$1***@")) }, ...(inv.reminders || [])];
        console.log("WRITE REMINDER", path, req.headers["idempotency-key"]); return send(res, 200, { sent: true, replayed: false, sent_to: inv.reminders[0].to });
      });
    }
    if ((fum = path.match(/^\/customers\/([^/]+)\/timeline$/))) {
      const k = url.searchParams.get("kind") || "all";
      const notes = (state.notes = state.notes || [{ id: "note_1", kind: "note", type: "note", at: "2026-11-16T09:00:00Z", title: "Not", body: "Arandı, cuma ödeyecek", actor: "Demo Kullanıcı", link: null, can_delete: true }]);
      const msgs = [{ id: "r1", kind: "message", type: "reminder_sent", at: "2026-11-15T09:00:00Z", title: "Tahsilat hatırlatması · OBI2026101", body: "e***@example.test · Kalan ₺4.075,00", actor: "Demo Kullanıcı", link: { type: "invoice", id: "li1" }, can_delete: false }];
      return send(res, 200, { kind: k, items: [...(k !== "messages" ? notes : []), ...(k !== "notes" ? msgs : [])] });
    }
    if ((fum = path.match(/^\/customers\/([^/]+)\/notes(?:\/([^/]+))?$/))) {
      state.notes = state.notes || [];
      if (req.method === "DELETE") { state.notes = state.notes.filter((n) => n.id !== decodeURIComponent(fum[2] || "")); return send(res, 200, { ok: true }); }
      return readBody((b) => {
        if (!String(b.text || "").trim()) return send(res, 422, { code: "NOTE_REQUIRED", detail: "Not gerekli." });
        const n = { id: "note_" + Date.now(), kind: "note", type: "note", at: new Date().toISOString(), title: "Not", body: b.text, actor: "Demo Kullanıcı", link: null, can_delete: true };
        state.notes = [n, ...state.notes]; console.log("WRITE NOTE", path); return send(res, 200, n);
      });
    }
    let offm; // Dalga 2: mahsubu geri al
    if (req.method === "DELETE" && (offm = path.match(/^\/local-invoices\/([^/]+)\/offsets\/([^/]+)$/))) {
      const inv = localInvoices.find((x) => x.id === offm[1]);
      const p = inv && inv.payments.find((x) => x.offset_id === decodeURIComponent(offm[2]));
      if (!p) return send(res, 404, { code: "NOT_FOUND", detail: "Mahsup bulunamadı" });
      inv.payments = inv.payments.filter((x) => x !== p); inv.paid_amount -= p.amount; inv.remaining_amount += p.amount;
      console.log("WRITE OFFSET RELEASE", path); return send(res, 200, { ok: true, released: true });
    }
    const invMatch = path.match(/^\/local-invoices\/([^/]+)(?:\/(payment|resmilestir|convert|quote-outcome))?$/);
    if (invMatch) {
      const inv = localInvoices.find((i) => i.id === invMatch[1]);
      if (!inv) return send(res, 404, { detail: "Fatura bulunamadı" });
      // C4: düzenle (PUT) ve sil (DELETE) — yalnız taslak/gecikti, gönderilmemiş ve ödemesiz.
      // D-12 S-4: kesilmiş faturada yalnız izinli alanlar (kısmi PUT).
      if (!invMatch[2] && req.method === "PUT" && ["gonderildi", "resmilesti", "gecikti", "odendi"].includes(inv.status))
        return readBody((b) => {
          const META = ["note", "notes", "document_name", "tag_ids", "category_id", "due_date", "order_no", "idempotency_key", "id"];
          const locked = Object.keys(b).filter((k) => !META.includes(k));
          if (locked.length) return send(res, 409, { code: "ISSUED_AMOUNTS_LOCKED", detail: "Kesilmiş faturada tutar alanları değiştirilemez.", locked_fields: locked });
          console.log("WRITE META PUT", path, JSON.stringify(b));
          for (const k of ["notes", "document_name", "due_date", "order_no"]) if (k in b) inv[k] = b[k];
          return send(res, 200, inv);
        });
      if (!invMatch[2] && (req.method === "PUT" || req.method === "DELETE")) {
        // 16 Kas: resmileşmemiş kesilmiş fatura da düzenlenir/silinir; tahsilatlı 409 INVOICE_HAS_PAYMENTS.
        if (!["taslak", "gecikti", "gonderildi"].includes(inv.status) || inv.parasut_invoice_id) return send(res, 409, { code: "INVOICE_SENT_TO_PARASUT", detail: "Fatura Paraşüt'e gönderilmiş; silinemez." });
        if (inv.paid_amount > 0) return send(res, 409, { code: "INVOICE_HAS_PAYMENTS", detail: "Faturaya tahsilat bağlı. Önce faturanın tahsilatlarını silin." });
        if (req.method === "DELETE") { localInvoices.splice(localInvoices.indexOf(inv), 1); console.log("WRITE DELETE", path); return send(res, 200, { message: "Silindi" }); }
        return readBody((b) => {
          console.log("WRITE PUT", path, JSON.stringify(b).slice(0, 500));
          if (b.action) {
            // P1 gövdesi: tüm formu değiştirir; action=issue keser.
            Object.assign(inv, { items: b.items, document_name: b.document_name || null, notes: b.notes, due_date: b.due_date, stock_mode: b.stock_mode, note_options: b.note_options || null,
              stopaj_rate: b.stopaj_rate || null, accommodation_tax_rate: b.accommodation_tax_rate ?? null, invoice_discount_type: b.invoice_discount_type || null, invoice_discount_value: b.invoice_discount_value || null, doc_schema: 1 });
            if (b.action === "issue") Object.assign(inv, { status: "gonderildi", display_status: "gonderildi", money_state: "pending", invoice_number: inv.invoice_number || "OBI2026199" });
            return send(res, 200, inv);
          }
          const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
          inv.items = b.items.map((it) => ({ ...it, line_total: r2(Number(it.quantity) * Number(it.unit_price)) }));
          inv.subtotal = r2(inv.items.reduce((n, it) => n + it.line_total, 0));
          inv.vat_amount = r2(inv.items.reduce((n, it) => n + (it.line_total * Number(it.vat_rate || 0)) / 100, 0));
          inv.total = r2(inv.subtotal + inv.vat_amount); inv.remaining_amount = inv.total; inv.notes = b.notes; inv.due_date = b.due_date;
          send(res, 200, inv);
        });
      }
      if (!invMatch[2]) return send(res, 200, inv);
      if (invMatch[2] === "convert" && req.method === "POST") {
        console.log("WRITE", path);
        if (inv.invoice_type !== "teklif") return send(res, 422, { code: "NOT_A_QUOTE", detail: "Yalnız teklif faturaya çevrilebilir." });
        if (inv.converted_invoice_id) return send(res, 200, { ...localInvoices.find((x) => x.id === inv.converted_invoice_id), replayed: true });
        const ni = { ...inv, id: "li" + Date.now(), invoice_type: "satis", source_quote_id: inv.id, invoice_number: "", status: "taslak", display_status: "taslak", money_state: "not_issued", converted_invoice_id: undefined, quote_outcome: undefined, valid_until: undefined };
        localInvoices.unshift(ni); inv.converted_invoice_id = ni.id; inv.quote_outcome = "accepted";
        return send(res, 200, ni);
      }
      if (invMatch[2] === "quote-outcome" && req.method === "PATCH")
        return readBody((b) => { console.log("WRITE", path, b.outcome); inv.quote_outcome = b.outcome; send(res, 200, inv); });
      if (invMatch[2] === "resmilestir") {
        inv.status = inv.display_status = "resmilesti"; inv.parasut_invoice_id = "ps1";
        // K8: carinin serbest alacağı faturayı kendiliğinden kapatır
        const c = parties.find((p) => p.id === inv.customer_id); const credit = c ? Number(c.advance || 0) : 0;
        const applied = Math.min(credit, inv.remaining_amount);
        if (applied > 0) { c.advance = credit - applied; inv.paid_amount += applied; inv.remaining_amount -= applied; inv.payments.push({ id: "auto" + Date.now(), amount: applied, date: new Date().toISOString().slice(0, 10), method: "havale", source: "customer_payment", auto: true, notes: "Cari alacaktan mahsup" }); }
        return send(res, 200, { ok: true, message: "Fatura resmileşti", edoc_state: "done", auto_settlement: applied > 0 ? { applied_amount: applied, credit_remaining: c.advance, currency: "TRY", invoice_status: inv.status, paid_amount: inv.paid_amount, remaining_amount: inv.remaining_amount, skipped: [], operation_id: "op" + Date.now(), skipped_reason: null } : null });
      }
      return readBody((b) => {
        // Aşama 4 P2: anahtar (aynı anahtar → ilk sonuç + replayed); /__mode?payFail=1 → işlenir ama 500 (bir kez).
        if (["cek", "çek"].includes(String(b.method || "").toLowerCase())) return send(res, 422, { code: "CHEQUE_USE_CHEQUES", detail: "Çekle tahsilat Çekler ekranından alınır." });
        const pk = req.headers["idempotency-key"];
        console.log("INV-PAY key=" + (pk || "-") + " account=" + (b.account_id || "-"));
        if (pk && payKeys.has(pk)) return send(res, 200, { ...payKeys.get(pk), replayed: true });
        if (inv.status === "taslak") return send(res, 409, { code: "INVOICE_NOT_ISSUED", detail: "Taslak faturaya tahsilat eklenemez; önce faturayı kesin." });
        if (b.amount > inv.remaining_amount + 0.004) return send(res, 409, { code: "PAYMENT_EXCEEDS_REMAINING", detail: "Tahsilat tutarı faturanın kalanını aşıyor." });
        console.log("INV-PAY parasut_sync=" + (b.parasut_sync ?? "-") + " parasut_account_id=" + (b.parasut_account_id ?? "-"));
        const ps = b.parasut_sync ? (state.psFail === "1" ? { ok: false, error: "Paraşüt hesabı kapalı" } : { ok: true }) : null;
        inv.paid_amount += b.amount; inv.remaining_amount -= b.amount; inv.payments.push({ id: "p" + Date.now(), amount: b.amount, date: b.date, method: b.method, ...(ps ? { parasut_sync_state: ps.ok ? "synced" : "failed", parasut_sync_error: ps.error } : inv.parasut_invoice_id ? { parasut_sync_state: "not_sent" } : {}) });
        if (inv.remaining_amount < 0.005) { inv.status = inv.display_status = "odendi"; inv.money_state = "settled"; }
        const out = { ok: true, remaining_amount: inv.remaining_amount, status: inv.status, replayed: false, ...(ps ? { parasut: ps } : {}) };
        if (pk) payKeys.set(pk, out);
        if (state.payFail === "1") { state.payFail = "0"; return send(res, 500, { code: "INTERNAL", detail: "Sunucu hatası" }); }
        send(res, 200, out);
      });
    }
    // Web eşitleme (src/api-gider.ts): yetenekler, gider ayarı, ObiHub gider defteri. Okuma modeli ve gelen kutusu 404 → eski uçlara düşüş.
    if (path === "/ui-capabilities")
      return send(res, 200, { version: 1, capabilities: { obihub_os: false, inbox_read: Boolean(state.inbox), payable_payment: true, expense_ledger: true, expense_manual_entry: true, manual_entry_reason: null, parasut_connected: true, parasut_expense_view: true, inventory_owner: { owner: state.iaOwner ? "accounting" : "obihub", program: "bizimhesap" } }, workspace_scope: null });
    if (path === "/accounting/expense-settings") return send(res, 200, { expense_module_enabled: true, parasut_expense_view_enabled: true, parasut_connected: true });
    if (path === "/accounting/expense-invoices/summary") return send(res, 200, { currencies: [{ currency: "TRY", payable: "9400.00", overdue: "1250.50" }] });
    // --- Dalga 3 / C2: gider detayı ve borç ödeme. e1 ödenebilir, e2'de ikinci ödeme 409 PAYMENT_EXCEEDS_OUTSTANDING denenir.
    let gm; // c2
    if (path === "/accounting/read-model/parties" && url.searchParams.get("role") === "supplier") return send(res, 200, { items: [{ id: "obihub:s1", name: "Kargo Lojistik A.Ş.", source: "obihub" }, { id: "obihub:s2", name: "Ofis Kırtasiye", source: "obihub" }] });
    // Dalga 3 (P3.3): gider türleri kataloğu, banka gideri / vergi-SGK, fiş görseli.
    if (path === "/accounting/expense-invoices/kinds" && req.method === "GET") return send(res, 200, { kinds: [], tax_menu: [], tax_types: [], spenders: [{ id: "u1", name: "Deneme Kullanıcı" }, { id: "u2", name: "Ece Yılmaz" }] });
    let ekm;
    if ((ekm = path.match(/^\/accounting\/expense-invoices\/kinds\/(bank_fee|tax_payment)$/)) && req.method === "POST") return readBody((b) => {
      if (!req.headers["idempotency-key"]) return send(res, 422, { code: "EXPENSE_KIND_KEY_REQUIRED", detail: "İşlem anahtarı eksik." });
      if (!b.account_id) return send(res, 422, { code: "EXPENSE_KIND_PAYMENT_REQUIRED", detail: "Ödemenin yapıldığı hesabı seçin." });
      const acc = accounts.find((x) => x.id === b.account_id); if (acc) acc.balance -= Number(b.amount);
      console.log("WRITE KIND", ekm[1], JSON.stringify(b)); return send(res, 200, { entry: { id: "k" + Date.now() }, replayed: false, kind: ekm[1], kind_label: ekm[1] === "bank_fee" ? "Banka gideri" : "Vergi/SGK ödemesi" });
    });
    if (path === "/accounting/expense-invoices/receipts" && req.method === "POST") { req.resume(); req.on("end", () => send(res, 200, { id: "rf-" + "a".repeat(24), name: "fis.jpg", content_type: "image/jpeg", size: 1234 })); return; }
    // Dalga 1 P1.3: gider geçmişi / kopya / PDF.
    if (req.method === "GET" && (gm = path.match(/^\/accounting\/expense-invoices\/(.+)\/(history|copy|pdf)$/))) {
      const ref = decodeURIComponent(gm[1]); const ex = expenseState[ref];
      if (!ex || ex.deleted) return send(res, 404, { code: "NOT_FOUND", detail: "Bulunamadı" });
      if (gm[2] === "pdf") { res.writeHead(200, { "Content-Type": "application/pdf", "Access-Control-Allow-Origin": "*" }); return res.end(Buffer.from("%PDF-1.4\n%mock\n")); }
      if (gm[2] === "history") return send(res, 200, { items: [
        { at: "2026-11-16T09:30:00Z", kind: "category", title: "Kategori değişti", detail: "Kargo giderleri" },
        { at: "2026-11-09T08:00:00Z", kind: "created", title: "", detail: "İçeri Al ile oluşturuldu" } ] });
      return send(res, 200, { source_id: ref, supplier: { party_id: "s1", name: ex.supplier, tax_id: "1234567890" }, expense_category_id: "c1", tag_ids: [], currency: "TRY",
        lines: [{ description: "Kargo hizmet bedeli", quantity: "10", unit_price: "120.00", vat_rate: "18" }, { description: "Ambalaj malzemesi", quantity: "2", unit_price: "150.50", vat_rate: "20" }], other_taxes: [], warnings: ["TAGS_NOT_COPIED"] });
    }
    // 16 Kas: gider faturası silme / arşivleme. e2 silinemez (eşleştirme + Paraşüt kaydı); arşivde açık bakiye engeli.
    if (req.method === "GET" && (gm = path.match(/^\/accounting\/expense-invoices\/(.+)\/delete-check$/))) {
      const ref = decodeURIComponent(gm[1]); const ex = expenseState[ref];
      if (!ex || ex.deleted) return send(res, 404, { code: "NOT_FOUND", detail: "Bulunamadı" });
      const action = url.searchParams.get("action") || "delete";
      const reasons = [];
      if (ex.payments.length) reasons.push({ code: "PAYMENTS_EXIST", message: "Faturaya bağlı ödemeler var. Önce ödemeleri silin.", action: { label: "Ödemeleri gör", kind: "payments", ref } });
      if (ref === "obihub:e2") {
        reasons.push({ code: "RELATED_DOCUMENTS", message: "Fatura bir gelen e-Fatura ile eşleştirilmiş.", action: { label: "Gelen e-Faturalar", kind: "incoming_inbox", href: "/gelen-efatura" } });
        reasons.push({ code: "PARASUT_RECORD", message: "Fatura Paraşüt'e kaydedilmiş; önce Paraşüt'te silin.", action: null });
      }
      if (action === "archive" && ex.remaining > 0) reasons.push({ code: "OPEN_BALANCE", message: "Faturanın ödenmemiş bakiyesi var.", action: { label: "Ödeme ekle", kind: "pay" } });
      const allowed = reasons.length === 0;
      return send(res, 200, { allowed, action, code: allowed ? null : action === "archive" ? "ARCHIVE_BLOCKED" : "DELETE_BLOCKED", title: allowed ? null : "Kayıt silinemiyor ve arşivlenemiyor",
        detail: allowed ? null : "Bu kaydı silmek ya da arşivlemek için aşağıdakileri giderin.", reasons,
        warnings: allowed && action === "delete" && ex.kind === "import" ? [{ code: "E_INVOICE_LINKED", message: "Fatura e-Faturadan alınmış; silinince Gelen e-Faturalar'a döner." }, { code: "STOCK_REVERSED", message: "Faturayla giren stok geri alınır." }] : [],
        confirm: allowed ? { title: action === "archive" ? "Fatura arşivlensin mi?" : "Fatura silinsin mi?", message: action === "archive" ? "Fatura listede gizlenir; kayıtlar etkilenmez." : "Fatura silinir; stok ve tedarikçi bakiyesi geri alınır.", button: action === "archive" ? "Faturayı arşivle" : "Faturayı sil" } : null });
    }
    if ((gm = path.match(/^\/accounting\/expense-invoices\/(.+?)(\/archive|\/unarchive)?$/)) && (req.method === "DELETE" || (req.method === "POST" && gm[2]))) {
      const ref = decodeURIComponent(gm[1]); const ex = expenseState[ref];
      if (!ex || ex.deleted) return send(res, 404, { code: "NOT_FOUND", detail: "Bulunamadı" });
      if (gm[2] === "/unarchive") { ex.archived = false; return send(res, 200, { archived: false, id: ref }); }
      if (ref === "obihub:e2" || ex.payments.length || (gm[2] === "/archive" && ex.remaining > 0)) return send(res, 409, { allowed: false, code: "DELETE_BLOCKED" });
      if (gm[2] === "/archive") { ex.archived = true; return send(res, 200, { archived: true, id: ref }); }
      ex.deleted = true; console.log("WRITE EXPENSE DELETE", ref); return send(res, 200, { deleted: true, id: ref, reversal: { ok: true } });
    }
    if (req.method === "GET" && (gm = path.match(/^\/accounting\/expense-invoices\/(.+)$/)) && gm[1] !== "summary") {
      const ref = decodeURIComponent(gm[1]);
      const ex = expenseState[ref];
      if (!ex || ex.deleted) return send(res, 404, { code: "NOT_FOUND", detail: "Bulunamadı" });
      return send(res, 200, {
        id: ref, source: ref.startsWith("obihub:") ? "obihub" : "legacy", source_kind: ex.kind, supplier: { id: "s1", name: ex.supplier, tax_id: "1234567890" },
        document_number: ex.doc, issue_date: "2026-11-09", due_date: "2026-11-24", currency: "TRY",
        lines: [
          { description: "Kargo hizmet bedeli", quantity: "10", unit_price: "120.00", vat_rate: "20", discount: "0", total: "1200.00" },
          { description: "Ambalaj malzemesi", quantity: "2", unit_price: "150.50", vat_rate: "20", discount: "0", total: "301.00" },
        ],
        totals: { taxable: "1501.00", vat: "300.20", withholding: "0", other_levies: ex.levies, payable: ex.total },
        expense: { category_id: "c1", category_name: "Kargo giderleri", amount: "1501.00" },
        payable: { ref, paid: (Number(ex.total) - ex.remaining).toFixed(2), remaining: ex.remaining.toFixed(2), payment_status: ex.remaining <= 0 ? "paid" : ex.remaining < Number(ex.total) ? "partial" : ex.status },
        reversed: false, archived: ex.archived === true, actions: { can_pay: ex.remaining > 0, can_reverse: false },
      });
    }
    // 15 Kas 2026 ödeme silme: DELETE /accounting/payables/{ref}/payments/{pid} (ters kayıt; borç tekrar ödenecek).
    if ((gm = path.match(/^\/accounting\/payables\/(.+)\/payments\/([^/]+)$/)) && req.method === "DELETE") {
      const ex = expenseState[decodeURIComponent(gm[1])];
      if (!ex) return send(res, 404, { code: "PAYABLE_NOT_FOUND", detail: "Borç kaydı bulunamadı." });
      const pid = decodeURIComponent(gm[2]);
      console.log("WRITE DELETE", path);
      const done = (ex.voided || []).find((x) => x.id === pid);
      const p = ex.payments.find((x) => x.id === pid);
      if (!p && !done) return send(res, 404, { code: "PAYMENT_NOT_FOUND", detail: "Ödeme kaydı bulunamadı." });
      if (p) {
        ex.payments = ex.payments.filter((x) => x.id !== pid);
        ex.remaining = Math.round((ex.remaining + Number(p.amount)) * 100) / 100;
        ex.voided = [...(ex.voided || []), { ...p, status: "voided", voided_at: new Date().toISOString() }];
      }
      return send(res, 200, { status: "VOIDED", replayed: !p, payment: { id: pid, status: "voided", can_void: false }, payable: { id: decodeURIComponent(gm[1]), remaining: ex.remaining.toFixed(2), status: "open" } });
    }
    if ((gm = path.match(/^\/accounting\/payables\/(.+)\/payments$/))) {
      const ref = decodeURIComponent(gm[1]);
      const ex = expenseState[ref];
      if (!ex) return send(res, 404, { code: "NOT_FOUND", detail: "Bulunamadı" });
      const view = () => ({ payable: { total: ex.total, paid: (Number(ex.total) - ex.remaining).toFixed(2), remaining: ex.remaining.toFixed(2), currency: "TRY", status: ex.remaining <= 0 ? "paid" : "open" }, can_pay: ex.remaining > 0, items: ex.payments.map((x) => ({ ...x, can_void: x.status === "completed" })), voided_items: ex.voided || [] });
      if (req.method === "GET") return send(res, 200, view());
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        console.log("WRITE", path, raw);
        const b = JSON.parse(raw || "{}");
        if (ex.seenKeys.includes(b.idempotency_key)) return send(res, 200, view());
        const amt = Number(b.amount);
        if (amt > ex.remaining + 1e-9) return send(res, 409, { code: "PAYMENT_EXCEEDS_OUTSTANDING", detail: "Tutar kalan borçtan büyük." });
        ex.seenKeys.push(b.idempotency_key);
        ex.remaining = Math.round((ex.remaining - amt) * 100) / 100;
        const acc = accounts.find((x) => x.id === b.account_id);
        ex.payments.push({ id: "pp" + ex.payments.length, date: b.date, amount: Number(b.amount).toFixed(2), currency: "TRY", account_name: acc ? acc.name : "", status: "completed" });
        // /__mode?payFail=1: ödeme işlenir ama yanıt 500 döner (belirsiz sonuç denemesi; bir kez).
        if (state.payFail === "1") { state.payFail = "0"; return send(res, 500, { detail: "Sunucu hatası" }); }
        send(res, 201, view());
      });
      return;
    }
    // --- Dalga 3 / C3: elle alış/gider faturası
    if (path === "/accounting/expense-categories") return send(res, 200, { items: [{ id: "c1", name: "Kargo giderleri" }, { id: "c2", name: "Ofis giderleri" }, { id: "c3", name: "Arşiv", active: false }] });
    if (req.method === "GET" && path === "/products" && url.searchParams.get("search")) {
      const q = url.searchParams.get("search").toLocaleLowerCase("tr-TR");
      return send(res, 200, products.filter((p) => [p.name, p.sku, p.barcode].some((v) => v.toLocaleLowerCase("tr-TR").includes(q))).slice(0, Number(url.searchParams.get("limit") || 8)).map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, price: p.price, vat_rate: 20, stock: p.stock, image_url: p.image_url || "" })));
    }
    if (req.method === "POST" && path === "/accounting/manual-purchases/preview") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        let taxable = 0, vat = 0;
        // Dalga 3: hızlı fiş — toplam KDV dahil, oran verilir; sunucu matrahı geri hesaplar.
        if (b.entry_mode === "quick") { const tot = Number(b.total); taxable = Math.round(tot / (1 + Number(b.vat_rate) / 100) * 100) / 100; vat = Math.round((tot - taxable) * 100) / 100; console.log("QUICK PREVIEW", JSON.stringify(b)); }
        for (const l of b.lines || []) { const net = Number(l.quantity) * Number(l.unit_price) - Number(l.discount || 0); taxable += net; vat += net * Number(l.vat_rate) / 100; }
        const hasProduct = (b.lines || []).some((l) => l.kind === "product");
        const dup = String(b.document_number || "").toUpperCase() === "DUP-1";
        // DUP-2: olası mükerrer eski kayıt; legacy_duplicate_ack: true ile kalkar.
        const legacyDup = String(b.document_number || "").toUpperCase() === "DUP-2" && b.legacy_duplicate_ack !== true;
        send(res, 200, {
          draft_id: b.draft_id || "d1", can_confirm: !dup && !legacyDup, decision_digest: "dg-" + Math.round(taxable * 100),
          totals: { taxable: taxable.toFixed(2), vat: vat.toFixed(2), withholding: "0.00", other_taxes: "0.00", payable: (taxable + vat).toFixed(2) },
          blocker_items: dup ? [{ key: "DUPLICATE_MANUAL_DOCUMENT", detail: "Bu belge numarasıyla kayıtlı bir gider faturası var." }] : [],
          review_items: legacyDup ? [{ key: "POSSIBLE_LEGACY_DUPLICATE", detail: "Aynı tedarikçiden aynı gün aynı tutarda eski aktarımla kaydedilmiş, numarası farklı bir fatura var." }] : [],
          ...(hasProduct ? { stock: { owner: "obihub", entry: true, warehouse_id: "w1", warehouses: [{ id: "w1", name: "Ana depo" }, { id: "w2", name: "Mağaza" }] } } : {}),
        });
      });
      return;
    }
    if (req.method === "POST" && /^\/accounting\/manual-purchases\/[^/]+\/confirm$/.test(path)) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        console.log("WRITE", path, raw);
        expenseState["obihub:m1"] = { supplier: "Elle girilen tedarikçi", doc: "M-1", kind: "manual", total: "120.00", remaining: 120, levies: "0", status: "pending", payments: [], seenKeys: [] };
        send(res, 200, { status: "APPLIED", result: { invoice_id: "m1", payable_ref: "obihub:m1" }, parasut_warning: "Bu kayıt Paraşüt'e aktarılmaz; aynı gider Paraşüt'te de varsa çift kayıt olur." });
      });
      return;
    }
    if (path === "/accounting/expense-invoices") {
      const rows = [
        { id: "obihub:e1", source: "obihub", supplier_name: "Kargo Lojistik A.Ş.", document_number: "ABC2026000123", issue_date: "2026-11-09", due_date: "2026-11-24", total: "1840.60", currency: "TRY", payment_status: "pending", reversed: false, other_levies: null, remaining: "1840.60", source_kind: "import" },
        { id: "obihub:e2", source: "obihub", supplier_name: "Ofis Kırtasiye", document_number: "OK-77", issue_date: "2026-10-20", due_date: "2026-11-01", total: "1250.50", currency: "TRY", payment_status: "overdue", reversed: false, other_levies: "50.00", remaining: "1250.50", source_kind: "manual" },
        { id: "legacy:p1", source: "legacy", mirror: { provider: "parasut", category_name: "Kira" }, supplier_name: "Ambalaj Ltd.", document_number: "XYZ2026000456", issue_date: "2026-10-07", due_date: null, total: "3275.00", currency: "TRY", payment_status: "paid", reversed: false, other_levies: null, remaining: "0.00", source_kind: "legacy" },
      ];
      const pay = url.searchParams.get("payment");
      const sets = { open: ["pending", "partial", "overdue"], overdue: ["overdue"], paid: ["paid"] };
      const wantArch = url.searchParams.get("archived") === "true";
      const out = rows.filter((r) => !pay || (sets[pay] || []).includes(r.payment_status))
        .filter((r) => !(expenseState[r.id] || {}).deleted)
        .map((r) => ({ ...r, archived: (expenseState[r.id] || {}).archived === true }))
        .filter((r) => (wantArch ? r.archived : !r.archived));
      return send(res, 200, { items: out, total: out.length, page: 1, per_page: 20 });
    }
    // D-17 gelen kutusu (/__mode?inbox=1): görünümler, arşiv, kabul/red, toplu indirme.
    if (state.inbox && path === "/incoming-inbox" && req.method === "GET") {
      const view = url.searchParams.get("view") || "all";
      const qq = (url.searchParams.get("q") || "").toLocaleLowerCase("tr");
      const srt = url.searchParams.get("sort") || "-issue_date";
      const inView = (d) => view === "all" || (view === "archived" ? d.archived : view === "rejected" ? !d.archived && ["rejected", "returned"].includes(d.status) : !d.archived && !["rejected", "returned"].includes(d.status) && d.import_state === "not_imported");
      const match = (d) => !qq || [d.invoice_no, d.supplier.name, d.supplier.tax_no].join(" ").toLocaleLowerCase("tr").includes(qq);
      let rows = inboxDocs.filter((d) => match(d) && inView(d));
      const key = srt.replace("-", ""); const dir = srt.startsWith("-") ? -1 : 1;
      rows = rows.slice().sort((a, b) => (key === "amount" ? a.payable_amount - b.payable_amount : String(a.issue_date).localeCompare(String(b.issue_date))) * dir);
      const vc = {}; for (const v of ["all", "unprocessed", "archived", "rejected"]) vc[v] = inboxDocs.filter((d) => match(d) && (v === "all" || (v === "archived" ? d.archived : v === "rejected" ? !d.archived && ["rejected", "returned"].includes(d.status) : !d.archived && !["rejected", "returned"].includes(d.status) && d.import_state === "not_imported"))).length;
      return send(res, 200, { items: rows, total: rows.length, counts: {}, page: 1, page_size: 30, view, view_counts: vc, capabilities: { respond: true, archive: true, download: true }, total_is_lower_bound: false, sync: null });
    }
    if (state.inbox && path === "/incoming-inbox/archive" && req.method === "POST")
      return readBody((b) => { console.log("WRITE archive", JSON.stringify(b)); const upd = []; for (const k of b.document_keys || []) { const d = inboxDocs.find((x) => x.document_key === k); if (d) { d.archived = b.archived === true; upd.push(k); } } send(res, 200, { provider: b.provider, archived: b.archived, updated: upd, not_found: [] }); });
    let ibm;
    if (state.inbox && (ibm = path.match(/^\/incoming-inbox\/([^/]+)\/([^/]+)\/response$/)) && req.method === "POST")
      return readBody((b) => {
        console.log("WRITE response", ibm[2], JSON.stringify(b));
        if (b.confirm_irreversible !== true) return send(res, 422, { detail: { code: "RESPONSE_CONFIRMATION_REQUIRED", message: "Yanıtın geri alınamayacağını onaylayın." } });
        const d = inboxDocs.find((x) => x.document_key === ibm[2]);
        if (!d) return send(res, 404, { detail: { code: "INBOX_DOCUMENT_NOT_FOUND", message: "Belge bulunamadı." } });
        if (d.status !== "awaiting_response") return send(res, 409, { detail: { code: "RESPONSE_NOT_ALLOWED", message: "Bu belge yanıt beklemiyor." } });
        d.status = b.decision === "accept" ? "accepted" : "rejected"; d.status_label = b.decision === "accept" ? "Kabul edildi" : "Reddedildi"; d.can_respond = false; d.response_days_left = null;
        d.response_request = { decision: b.decision, state: "done", requested_at: new Date().toISOString(), message: null };
        d.import_block = b.decision === "accept" ? null : { code: "DOCUMENT_REJECTED", detail: "Bu fatura reddedildi ya da iade edildi; içeri alınamaz." };
        send(res, 200, { provider: "parasut", document_key: d.document_key, decision: b.decision, status: d.status, status_label: d.status_label, response_request: d.response_request });
      });
    if (state.inbox && (ibm = path.match(/^\/incoming-inbox\/([^/]+)\/download$/)) && req.method === "POST")
      return readBody((b) => {
        console.log("WRITE download", JSON.stringify(b));
        if ((b.document_keys || []).length > 20) return send(res, 422, { detail: { code: "DOWNLOAD_TOO_MANY", message: "En çok 20 belge indirilebilir." } });
        const zip = Buffer.from("504b0506000000000000000000000000000000000000", "hex");
        res.writeHead(200, { "Content-Type": "application/zip", "X-Download-Count": String(b.document_keys.length - 1), "X-Download-Missing": "1", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Download-Count, X-Download-Missing" });
        return res.end(zip);
      });
    if (path.startsWith("/accounting/read-model/") || path === "/incoming-inbox") return send(res, 404, { detail: "Not Found" });
    if (path === "/parasut/expense-invoices")
      return send(res, 200, { invoices: [{ id: "x1", invoice_no: "GF-88", supplier_name: "Tedarikçi A.Ş.", issue_date: "2026-11-03", due_date: "2026-11-18", gross_total: 9400, currency: "TRL", status: "unpaid" }], total: 1, page: 1, per_page: 30 });
    if (path === "/turkcell-efatura/status") return send(res, 200, { connected: false });
    if (path === "/settings/incoming-einvoice-source") return send(res, 200, { source: null });
    // --- Dalga 3 / C1: İçeri Al (quick import). in1 önizlenebilir; in2 zaten alınmış (durum-önce kapısı).
    if (path === "/incoming-invoices/quick-import/capability")
      return ["parasut", "turkcell-efatura"].includes(url.searchParams.get("provider")) ? send(res, 200, { enabled: true, preview: true, confirm: true, wizard: true, workspace: true, provider: url.searchParams.get("provider") }) : send(res, 404, { detail: "Not Found" });
    if (path === "/incoming-invoices/quick-import/expense-categories")
      return send(res, 200, { items: [{ id: "sys", name: "Gelen fatura gideri", system: true }, { id: "c1", name: "Kargo giderleri", system: false }, { id: "c2", name: "Ambalaj", system: false }] });
    let qm; // c1
    if ((qm = path.match(/^\/incoming-invoices\/([^/]+)\/quick-import\/status$/))) {
      const st = importState[qm[1]] || "none";
      return send(res, 200, { status: st, reason: null, detail: null, result: st === "applied" ? { invoice_id: "x" } : null });
    }
    // 15 Kas 2026 Paraşüt akışı: hatırlansın kartı açar (stok yazmaz); /__mode?iaOwner=1 → 409 INVENTORY_OWNER_ACCOUNTING.
    // İçeri Al 2 kabul kapısı (/__mode?inbox=1): onay bekleyen ticari fatura önce kabul edilir.
    const acceptBlock = (key) => {
      const d = state.inbox ? inboxDocs.find((x) => x.document_key === key) : null;
      if (!d) return null;
      if (d.status === "awaiting_response") return { code: "ACCEPT_REQUIRED", detail: "Önce faturayı kabul edin. Bu ticari fatura onay bekliyor; kabul etmeden gider ve borç olarak içeri alınamaz. Kabul yanıtı GİB'e gönderilir ve geri alınamaz." };
      if (["rejected", "returned"].includes(d.status)) return { code: "DOCUMENT_REJECTED", detail: "Bu fatura reddedildi ya da iade edildi; içeri alınamaz." };
      return null;
    };
    if (req.method === "POST" && (qm = path.match(/^\/incoming-invoices\/([^/]+)\/quick-import\/(preview|confirm|remember-products)$/)) && acceptBlock(qm[1])) {
      const blk = acceptBlock(qm[1]);
      return send(res, 409, { status: "REJECTED", reason: blk.code, code: blk.code, detail: blk.detail });
    }
    if (req.method === "POST" && (qm = path.match(/^\/incoming-invoices\/([^/]+)\/quick-import\/remember-products$/))) {
      if (state.iaOwner) return send(res, 409, { code: "INVENTORY_OWNER_ACCOUNTING", detail: "Stok sahibi muhasebe programınız." });
      console.log("WRITE", path);
      remembered[qm[1]] = true;
      return send(res, 200, { lines: [
        { index: 0, description: "Koli 40x40 çift oluklu", status: "created", product_id: "p-new", product_name: "Koli 40x40 çift oluklu", is_new: true, match: "created" },
        { index: 1, description: "Nakliye bedeli", status: "ambiguous", product_id: null, product_name: null, is_new: false, match: null, suggested_product_id: "p5", suggested_product_name: "Deneme Ürün 5" },
      ], created: 1, inventory_owner: "obihub" });
    }
    if (req.method === "POST" && (qm = path.match(/^\/incoming-invoices\/([^/]+)\/quick-import\/(preview|confirm)$/))) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        const lc = b.line_choices || [];
        const c0raw = lc[0] || {};
        // Hatırlansın sonrası ilk kalem açılan karta bağlanır (sunucu eşleştirme kuralı).
        const c0 = remembered[qm[1]] && c0raw.kind === "product" && !c0raw.product_id ? { ...c0raw, product_id: "p-new" } : c0raw;
        const stock = b.mode === "expense_and_stock";
        const supplierChosen = Boolean(b.supplier_id) || b.create_supplier === true;
        const line0Kind = c0.kind || null;
        const lines = [
          { index: 0, description: "Koli 40x40 çift oluklu", quantity: "100", unit: { code: "C62", label: "adet" }, unit_price: "13.333333", gross_computed: "1333.33", discount: "333.33", discount_rate: "25.00", document_unit_price: "16.00", price_includes_vat: true, net_computed: "1000.00", line_extension_provider: "1000.00", vat_rate: "20",
            kind: line0Kind, product: { state: c0.product_id ? "matched" : "ambiguous", selected_id: c0.product_id || null, remember_selected: c0.new_product_draft === true, candidates: c0.product_id === "p-new" ? [{ id: "p-new", label: "Koli 40x40 çift oluklu", sku: null }] : [{ id: "p4", label: "Deneme Ürün 4", sku: "SKU-4" }, { id: "p5", label: "Deneme Ürün 5", sku: "SKU-5" }] },
            stock: { eligible: line0Kind === "product" && Boolean(c0.product_id), selected: stock && c0.stock === true }, issues: line0Kind ? (line0Kind === "product" && !c0.product_id ? ["PRODUCT_MATCH_AMBIGUOUS"] : []) : ["LINE_CLASS_UNRESOLVED"] },
          { index: 1, description: "Nakliye bedeli", quantity: "1", unit: { code: "C62", label: "adet" }, unit_price: "200.00", net_computed: "200.00", line_extension_provider: "200.00", vat_rate: "20", kind: "service", product: { state: "not_applicable", candidates: [] }, stock: { eligible: false }, issues: [] },
        ];
        const whNeeded = stock && lines[0].stock.eligible;
        const whIssues = whNeeded && !b.warehouse_id ? [{ key: "WAREHOUSE_REQUIRED", line_index: 0 }] : [];
        const supIssues = supplierChosen ? [] : ["SUPPLIER_NOT_MATCHED"];
        // Kıyas 2 hızlı gider: satır sorunları engellemez, tutarlar belge toplamından.
        if (b.quick_expense === true && b.mode === "expense_only") for (const l of lines) l.issues = [];
        if (b.payment_state === "paid" && (!b.payment_account_id || !b.payment_date)) return send(res, 422, { code: "PAYMENT_ACCOUNT_REQUIRED", detail: "Ödendi için ödemenin yapıldığı kasa ya da banka hesabını seçin." });
        // 14 Kas 2026 sözleşmesi (/__mode?iaGate=…): dup → POSSIBLE_LEGACY_DUPLICATE (kabulle kalkar); legacy → LEGACY_RECORD_EXISTS;
        // acct → ACCOUNTING_NOT_ACTIVE; disabled → EXPENSE_MODULE_DISABLED; confirm409 → onayda 409 EXPENSE_MODULE_DISABLED.
        const gate = state.iaGate || "";
        const gateBlock = { legacy: "LEGACY_RECORD_EXISTS", acct: "ACCOUNTING_NOT_ACTIVE", disabled: "EXPENSE_MODULE_DISABLED" }[gate];
        if (gate === "dup" && b.legacy_duplicate_ack !== true) whIssues.push({ key: "POSSIBLE_LEGACY_DUPLICATE", line_index: null, detail: "Aynı tedarikçiden aynı gün aynı tutarda eski aktarımla kaydedilmiş, numarası farklı bir fatura var. Farklı bir faturaysa onaylayıp devam edin." });
        const anyIssue = supIssues.length || lines.some((l) => l.issues.length) || whIssues.length || gateBlock;
        const decision = {
          status: anyIssue ? "REVIEW_REQUIRED" : "FAST_READY", business_ready: true, confirmation_available: true, can_confirm: !anyIssue,
          preview_fingerprint: "fp1", choices_digest: "cd-" + JSON.stringify(lc).length, decision_digest: "dd1",
          document_summary: { document_number: "GIB2026000077", issue_date: "2026-11-10", currency: "TRY", taxable: "1200.00", vat_total: "240.00", payable: "1440.00" },
          blocker_items: gateBlock ? [{ key: gateBlock, line_index: null }] : [], review_items: whIssues,
          payment_options: { states: [{ id: "payable", label: "Ödenecek", available: true }, { id: "paid", label: "Ödendi", available: true, requires: ["account_id", "date"] },
            { id: "employee", label: "Çalışan cebinden", available: false, reason: "Çalışan cebinden ödeme, çalışan kartları eklenince açılacak. Şimdilik Ödenecek ya da Ödendi seçin." }], accounts_endpoint: "/api/finance/accounts" },
          payment: { state: b.payment_state || "payable", account_id: b.payment_account_id || null, date: b.payment_date || null },
          document_view: {
            version: "dv1",
            document: { number: "GIB2026000077", issue_date: "2026-11-10", currency: "TRY", legal_payable: "1440.00", computed_payable: state.iaKurus ? "1440.01" : "1440.00", document_issues: [], reconciliation_level: state.iaKurus ? "warning" : "ok", lines_difference: state.iaKurus ? "0.01" : null,
              quick_expense: b.quick_expense === true, totals_basis: b.quick_expense === true ? "document" : "lines" },
            supplier: { name: "Ambalaj Ltd.", tax_number: "9876543210", state: b.supplier_id ? "matched" : b.create_supplier ? "create" : "ambiguous", selected_id: b.supplier_id || null, create_selected: b.create_supplier === true, candidates: [{ id: "s1", label: "Ambalaj Limited Şirketi" }, { id: "s2", label: "Ambalaj Ltd. (eski kayıt)" }], issues: supIssues },
            lines,
            decisions: {
              stock_action: { available: true, selected: stock, reason: null },
              warehouse: { required: whNeeded, selection_available: true, options_complete: true, selected_id: b.warehouse_id || null, options: [{ id: "w1", name: "Ana depo" }, { id: "w2", name: "Mağaza" }] },
              supplier: { match_existing: { available: true, candidate_count: 2 }, create_new: { available: true } },
              payment: { state: "payable" },
            },
          },
        };
        if (qm[2] === "preview") return send(res, 200, decision);
        console.log("WRITE", path, raw);
        if (anyIssue) return send(res, 409, { code: "CHOICES_CHANGED", detail: "Seçimler değişti; önizlemeyi yenileyin." });
        if (gate === "dup" && b.legacy_duplicate_ack !== true) return send(res, 409, { status: "REJECTED", reason: "QUICK_CONFIRMATION_STALE", detail: "Önizleme değişti; yeniden önizleyin." });
        if (gate === "confirm409") return send(res, 409, { status: "REJECTED", reason: "EXPENSE_MODULE_DISABLED", detail: "Bir hata oluştu" });
        importState[qm[1]] = "applied";
        const acc = accounts.find((a) => a.id === b.payment_account_id);
        return send(res, 200, { status: "APPLIED", detail: "Fatura giderlere işlendi.", result: { invoice_id: "ex1" },
          ...(b.payment_state === "paid" ? { payment: { status: "recorded", payment: { id: "pp1", amount: "1440.00", currency: "TRY", date: b.payment_date, account_id: b.payment_account_id, account_name: acc ? acc.name : "Hesap", status: "completed" } } } : {}) });
      });
      return;
    }
    if (path === "/parasut/incoming-e-invoices")
      return send(res, 200, { invoices: [
        { id: "in1", invoice_no: "ABC2026000123", sender_name: "Kargo Lojistik A.Ş.", issue_date: "2026-11-09", gross_total: 1840.6, currency: "TRL", import_status: importState.in1 || "none" },
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
    // /__mode?subDays=5 → bitişe 5 gün (yenileme bilgisi); -1 → süresi dolmuş.
    if (path === "/billing/trial-status") {
      // 13 Kas 2026 sözleşmesi: renewal + usage / limits. subDays=susp → askıda; subOld=1 → eski sunucu (renewal yok).
      const susp = state.subDays === "susp";
      const d = state.subDays != null && state.subDays !== "" && !susp ? Number(state.subDays) : 23;
      const exp = new Date(Date.now() + d * 86400000).toISOString();
      const body = { plan: "pro", is_trial: false, billing_cycle: "monthly", expires_at: exp, days_left: Math.max(0, Math.ceil(d)), subscription_status: susp ? "suspended" : d < 0 ? "expired" : "active" };
      if (state.subOld !== "1") {
        Object.assign(body, {
          renewal: { kind: "subscription", phase: susp ? "suspended" : d < 0 ? "expired" : d <= 14 ? "window" : "none", can_renew: !susp, window_days: 14, days_left: Math.max(0, Math.floor(d)), expires_at: exp },
          usage: { integrations: 3, products: 4100, orders_monthly: 212 },
          limits: { integrations: 5, products: 5000, orders_monthly: 3000 },
        });
      }
      return send(res, 200, body);
    }
    if (path === "/usage/summary") return send(res, 200, { limits: { integrations: 5, products: 5000, orders_monthly: 3000 }, usage: { integrations: 3, products: 48, orders_monthly: 212 } });
    return send(res, 200, {});
  })
  .listen(8799, () => console.log("mock api on 8799"));
