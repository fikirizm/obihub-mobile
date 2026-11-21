// Birim testi: src/vat-report.ts (D-20 KDV raporu + P6.4 KDV devri). Sunucu: GET /reports/vat?month (yanıtta carry),
// GET|PUT|DELETE /reports/vat/carry-opening {month, amount}. Web: pages/reports/vatModel.js, VatReportPage.jsx.
// Çalıştırma: node dev/test-vat-report.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
function url(rel) {
  const src = readFileSync(join(here, "../frontend/src", rel), "utf8");
  let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/from "\.\/([\w-]+)"/g, (_, f) => `from "${url(f + ".ts")}"`);
  return "data:text/javascript;base64," + Buffer.from(js).toString("base64");
}
const m = await import(url("vat-report.ts"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const out = { base: "1800.00", vat: "307.00", withholding: "100.00", declared_vat: "207.00", count: 7, vat_unknown_count: 0, vat_unknown_amount: "0.00", by_rate: [{ rate: "10", base: "150.00", vat: "15.00" }, { rate: null, base: "200.00", vat: "2.00" }] };
const inp = { base: "600.00", vat: "120.00", withholding: "30.00", count: 3, vat_unknown_count: 2, vat_unknown_amount: "420.00", by_rate: [] };

t("ay: bugünün ayı İstanbul'a göre, kaydırma, etiket, yol", () => {
  assert.equal(m.currentMonth(new Date("2026-11-30T22:00:00Z")), "2026-12");
  assert.equal(m.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(m.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(m.monthLabel("2026-10"), "Ekim 2026");
  assert.equal(m.isMonth("2026-13"), false);
  assert.equal(m.vatPath("2026-10"), "/reports/vat?month=2026-10");
});
t("sonuç: ödenecek / devreden / fark yok", () => {
  assert.deepEqual(m.resultOf({ result: { status: "payable", payable: "87.00" } }), { label: "Ödenecek KDV", amount: "87.00", tone: "payable" });
  assert.deepEqual(m.resultOf({ result: { status: "carry_forward", carry_forward: "12.50" } }), { label: "Devreden KDV", amount: "12.50", tone: "carry" });
  assert.equal(m.resultOf({}).label, "KDV farkı yok");
});
t("oran etiketi ve satır oranları", () => {
  assert.equal(m.rateLabel("20"), "%20");
  assert.equal(m.rateLabel("0.5"), "%0,5");
  assert.equal(m.rateLabel(null), "Oran bilinmiyor");
  assert.equal(m.rowRates({ rates: [{ rate: "10" }, { rate: "20" }] }), "%10, %20");
  assert.equal(m.rowRates({ rates: [] }), "—");
});
t("belge var mı: satış ya da alışta belge veya KDV'si bilinmeyen kayıt", () => {
  assert.equal(m.hasAnyDocument([{ output: { count: 0 }, input: { count: 0, vat_unknown_count: 1 } }]), true);
  assert.equal(m.hasAnyDocument([{ output: { count: 0 }, input: { count: 0 } }]), false);
});
t("notlar: alış tevkifatı, KDV bilinmeyen, TL karşılığı, önceki ay", () => {
  const cur = { currency: "TRY", output: out, input: inp, try_equivalent: { output_vat: "650.00", input_vat: "0.00", missing_rate_count: 1 } };
  const notes = m.vatNotes(cur, { month: "2026-10", previous: { month: "2026-09", currencies: [{ currency: "TRY", output_vat: "60.00", input_vat: "20.00", kdv1_net: "40.00" }] } });
  assert.match(notes[0], /Alışta tevkif ettiğiniz KDV: ₺30,00/);
  assert.match(notes[1], /Alışta 2 kaydın KDV tutarı bilinmiyor \(brüt ₺420,00\)/);
  assert.match(notes[2], /TL karşılığı/);
  assert.match(notes[2], /1 belgede kur yok/);
  assert.match(notes[3], /^Eylül 2026: ödenecek KDV ₺40,00/);
  const neg = m.vatNotes({ currency: "TRY", output: {}, input: {} }, { month: "2026-10", previous: { currencies: [{ currency: "TRY", output_vat: "0", input_vat: "5", kdv1_net: "-5.00" }] } });
  assert.match(neg[0], /devreden KDV ₺5,00/);
});
t("döküm: para birimi ve taraf süzgeci, satır görünümü", () => {
  const rows = [
    { side: "sales", kind: "sales_invoice", number: "F1", date: "2026-10-05", party_name: "A", currency: "TRY", is_return: false, origin: "obihub", base: "150.00", vat: "25.00", vat_known: true, rates: [{ rate: "20" }] },
    { side: "purchases", kind: "expense_record", number: null, date: "2026-10-20", description: "Kira", currency: "TRY", origin: "parasut", vat_known: false, rates: [] },
    { side: "sales", kind: "sales_invoice", number: "U1", currency: "USD", vat_known: true },
  ];
  assert.equal(m.filterRows(rows, "TRY", "all").length, 2);
  assert.equal(m.filterRows(rows, "TRY", "purchases").length, 1);
  const a = m.rowView(rows[0], "TRY");
  assert.deepEqual(a, { title: "F1", sub: "Satış faturası · 05.10.2026 · A", amount: "KDV ₺25,00", detail: "Matrah ₺150,00 · %20" });
  const b = m.rowView(rows[1], "TRY");
  assert.equal(b.title, "Kira");
  assert.equal(b.sub, "Gider kaydı · Paraşüt · 20.10.2026");
  assert.equal(b.amount, "KDV bilinmiyor");
  assert.equal(m.rowView({ ...rows[0], is_return: true }, "TRY").sub, "Satış faturası (iade) · 05.10.2026 · A");
});
t("devir: sonuç yalnız ok iken; mesaj ve uyarılar", () => {
  const ok = { status: "ok", carry_in: "40.00", payable: "47.00", carry_out: "0.00", result_status: "payable", incomplete_months: ["2026-09"], foreign_currency_months: ["2026-10"], opening: { month: "2026-08", amount: "100.00" } };
  assert.deepEqual(m.carryResult(ok), { label: "Devirle ödenecek KDV", amount: "47.00", tone: "payable" });
  assert.equal(m.carryResult({ ...ok, result_status: "carry_forward", carry_out: "33.00" }).amount, "33.00");
  assert.equal(m.carryResult({ ...ok, result_status: "zero" }).label, "Devirle KDV farkı yok");
  assert.equal(m.carryResult({ status: "not_set" }), null);
  const v = m.carryView(ok);
  assert.match(v.warnings[0], /Eylül 2026/);
  assert.match(v.warnings[1], /Ekim 2026/);
  assert.equal(v.openingText, "Açılış devri: Ağustos 2026 öncesinden ₺100,00. Sonraki aylar zincirle hesaplanır.");
  assert.equal(m.carryView({ status: "before_opening", message: "Açılış Kasım 2026." }).message, "Açılış Kasım 2026. Bu ay için devir bilinmiyor.");
  assert.equal(m.carryView({ status: "not_set", message: "Girilmemiş." }).tone, "warning");
});
t("açılış devri tutarı: Türkçe giriş → sunucu biçimi; hatalı null", () => {
  assert.equal(m.parseCarryAmount("1.250,50"), "1250.50");
  assert.equal(m.parseCarryAmount("1250,5"), "1250.50");
  assert.equal(m.parseCarryAmount("₺ 0"), "0.00");
  assert.equal(m.parseCarryAmount("1.250"), "1250.00");
  assert.equal(m.parseCarryAmount("-5"), null);
  assert.equal(m.parseCarryAmount("1,234"), null);
  assert.equal(m.parseCarryAmount(""), null);
  assert.equal(m.amountToInput("1250.50"), "1250,50");
});
t("açılış devri formu: ay biçimi, gelecek ay yok, gövde; hata metinleri", () => {
  assert.deepEqual(m.carryBody("2026-08", "100", "2026-11"), { ok: true, body: { month: "2026-08", amount: "100.00" } });
  assert.match(m.carryBody("2026-8", "100", "2026-11").error, /YYYY-AA/);
  assert.match(m.carryBody("2026-12", "100", "2026-11").error, /gelecek/);
  assert.match(m.carryBody("2026-08", "abc", "2026-11").error, /sıfır ya da pozitif/);
  assert.equal(m.carryErrorText({ status: 403 }), "Açılış devrini değiştirme yetkiniz yok.");
  assert.equal(m.carryErrorText({ code: "VAT_CARRY_INVALID", message: "Ay geçersiz." }), "Ay geçersiz.");
  assert.match(m.carryErrorText({ status: 500 }), /Biraz sonra/);
  assert.equal(m.CARRY_PATH, "/reports/vat/carry-opening");
});
t("rapor hata metinleri", () => {
  assert.match(m.vatErrorText({ code: "VAT_REPORT_TOO_LARGE" }), /çok fazla belge/);
  assert.match(m.vatErrorText({ code: "VAT_REPORT_PARAMS_INVALID" }), /ay geçersiz/);
  assert.match(m.vatErrorText({ status: 403 }), /yetkiniz yok/);
});
console.log(`${n} test geçti`);
