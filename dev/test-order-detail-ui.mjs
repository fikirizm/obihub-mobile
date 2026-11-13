// Birim testi: src/order-detail-ui.ts (sipariş ayrıntısı premium turu, PM 13 Kas 2026 a–g).
// Çalıştırma: node dev/test-order-detail-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/order-detail-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

// a) müşteri kartı
t("a: telefon, e-posta, adres bağlantıları", () => {
  const c = m.customerContact({ customer_name: " Elif Kaya ", customer_phone: "0555 111 22 33", customer_email: "elif@example.test", shipping_address: "Moda Cad. 1\n Kadıköy  İstanbul" }, "ios");
  assert.equal(c.name, "Elif Kaya");
  assert.deepEqual(c.phone, { text: "0555 111 22 33", href: "tel:05551112233" });
  assert.deepEqual(c.email, { text: "elif@example.test", href: "mailto:elif@example.test" });
  assert.equal(c.address.text, "Moda Cad. 1, Kadıköy İstanbul");
  assert.equal(c.address.mapsUrl, "https://maps.apple.com/?q=" + encodeURIComponent("Moda Cad. 1, Kadıköy İstanbul"));
  assert.equal(m.customerContact({ shipping_address: "X Sk." }, "android").address.mapsUrl, "https://www.google.com/maps/search/?api=1&query=X%20Sk.");
  assert.equal(c.hasAny, true);
});
t("a: +90 korunur; boş/maskeli/geçersiz alanlar gösterilmez", () => {
  assert.equal(m.customerContact({ customer_phone: "+90 (555) 000-1122" }).phone.href, "tel:+905550001122");
  const c = m.customerContact({ customer_name: "", customer_phone: "-", customer_email: "yok", shipping_address: "  " });
  assert.equal(c.phone, null); assert.equal(c.email, null); assert.equal(c.address, null);
  assert.equal(c.name, "Müşteri"); assert.equal(c.hasAny, false);
  assert.equal(m.customerContact({ customer_phone: "05*****33" }).phone, null);
});
t("a: cari eşleşmesi — e-posta / telefon önce, sonra tek tam ad; belirsizse yok", () => {
  const o = { customer_name: "Elif Kaya", customer_phone: "0555 111 22 33", customer_email: "ELIF@example.test" };
  assert.equal(m.matchParty(o, [{ id: "x", name: "Elif Kaya" }, { id: "c1", name: "E. Kaya", phone: "05551112233" }])?.id, "c1");
  assert.equal(m.matchParty(o, [{ id: "e", name: "Başka", email: "elif@example.test" }])?.id, "e");
  assert.equal(m.matchParty({ customer_name: "elif kaya" }, [{ id: "c1", name: "Elif Kaya" }])?.id, "c1");
  assert.equal(m.matchParty({ customer_name: "İrem Işık" }, [{ id: "c9", name: "irem ışık" }])?.id, "c9");
  assert.equal(m.matchParty({ customer_name: "Elif Kaya" }, [{ id: "a", name: "Elif Kaya" }, { id: "b", name: "Elif Kaya" }]), null);
  assert.equal(m.matchParty({ customer_name: "Elif" }, [{ id: "a", name: "Elif Kaya" }]), null);
  assert.equal(m.matchParty({ customer_name: "" }, [{ id: "a", name: "" }]), null);
});

// c) durum çipleri
t("c: mevcut durum seçeneğe eşlenir (new→Bekleyen, ready_to_ship→Gönderime hazır, completed→Tamamlandı)", () => {
  const opts = [{ value: "pending" }, { value: "processing" }, { value: "shipped" }, { value: "delivered" }, { value: "cancelled" }, { value: "deleted" }];
  assert.equal(m.currentStatusOption("new", opts), "pending");
  assert.equal(m.currentStatusOption("ready_to_ship", opts), "processing");
  assert.equal(m.currentStatusOption("completed", opts), "delivered");
  assert.equal(m.currentStatusOption("returned", opts), "cancelled");
  assert.equal(m.currentStatusOption("SHIPPED", opts), "shipped");
  assert.equal(m.currentStatusOption("garip", opts), null);
});

