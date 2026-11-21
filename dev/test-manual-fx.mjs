// Birim testi: src/manual-fx.ts (P5.3 dövizli elle alış). Sunucu: manual_purchases (currency + exchange_rate; kur boşsa TCMB),
// satır birim fiyatları döviz; kayıt TL karşılığıyla. Web: components/expenses/ManualExpenseForm.jsx. Çalıştırma: node dev/test-manual-fx.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/manual-fx.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("para birimleri web ile aynı", () => {
  assert.deepEqual(m.PURCHASE_CURRENCIES.map((c) => c[0]), ["TRY", "USD", "EUR", "GBP"]);
});
t("TL: currency TRY, kur gönderilmez", () => {
  assert.deepEqual(m.fxFields("TRY", "36,5"), { fields: { currency: "TRY" }, problem: null });
});
t("döviz: kur Türkçe girilir (6 ondalık), boşsa sunucu TCMB kurunu kullanır; bozuksa sorun", () => {
  assert.deepEqual(m.fxFields("USD", "36,123456"), { fields: { currency: "USD", exchange_rate: "36.123456" }, problem: null });
  assert.deepEqual(m.fxFields("EUR", ""), { fields: { currency: "EUR" }, problem: null });
  assert.equal(m.fxFields("USD", "0").problem, "Kur sıfırdan büyük bir sayı olmalı (ör. 36,50).");
  assert.equal(m.fxFields("USD", "36,1234567").problem, "Kur sıfırdan büyük bir sayı olmalı (ör. 36,50).");
});
t("Ödendi hesapları: TL ve belgenin dövizi", () => {
  const acc = [{ id: "a", currency: "TRY" }, { id: "b", currency: "USD" }, { id: "c", currency: "EUR" }];
  assert.deepEqual(m.payAccountsFor(acc, "TRY").map((a) => a.id), ["a"]);
  assert.deepEqual(m.payAccountsFor(acc, "USD").map((a) => a.id), ["a", "b"]);
});
t("önizleme döviz özeti", () => {
  assert.equal(m.fxSummary({ currency: "USD", rate: "36.5", rate_source: "tcmb", totals: { payable: "120.00" } }), "Döviz tutarı 120,00 USD · kur 36,5 (TCMB)");
  assert.equal(m.fxSummary({ currency: "EUR", rate: "40", rate_source: "manual", totals: { payable: "10" } }), "Döviz tutarı 10,00 EUR · kur 40 (girilen)");
  assert.equal(m.fxSummary(null), null);
});
console.log(`${n} test geçti`);
