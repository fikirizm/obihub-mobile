// Birim testi: src/offer-form.ts (C8 yeni teklif formu; web pages/TekliflerPage.js OfferForm/CreateModal).
// Çalıştırma: node dev/test-offer-form.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/offer-form.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const err = (status, code, message) => Object.assign(new Error(message || code || "e"), { status, code });

t("sabitler web ile aynı: para birimleri ve KDV oranları", () => {
  assert.deepEqual(m.OFFER_CURRENCIES, ["TRL", "USD", "EUR", "GBP"]);
  assert.deepEqual(m.VAT_RATES, [0, 1, 8, 10, 18, 20]);
});
t("boş satır: adet 1, KDV 20, yüzde indirim 0", () => {
  assert.deepEqual(m.blankLine(), { description: "", product_id: "", quantity: "1", unit_price: "", vat_rate: 20, discount_type: "percentage", discount_value: "" });
});
t("Paraşüt ürününden satır: ad, kimlik, liste fiyatı (yoksa satış fiyatı), KDV", () => {
  assert.deepEqual(m.lineFromProduct({ id: "p9", name: "Kalem", list_price: "12.5", vat_rate: "10" }, m.blankLine()),
    { description: "Kalem", product_id: "p9", quantity: "1", unit_price: "12,50", vat_rate: 10, discount_type: "percentage", discount_value: "" });
  const l = m.lineFromProduct({ id: "p2", name: "Defter", sales_price: 40 }, { ...m.blankLine(), quantity: "3", unit_price: "1" });
  assert.equal(l.unit_price, "40,00"); assert.equal(l.quantity, "3"); assert.equal(l.vat_rate, 20);
});
t("Türkçe ondalık: tutar 2, adet 4 hane", () => {
  assert.equal(m.trNumber("1.250,50", 2), 1250.5);
  assert.equal(m.trNumber("2,5", 4), 2.5);
  assert.equal(m.trNumber("1,23456", 4), null);
  assert.equal(m.trNumber("", 2), null);
  assert.equal(m.trNumber("-3", 2), null);
});

const contact = { contact_id: "k1", contact_name: "Acme" };
const line = (o) => ({ ...m.blankLine(), description: "Hizmet", unit_price: "100", ...o });
t("tahmini toplamlar (kuruş): yüzde ve tutar indirimi, KDV indirim sonrası", () => {
  const a = m.offerTotals([line({ quantity: "2", unit_price: "100", discount_value: "10", vat_rate: 20 })]);
  assert.deepEqual(a, { subtotal: 20000n, discount: 2000n, vat: 3600n, total: 21600n });
  const b = m.offerTotals([line({ quantity: "1", unit_price: "50", discount_type: "amount", discount_value: "5", vat_rate: 10 }), line({ quantity: "1", unit_price: "10,01", vat_rate: 0 })]);
  assert.deepEqual(b, { subtotal: 6001n, discount: 500n, vat: 450n, total: 5951n });
  assert.deepEqual(m.offerTotals([line({ unit_price: "x" })]), { subtotal: 0n, discount: 0n, vat: 0n, total: 0n });
});

t("doğrulama: müşteri, en az bir satır, birim fiyat, adet > 0, indirim sınırları", () => {
  assert.equal(m.validateOffer({ ...contact, contact_id: "", items: [line()] }).form, "Müşteri seçin.");
  assert.equal(m.validateOffer({ ...contact, items: [] }).form, "En az bir satır ekleyin.");
  const v = m.validateOffer({ ...contact, items: [line({ unit_price: "" }), line({ quantity: "0" }), line({ discount_value: "101" }), line({ discount_type: "amount", discount_value: "150" }), line({ description: " " })] });
  assert.match(v.lines[0], /birim fiyat/i);
  assert.match(v.lines[1], /[Aa]det/);
  assert.match(v.lines[2], /%100/);
  assert.match(v.lines[3], /satır tutarını/);
  assert.match(v.lines[4], /ad/i);
  assert.equal(v.ok, false);
  assert.equal(m.validateOffer({ ...contact, items: [line()] }).ok, true);
});

t("gövde: web CreateModal ile aynı alanlar; boş tarih/not gönderilmez, sayılar ayrıştırılır", () => {
  const body = m.offerPayload({ ...contact, description: "Kış", issue_date: "2026-11-13", due_date: "", currency: "USD", note: "",
    items: [line({ quantity: "2,5", unit_price: "1.250,50", vat_rate: 18, discount_value: "", product_id: "p1" }), line({ discount_type: "amount", discount_value: "3,5" })] });
  assert.deepEqual(body, {
    contact_id: "k1", description: "Kış", issue_date: "2026-11-13", currency: "USD",
    items: [
      { description: "Hizmet", quantity: 2.5, unit_price: 1250.5, vat_rate: 18, discount_type: "percentage", discount_value: 0, product_id: "p1" },
      { description: "Hizmet", quantity: 1, unit_price: 100, vat_rate: 20, discount_type: "amount", discount_value: 3.5 },
    ],
  });
  assert.equal(m.offerPayload({ ...contact, description: "", issue_date: "2026-11-13", due_date: "2026-11-30", currency: "TRL", note: "n", items: [line()] }).due_date, "2026-11-30");
});

t("sonuç belirsiz mi: ağ ve 5xx belirsiz (işlem anahtarı yok, yeniden gönderilmez), 4xx kesin", () => {
  assert.equal(m.offerResultUncertain(err(0)), true);
  assert.equal(m.offerResultUncertain(err(502)), true);
  assert.equal(m.offerResultUncertain(err(500)), true);
  assert.equal(m.offerResultUncertain(err(400)), false);
  assert.equal(m.offerResultUncertain(err(422)), false);
});
t("geçerlilik tarihi kısayolu: gün ekler", () => {
  assert.equal(m.addDays("2026-11-13", 15), "2026-11-28");
  assert.equal(m.addDays("2026-12-25", 30), "2027-01-24");
});

console.log(`\n${n} test geçti`);