// d) tek birincil eylem
t("d: birincil eylem sırası — işleme al > fatura kes > gönderi oluştur > yazdır", () => {
  const b = { takeNeeded: false, canInvoice: false, canShip: false, canPrint: false, closed: false };
  assert.equal(m.primaryAction({ ...b, takeNeeded: true, canInvoice: true }), "take");
  assert.equal(m.primaryAction({ ...b, canInvoice: true, canShip: true, canPrint: true }), "invoice");
  assert.equal(m.primaryAction({ ...b, canShip: true, canPrint: true }), "ship");
  assert.equal(m.primaryAction({ ...b, canPrint: true }), "print");
  assert.equal(m.primaryAction(b), null);
  assert.equal(m.primaryAction({ ...b, canPrint: true, closed: true }), null);
});

// e) barkod / takip tekrarı
t("e: takip numarası barkodlardan biriyse tek satır; diğer barkodlar ayrı, iptal yalnız HepsiJet barkodunda", () => {
  const r = m.trackingRows("HJ100200301", ["HJ100200300", "HJ100200301"], true);
  assert.deepEqual(r.map((x) => x.code), ["HJ100200301", "HJ100200300"]);
  assert.equal(r.filter((x) => x.code === "HJ100200301").length, 1);
  assert.deepEqual(r[0], { code: "HJ100200301", kind: "hepsijet-tracking", title: "HepsiJet takip no", copy: true, cancellable: true });
  assert.deepEqual(r[1], { code: "HJ100200300", kind: "hepsijet", title: "HepsiJet barkodu", copy: true, cancellable: true });
  const r2 = m.trackingRows("7300001", [], true);
  assert.deepEqual(r2, [{ code: "7300001", kind: "tracking", title: "Kargo takip numarası", copy: true, cancellable: false }]);
  assert.equal(m.trackingRows("", ["HJ1"], false)[0].cancellable, false);
  assert.deepEqual(m.trackingRows("", [], true), []);
});

// f) ürün görseli
t("f: ürün görseli alan adlarından bulunur; http(s) değilse yok", () => {
  assert.equal(m.itemImage({ image_url: "https://a/x.jpg" }), "https://a/x.jpg");
  assert.equal(m.itemImage({ images: [{ src: "https://a/y.jpg" }] }), "https://a/y.jpg");
  assert.equal(m.itemImage({ images: ["https://a/z.jpg"] }), "https://a/z.jpg");
  assert.equal(m.itemImage({ image_url: "/rel.jpg" }), null);
  assert.equal(m.itemImage({}), null);
  assert.equal(m.itemImage({ image_url: "https://a/x.jpg" }, "https://p/fallback.jpg"), "https://a/x.jpg");
  assert.equal(m.itemImage({}, "https://p/fallback.jpg"), "https://p/fallback.jpg");
});

// g) tutar dökümü
t("g: açık alanlar varsa onlar (ara toplam, indirim, kargo, KDV)", () => {
  const b = m.amountBreakdown({ total_amount: 280, items: [{ total_price: 300, quantity: 2 }], discount_amount: 40, shipping_cost: 20, tax_amount: 46.67 });
  assert.deepEqual(b.rows.map((r) => [r.key, r.label, r.amount]), [
    ["subtotal", "Ara toplam", 300], ["discount", "İndirim", -40], ["shipping", "Kargo", 20], ["tax", "KDV (dahil)", 46.67],
  ]);
  assert.equal(b.total, 280);
});
t("g: alan yoksa fark: eksi → İndirim, artı → Kargo ve diğer; KDV satır oranlarından dahil hesaplanır", () => {
  const d = m.amountBreakdown({ total_amount: 269.8, items: [{ unit_price: 149.9, quantity: 2, vat_rate: 20 }] });
  assert.deepEqual(d.rows.map((r) => [r.key, r.amount]), [["subtotal", 299.8], ["discount", -30], ["tax", 44.97]]);
  const s = m.amountBreakdown({ total_amount: 179.9, items: [{ total_price: 149.9, quantity: 1 }] });
  assert.deepEqual(s.rows.map((r) => [r.key, r.label, r.amount]), [["subtotal", "Ara toplam", 149.9], ["shipping", "Kargo ve diğer", 30]]);
});
t("g: döküm toplamla aynıysa satır yok (yalnız genel toplam); ürünsüz siparişte döküm yok", () => {
  assert.deepEqual(m.amountBreakdown({ total_amount: 149.9, items: [{ unit_price: 149.9, quantity: 1 }] }).rows, []);
  const e = m.amountBreakdown({ total_amount: 50, items: [] });
  assert.deepEqual(e.rows, []); assert.equal(e.total, 50);
  assert.equal(m.amountBreakdown({ total_amount: 0, items: [{ unit_price: 10, quantity: 3 }] }).total, 30);
});

console.log(`\n${n} test geçti`);
