// Birim testi: src/fx.ts — Dalga 3 (P3.2): dövizli virman kuru ve karşılık tutarı, kasada yaklaşık TL toplamı, dövizli faturayı TL'ye tahsil.
// Web: components/cash/kasaModel.js (aynı kurallar). Çalıştırma: node dev/test-fx.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/fx.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const RATES = { USD: { buying: "34.3796", selling: "34.4416" }, EUR: { buying: "36.5", selling: "36.6" } };

t("yaklaşık TL toplamı: dövizler alış kuruyla; yalnız TL ya da kur eksikse yok", () => {
  assert.deepEqual(m.approxTryTotal([{ currency: "TRY", amount: 1000 }, { currency: "EUR", amount: 100 }, { currency: "USD", amount: -10.5 }], RATES),
    { amount: (100000 + 365000 - 36099) / 100, currencies: ["EUR", "USD"] });
  assert.equal(m.approxTryTotal([{ currency: "TRY", amount: 5 }], RATES), null);
  assert.equal(m.approxTryTotal([{ currency: "GBP", amount: 5 }], RATES), null);
  assert.equal(m.approxTryTotal([{ currency: "EUR", amount: 5 }], null), null);
});
t("virman kuru: TL'li transferde 1 döviz = ₺; çapraz kur TL üzerinden", () => {
  assert.equal(m.defaultTransferRate("EUR", "TRY", RATES), "36,5");
  assert.equal(m.defaultTransferRate("TRY", "EUR", RATES), "36,5");
  assert.equal(m.defaultTransferRate("EUR", "USD", RATES), "1,0617");
  assert.equal(m.defaultTransferRate("EUR", "GBP", RATES), "");
  assert.equal(m.defaultTransferRate("TRY", "TRY", RATES), "");
  assert.equal(m.transferRateLabel("EUR", "TRY"), "Döviz kuru (1 EUR = ? ₺)");
  assert.equal(m.transferRateLabel("TRY", "USD"), "Döviz kuru (1 USD = ? ₺)");
  assert.equal(m.transferRateLabel("EUR", "USD"), "Döviz kuru (1 EUR = ? USD)");
});
t("karşılık tutarı: döviz → tutar × kur; TL → döviz tutar ÷ kur; geçersizde boş", () => {
  assert.equal(m.transferTargetAmount("100", "36,5", "EUR", "TRY"), "3650,00");
  assert.equal(m.transferTargetAmount("1.000", "36,5", "TRY", "EUR"), "27,40");
  assert.equal(m.transferTargetAmount("100", "1,0617", "EUR", "USD"), "106,17");
  assert.equal(m.transferTargetAmount("", "36,5", "EUR", "TRY"), "");
  assert.equal(m.transferTargetAmount("100", "0", "EUR", "TRY"), "");
});
t("dövizli faturayı TL hesaba tahsil: önerilen TL tutarı ve hata metinleri", () => {
  assert.equal(m.suggestedTry(100, "EUR", RATES), "3650,00");
  assert.equal(m.suggestedTry(100, "GBP", RATES), "");
  assert.match(m.fxErrorText({ code: "TRANSFER_TARGET_AMOUNT_REQUIRED" }), /karşı hesaba geçen tutar/i);
  assert.match(m.fxErrorText({ code: "FX_RATE_REQUIRED" }), /kur/);
  assert.match(m.fxErrorText({ code: "FX_COLLECTION_PARASUT_UNSUPPORTED" }), /Paraşüt/);
  assert.equal(m.fxErrorText({ code: "X", message: "Sunucu." }), "Sunucu.");
});

console.log(`\n${n} test geçti`);
