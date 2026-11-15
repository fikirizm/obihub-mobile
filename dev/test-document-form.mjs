// Birim testi: src/document-form.ts — satış faturası formu (G2 sözleşmesi; web frontend/src/lib/documentForm.js ile aynı gövde).
// Çalıştırma: node dev/test-document-form.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/document-form.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const base = () => ({
  ...m.blankForm("2026-11-15"),
  customer_id: "c1", customer_name: "Can Öztürk",
  lines: [
    { ...m.blankLine("l-aaaaaaaaaaaa"), product_id: null, description: "Danışmanlık", quantity: "2", price: "500", vat_rate: 20, discount: { type: "percentage", value: "10" } },
    { ...m.blankLine("l-bbbbbbbbbbbb"), product_id: "p1", product_name: "Konaklama paketi", kind: "product", quantity: "1", price: "300", vat_rate: 10, other_taxes: [{ code: "0059", type: "rate", value: "1" }] },
  ],
});

t("tutar ayrıştırma (web parseTrAmount): Türkçe giriş → noktalı metin, float yok", () => {
  assert.equal(m.dotAmount("1.250,50", 2), "1250.50");
  assert.equal(m.dotAmount("1250,5", 2), "1250.5");
  assert.equal(m.dotAmount("1.250", 2), "1250");
  assert.equal(m.dotAmount("12.5", 2), "12.5");
  assert.equal(m.dotAmount("1,234", 2), null);
  assert.equal(m.dotAmount("-5", 2), null);
  assert.equal(m.dotAmount("", 2), null);
});

t("gövde: G2 alanları (satır iskontosu, satır vergisi, ara toplam indirimi, stopaj, konaklama, tümüne tevkifat, fatura ismi, stok kipi)", () => {
  const f = { ...base(), document_name: " Kasım danışmanlık ", doc_discount: { type: "amount", value: "50" }, stopaj_rate: "10", accommodation_rate: "1", withholding_all: { rate: 50, code: "601" } };
  const b = m.buildBody(f, { action: "issue", createKey: "frm-abc", stockMode: "with_document" });
  assert.equal(b.action, "issue");
  assert.equal(b.create_key, "frm-abc");
  assert.equal(b.invoice_type, "satis");
  assert.equal(b.document_name, "Kasım danışmanlık");
  assert.equal(b.stock_mode, "with_document");
  assert.equal(b.invoice_discount_type, "amount");
  assert.equal(b.invoice_discount_value, "50");
  assert.equal(b.stopaj_rate, "10");
  assert.equal(b.accommodation_tax_rate, "1");
  assert.deepEqual(b.withholding_all, { rate: 50, code: "601" });
  assert.deepEqual(b.items[0], { line_key: "l-aaaaaaaaaaaa", kind: "text", description: "Danışmanlık", quantity: "2", unit: "ADET", unit_price: "500", price_basis: "net", vat_rate: 20, discount: { type: "percentage", value: "10" } });
  assert.deepEqual(b.items[1], { line_key: "l-bbbbbbbbbbbb", kind: "product", product_id: "p1", product_name: "Konaklama paketi", quantity: "1", unit: "ADET", unit_price: "300", price_basis: "net", vat_rate: 10, other_taxes: [{ code: "0059", type: "rate", value: "1" }] });
});

t("gövde: seçilmeyen alanlar gönderilmez (PUT'ta temizlenir)", () => {
  const b = m.buildBody(base(), { stockMode: "none" });
  for (const k of ["document_name", "invoice_discount_type", "stopaj_rate", "accommodation_tax_rate", "withholding_all", "create_key"]) assert.ok(!(k in b), k);
  assert.equal(b.action, "save_draft");
});

t("önizleme gövdesi: aynı satırlar + doc_discount + belge vergileri", () => {
  const f = { ...base(), doc_discount: { type: "amount", value: "50" }, stopaj_rate: "10" };
  const p = m.previewBody(f, "with_document");
  assert.equal(p.type, "sales");
  assert.equal(p.lines.length, 2);
  assert.deepEqual(p.doc_discount, { type: "amount", value: "50" });
  assert.equal(p.stopaj_rate, "10");
  assert.equal(p.stock_mode, "with_document");
  assert.equal(p.customer_name, "Can Öztürk");
});

