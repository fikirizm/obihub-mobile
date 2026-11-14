// Birim testi: src/product-form.ts (yeni ürün formu; PM 14 Kas 2026 P1 Dalga A: POST /products SKU zorunlu, 422 düz metin detail).
// Çalıştırma: node dev/test-product-form.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/product-form.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("SKU zorunlu: boş ya da yalnız boşluk, gönderim denendiyse hata", () => {
  assert.equal(m.skuProblem("", true), "SKU girin.");
  assert.equal(m.skuProblem("   ", true), "SKU girin.");
  assert.equal(m.skuProblem("", false), null); // henüz denenmediyse kırmızı gösterilmez
  assert.equal(m.skuProblem("AB-1", true), null);
});
t("SKU en çok 64 karakter (denenmese de)", () => {
  assert.match(m.skuProblem("x".repeat(65), false), /64/);
  assert.equal(m.skuProblem("x".repeat(64), true), null);
});
t("ipucu artık 'boş bırakılabilir' demez", () => {
  assert.doesNotMatch(m.SKU_HINT, /boş bırakılabilir/i);
});
t("kayıt hatası: sunucunun düz Türkçe detail'i gösterilir", () => {
  assert.equal(m.createErrorText({ status: 422, code: "SKU_REQUIRED", message: "Ürün kodu (SKU) zorunlu." }), "Ürün kodu (SKU) zorunlu.");
  assert.equal(m.createErrorText({ status: 422, code: "PRICE_INVALID", message: "Fiyat geçersiz." }), "Fiyat geçersiz.");
});
t("kayıt hatası: metin yoksa koda göre Türkçe, o da yoksa genel", () => {
  assert.equal(m.createErrorText({ status: 422, code: "SKU_REQUIRED", message: "" }), "SKU girin.");
  assert.match(m.createErrorText({ status: 422, code: "VAT_INVALID" }), /KDV/);
  assert.match(m.createErrorText({ status: 422, code: "PRICE_INVALID" }), /fiyat/i);
  assert.equal(m.createErrorText({ status: 422, code: "SKU_REQUIRED", message: "Sunucu hatası (422)" }), "SKU girin.");
  assert.equal(m.createErrorText({ status: 403, message: "Bu işlem için yetkiniz bulunmuyor." }), "Bu işlem için yetkiniz bulunmuyor.");
  assert.equal(m.createErrorText({ status: 500 }), "Ürün oluşturulamadı.");
});
console.log(`\n${n} test geçti`);
