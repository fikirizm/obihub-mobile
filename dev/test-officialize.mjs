// Birim testi: src/officialize.ts — Dalga 2 resmileştirme: e-Arşiv internet satışı, iade e-belgesi, yeni hata kodları.
// Çalıştırma: node dev/test-officialize.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/officialize.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("internet satışı: kapalıyken hata yok ve gövde yok (eski istek)", () => {
  const v = m.blankInternetSale("2026-11-16");
  assert.deepEqual(m.validateInternetSale(v, "2026-11-16"), {});
  assert.equal(m.officializeBody(v), undefined);
});
t("internet satışı: web adresi, aracı adı, ödeme tarihi denetlenir", () => {
  const e = m.validateInternetSale({ enabled: true, url: "magaza", payment_type: "payment_platform", payment_platform: " ", payment_date: "2026-11-20" }, "2026-11-16");
  assert.deepEqual(Object.keys(e).sort(), ["payment_date", "payment_platform", "url"]);
  assert.match(e.payment_date, /ileri/);
  assert.deepEqual(m.validateInternetSale({ enabled: true, url: "https://magaza.com", payment_type: "credit_card", payment_date: "2026-11-15" }, "2026-11-16"), {});
});
t("internet satışı gövdesi: aracı adı yalnız ödeme aracısında; kırpılır", () => {
  assert.deepEqual(m.officializeBody({ enabled: true, url: " https://magaza.com ", payment_type: "credit_card", payment_platform: "iyzico", payment_date: "2026-11-15" }),
    { internet_sale: { url: "https://magaza.com", payment_type: "credit_card", payment_platform: "", payment_date: "2026-11-15" } });
  assert.equal(m.officializeBody({ enabled: true, url: "https://a.com", payment_type: "payment_platform", payment_platform: " PayTR ", payment_date: "2026-11-15" }).internet_sale.payment_platform, "PayTR");
  assert.deepEqual(m.PAYMENT_TYPES.map((x) => x[0]), ["credit_card", "bank_transfer", "cash_on_delivery", "payment_platform", "other"]);
});
t("iade e-belgesi: kesilmiş iade faturası resmileştirilir; gider pusulası / taslak / gönderilmiş değil", () => {
  assert.equal(m.canOfficializeReturn({ invoice_type: "iade", status: "gonderildi" }), true);
  assert.equal(m.canOfficializeReturn({ invoice_type: "iade", status: "gecikti", return_kind: "iade_faturasi" }), true);
  assert.equal(m.canOfficializeReturn({ invoice_type: "iade", status: "gonderildi", return_kind: "gider_pusulasi" }), false);
  assert.equal(m.canOfficializeReturn({ invoice_type: "iade", status: "taslak" }), false);
  assert.equal(m.canOfficializeReturn({ invoice_type: "iade", status: "gonderildi", parasut_invoice_id: "1" }), false);
  assert.equal(m.canOfficializeReturn({ invoice_type: "satis", status: "gonderildi" }), false);
  assert.equal(m.canOfficializeReturn({ invoice_type: "iade", status: "gonderildi", read_only: true }), false);
});
t("hata metni: sunucu metni önce; yoksa koda göre Türkçe", () => {
  assert.equal(m.officializeErrorText({ code: "RETURN_SOURCE_NOT_OFFICIAL", message: "Önce asıl faturayı resmileştirin." }), "Önce asıl faturayı resmileştirin.");
  for (const c of ["INTERNET_SALE_INVALID", "WITHHOLDING_CODES_MIXED", "EXEMPTION_CODES_MIXED", "EXPORT_CODE_REQUIRES_ZERO_VAT", "ISSUE_BEFORE_OPENING_DATE",
    "PARASUT_TOTAL_MISMATCH", "RETURN_NOT_ISSUED", "RETURN_SOURCE_NOT_OFFICIAL", "RETURN_KIND_NOT_SUPPORTED", "RETURN_NOT_SUPPORTED"])
    assert.ok(m.officializeErrorText({ code: c, message: "Sunucu hatası (409)" }).length > 10, c);
  assert.match(m.officializeErrorText({ code: "PARASUT_TOTAL_MISMATCH" }), /gönderilmedi/);
  assert.equal(m.officializeErrorText({ message: "" }), "Resmileştirilemedi.");
});

console.log(`\n${n} test geçti`);