t("doğrulama: müşteri, satır açıklaması, miktar, fiyat, tevkifat kodu, stoklu üründe tam sayı", () => {
  const f = base();
  assert.deepEqual(m.validateForm(f, { stockMode: "none" }), {});
  const bad = { ...f, customer_name: "", lines: [{ ...m.blankLine("l-x"), description: "", quantity: "0", price: "abc", withholding: { rate: 50, code: "" } }], withholding_all: { rate: 90, code: " " } };
  const e = m.validateForm(bad, { stockMode: "none" });
  assert.equal(e.customer, "Müşteri zorunludur.");
  assert.equal(e.line0, "Bir ürün seçin ya da açıklama yazın.");
  assert.equal(e.qty0, "Geçerli bir miktar girin.");
  assert.equal(e.price0, "Geçerli bir fiyat girin.");
  assert.equal(e.withholding0, "Tevkifat kodunu girin.");
  assert.equal(e.withholding_all, "Tevkifat kodunu girin.");
  const frac = { ...f, lines: [{ ...f.lines[1], quantity: "1,5", tracks_stock: true }] };
  assert.equal(m.validateForm(frac, { stockMode: "with_document" }).qty0, "Stoklu üründe miktar tam sayı olmalı.");
  assert.equal(m.validateForm(frac, { stockMode: "none" }).qty0, undefined);
});

t("hata metni: sunucu detail'i; satır numarası öne eklenir; yoksa koda göre Türkçe", () => {
  assert.equal(m.documentErrorText({ message: "Tevkifat oranı geçersiz.", line: 2 }), "2. satır: Tevkifat oranı geçersiz.");
  assert.equal(m.documentErrorText({ code: "FX_SALES_NOT_YET", message: "" }), "Döviz cinsinden satış faturası henüz kesilemez; taslak olarak kaydedebilirsiniz.");
  assert.equal(m.documentErrorText({}), "Kaydedilemedi. Lütfen tekrar deneyin.");
});

t("Paraşüt'e taşınamayan seçimler formda önceden söylenir", () => {
  const f = { ...base(), stopaj_rate: "10", withholding_all: { rate: 50, code: "601" } };
  assert.deepEqual(m.parasutBlockedFields(f), ["KDV tevkifatı", "konaklama vergisi", "stopaj"]);
  assert.deepEqual(m.parasutBlockedFields({ ...base(), lines: [base().lines[0]] }), []);
});

t("kayıttan forma (düzenleme): P1 alanları geri okunur", () => {
  const f = m.fromInvoice({ customer_id: "c1", customer_name: "Can", document_name: "Kasım", issue_date: "2026-11-14", due_date: "2026-12-14", stock_mode: "none",
    invoice_discount_type: "amount", invoice_discount_value: "50", stopaj_rate: "10", accommodation_tax_rate: "0",
    items: [{ line_key: "l-aaaaaaaaaaaa", description: "Danışmanlık", quantity: 2, unit_price: "500.0000", vat_rate: 20, discount: { type: "percentage", value: "10" }, withholding: { rate: 50, code: "601" } },
            { product_id: "p1", product_name: "Ürün", quantity: 1, unit_price: 300, vat_rate: 10, discount_percent: 5, other_taxes: [{ code: "0071", type: "rate", value: "2.5" }] }] }, "2026-11-15");
  assert.equal(f.document_name, "Kasım");
  assert.equal(f.stock_mode, "none");
  assert.deepEqual(f.doc_discount, { type: "amount", value: "50" });
  assert.equal(f.stopaj_rate, "10");
  assert.equal(f.accommodation_rate, "0");
  assert.equal(f.lines[0].line_key, "l-aaaaaaaaaaaa");
  assert.equal(f.lines[0].price, "500");
  assert.deepEqual(f.lines[0].withholding, { rate: 50, code: "601" });
  assert.deepEqual(f.lines[1].discount, { type: "percentage", value: "5" });
  assert.deepEqual(f.lines[1].other_taxes, [{ code: "0071", type: "rate", value: "2,5" }]);
  assert.equal(f.lines[1].kind, "product");
});

