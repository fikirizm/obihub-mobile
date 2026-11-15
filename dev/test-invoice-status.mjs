// Birim testi: src/invoice-status.ts — satış faturası iki eksenli durum (web frontend/src/lib/invoiceStatus.js ile aynı kural).
// Çalıştırma: node dev/test-invoice-status.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/invoice-status.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("sekmeler web ile aynı; kimlik sunucu view parametresi", () => {
  // D-12: sunucu view=arsiv (arşivli belgeler varsayılan listede yok).
  assert.deepEqual(m.SALES_TABS.map((x) => x[0]), ["", "taslak", "kesildi", "resmilesti", "tahsil", "gecikmis", "iptal", "arsiv"]);
  assert.deepEqual(m.SALES_TABS.map((x) => x[1]), ["Tümü", "Taslak", "Kesildi", "Resmileşti", "Tahsil edilecek", "Gecikmiş", "İptal", "Arşiv"]);
});
t("belge ekseni: gonderildi → Kesildi (Gönderildi metni yok)", () => {
  assert.equal(m.documentAxis({ status: "gonderildi" }), "issued");
  assert.equal(m.invoiceStatusView({ status: "gonderildi" }).document.label, "Kesildi");
  assert.equal(m.documentAxis({ status: "taslak" }), "draft");
  assert.equal(m.documentAxis({ status: "iptal" }), "cancelled");
  assert.equal(m.documentAxis({ status: "odendi" }), "issued");
  assert.equal(m.documentAxis({ status: "odendi", edoc_state: "done" }), "official");
  assert.equal(m.documentAxis({ status: "gonderildi", source: "parasut_import" }), "official");
});
t("resmileşmiş belge türü etiketi (e-Fatura / e-Arşiv)", () => {
  assert.equal(m.invoiceStatusView({ status: "resmilesti", edocument_type: "e_archive" }).document.label, "Resmileşti · e-Arşiv");
  assert.equal(m.invoiceStatusView({ status: "resmilesti", edoc_type: "einvoice" }).document.label, "Resmileşti · e-Fatura");
});
t("Resmileşmedi rozeti yalnız Paraşüt bağlıysa ve belge kesilmiş ama resmileşmemişse", () => {
  assert.equal(m.invoiceStatusView({ status: "gonderildi" }, { parasutConnected: true }).notOfficial.label, "Resmileşmedi");
  assert.equal(m.invoiceStatusView({ status: "gonderildi" }, { parasutConnected: false }).notOfficial, null);
  assert.equal(m.invoiceStatusView({ status: "resmilesti" }, { parasutConnected: true }).notOfficial, null);
  assert.equal(m.invoiceStatusView({ status: "taslak" }, { parasutConnected: true }).notOfficial, null);
});
t("tahsilat ekseni: payable_amount esas; tahsil edilecek / kısmen / tahsil edildi / gecikti", () => {
  assert.equal(m.paymentAxis({ status: "gonderildi", total: 1365.63, payable_amount: 1150, paid_amount: 0 }), "to_collect");
  assert.equal(m.paymentAxis({ status: "gonderildi", payable_amount: 1150, paid_amount: 500, remaining_amount: 650 }), "partial");
  assert.equal(m.paymentAxis({ status: "gonderildi", total: 1365.63, payable_amount: 1150, paid_amount: 1150 }), "paid");
  assert.equal(m.paymentAxis({ status: "odendi", total: 100, remaining_amount: 0 }), "paid");
  assert.equal(m.paymentAxis({ status: "gonderildi", total: 100, is_overdue: true }), "overdue");
  assert.equal(m.paymentAxis({ status: "gecikti", total: 100, display_status: "gecikti" }), "overdue");
  assert.equal(m.paymentAxis({ status: "taslak", total: 100 }), null);
  assert.equal(m.paymentAxis({ status: "gonderildi", total: 100, parasut_item_type: "refund" }), null);
});
t("düz metin: 'Kesildi · Resmileşmedi · Tahsil edilecek'", () => {
  assert.equal(m.invoiceStatusText({ status: "gonderildi", total: 10 }, { parasutConnected: true }), "Kesildi · Resmileşmedi · Tahsil edilecek");
  assert.equal(m.invoiceStatusText({ status: "taslak", total: 10 }), "Taslak");
});
t("tutar: liste ve detayda gösterilecek tahsil tutarı payable_amount (yoksa total)", () => {
  assert.equal(m.collectAmount({ total: 1365.63, payable_amount: 1150 }), 1150);
  assert.equal(m.collectAmount({ total: 200 }), 200);
});
t("detay tutar satırları: P1 belgesi (G2 §5 örneği) — vergiler, genel toplam, tahsil edilecek", () => {
  const rows = m.amountRows({ doc_schema: 1, subtotal: 1150, discount_amount: 150, vat_amount: 201.25, other_taxes_total: 2.88, withholding_total: 100.63,
    accommodation_tax_rate: "1", accommodation_tax_total: 11.5, stopaj_rate: "10", stopaj_total: 115, total: 1365.63, payable_amount: 1150 });
  assert.deepEqual(rows.map((r) => [r.label, r.amount]), [
    ["İndirim", -150], ["Ara toplam (KDV hariç)", 1150], ["ÖTV / ÖİV", 2.88], ["KDV", 201.25], ["Konaklama vergisi (%1)", 11.5],
    ["Genel toplam", 1365.63], ["Tevkifat", -100.63], ["Stopaj (%10)", -115], ["Tahsil edilecek", 1150]]);
});
t("detay tutar satırları: eski belge (ara toplam iskonto öncesi), vergi yoksa ek satır yok", () => {
  const rows = m.amountRows({ subtotal: 100, discount_amount: 10, vat_amount: 18, total: 108 });
  assert.deepEqual(rows.map((r) => [r.label, r.amount]), [["Ara toplam", 100], ["İndirim", -10], ["KDV", 18], ["Genel toplam", 108]]);
});
t("%0 konaklama seçilmişse satır %0 ile görünür; seçilmemişse yok", () => {
  assert.ok(m.amountRows({ doc_schema: 1, subtotal: 10, vat_amount: 0, total: 10, accommodation_tax_rate: "0", accommodation_tax_total: 0 }).some((r) => r.label === "Konaklama vergisi (%0)"));
  assert.ok(!m.amountRows({ doc_schema: 1, subtotal: 10, vat_amount: 0, total: 10, accommodation_tax_rate: null, accommodation_tax_total: 0 }).some((r) => /Konaklama/.test(r.label)));
});

t("Paraşüt'e taşınamayan alanlar (G2 §6): tevkifat, ÖTV/ÖİV, konaklama, stopaj → resmileştirme önerilmez, açıklama", () => {
  const inv = { withholding_total: 100.63, other_taxes_total: 2.88, accommodation_tax_total: 11.5, stopaj_total: 115, stopaj_rate: "10" };
  assert.deepEqual(m.parasutUnsupported(inv), ["KDV tevkifatı", "ÖTV/ÖİV", "konaklama vergisi", "stopaj"]);
  assert.equal(m.parasutUnsupportedText(inv), "Bu faturadaki KDV tevkifatı, ÖTV/ÖİV, konaklama vergisi, stopaj Paraşüt'e henüz aktarılamıyor; bu fatura yalnız ObiHub'da kalır.");
  assert.deepEqual(m.parasutUnsupported({ total: 100, discount_amount: 10 }), []);
  assert.equal(m.parasutUnsupportedText({ total: 100 }), null);
});

console.log(`\n${n} test geçti`);