t("toplam satırları (önizleme totals → ekran): G2 §2 örneği", () => {
  const rows = m.totalsRows({ gross: "1300.00", line_discount: "100.00", doc_discount: "50.00", subtotal: "1150.00", other_taxes: "2.88", vat: "201.25",
    withholding: "100.63", accommodation_tax: "11.50", stopaj: "115.00", total: "1365.63", payable: "1150.00" }, { stopaj_rate: "10", accommodation_rate: "1" });
  assert.deepEqual(rows.map((r) => [r.label, r.amount]), [
    ["Brüt tutar", "1300.00"], ["Satır indirimleri", "-100.00"], ["Ara toplam indirimi", "-50.00"], ["Ara toplam", "1150.00"], ["%1 Konaklama vergisi", "11.50"],
    ["ÖTV / ÖİV / satır vergileri", "2.88"], ["Toplam KDV", "201.25"], ["KDV tevkifatı", "-100.63"], ["%10 Stopaj", "-115.00"], ["Genel toplam", "1365.63"], ["Tahsil edilecek", "1150.00"]]);
  const simple = m.totalsRows({ gross: "100.00", line_discount: "0.00", doc_discount: "0.00", subtotal: "100.00", other_taxes: "0.00", vat: "20.00", withholding: "0.00", total: "120.00", payable: "120.00" }, {});
  assert.deepEqual(simple.map((r) => r.label), ["Ara toplam", "Toplam KDV", "Genel toplam"]);
});

t("not seçenekleri (G2 §4): IBAN ve müşteri bakiyesi; ikisi de kapalıysa note_options gönderilmez", () => {
  assert.ok(!("note_options" in m.buildBody(base())));
  const b = m.buildBody({ ...base(), include_iban: true, iban: "tr33 0006 1005 1978 6457 8413 26", include_balance: true });
  assert.deepEqual(b.note_options, { include_iban: true, include_customer_balance: true, iban: "TR33 0006 1005 1978 6457 8413 26" });
  assert.deepEqual(m.buildBody({ ...base(), include_balance: true }).note_options, { include_iban: false, include_customer_balance: true });
  assert.deepEqual(m.previewBody({ ...base(), include_balance: true }, null).note_options, { include_iban: false, include_customer_balance: true });
});
t("IBAN doğrulaması: TR + 24 hane (boşluk serbest)", () => {
  assert.equal(m.validateForm({ ...base(), include_iban: true, iban: "TR12" }, {}).iban, "Geçerli bir IBAN girin (TR ile başlayan 26 karakter).");
  assert.equal(m.validateForm({ ...base(), include_iban: true, iban: "TR33 0006 1005 1978 6457 8413 26" }, {}).iban, undefined);
  assert.equal(m.validateForm({ ...base(), include_iban: false, iban: "x" }, {}).iban, undefined);
});
t("kayıttan forma: note_options ve birim geri okunur", () => {
  const f = m.fromInvoice({ customer_name: "Can", note_options: { include_iban: true, iban: "TR330006100519786457841326", include_customer_balance: true }, items: [{ description: "Kg", quantity: 2, unit: "KGM", unit_price: 5, vat_rate: 1 }] }, "2026-11-15");
  assert.equal(f.include_iban, true);
  assert.equal(f.iban, "TR330006100519786457841326");
  assert.equal(f.include_balance, true);
  assert.equal(f.lines[0].unit, "KGM");
});

t("teklif gövdesi (docType quote): invoice_type teklif, vade yok, geçerlilik tarihi, stok kipi yok", () => {
  const f = { ...base(), valid_until: "2026-11-30" };
  const b = m.buildBody(f, { stockMode: "with_document", docType: "quote", createKey: "frm-q" });
  assert.equal(b.invoice_type, "teklif");
  assert.equal(b.due_date, null);
  assert.equal(b.valid_until, "2026-11-30");
  assert.ok(!("stock_mode" in b));
  assert.ok(!b.items.some((x) => "warehouse_id" in x));
  assert.equal(m.previewBody(f, null, "quote").type, "quote");
  assert.ok(!("valid_until" in m.buildBody({ ...base(), valid_until: "2026-11-30" }, {})));
});
t("teklif doğrulaması: tarih metni ve geçerlilik tarihi teklif tarihinden önce olamaz", () => {
  const e = m.validateForm({ ...base(), issue_date: "", valid_until: "" }, { docType: "quote" });
  assert.equal(e.issue, "Teklif tarihi zorunludur.");
  assert.equal(m.validateForm({ ...base(), valid_until: "2026-11-01" }, { docType: "quote" }).valid, "Geçerlilik tarihi, teklif tarihinden önce olamaz.");
  assert.equal(m.validateForm({ ...base(), due_date: "2026-11-01" }, { docType: "quote" }).due, undefined);
});

console.log(`\n${n} test geçti`);
