// Birim testi: src/payable-fx.ts (P5.3 dövizli borç ödemesi). Sunucu: orchestration/payable_payment.py — dövizli borçta tutar
// döviz; döviz hesabından aynen döviz, TL hesaptan cash_amount zorunlu (döviz × fatura kuru ±%50), currency borcun dövizi.
// Web: components/expenses/PayablePaymentDialog.jsx. Çalıştırma: node dev/test-payable-fx.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/payable-fx.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const tl = { currency: "TRY", remaining: "3650.00", fx: null };
const usd = { currency: "TRY", remaining: "3650.00", fx: { currency: "USD", rate: "36.5", total: "100.00", paid: "0.00", remaining: "100.00" } };
const acc = [{ id: "a", currency: "TRY" }, { id: "b", currency: "USD" }, { id: "c", currency: "EUR" }, { id: "d", currency: "TRL" }];

t("ödeme para birimi: dövizli borçta döviz, aksi halde borcun birimi", () => {
  assert.equal(m.payCurrency(tl), "TRY");
  assert.equal(m.payCurrency(usd), "USD");
  assert.equal(m.payRemaining(usd), "100.00");
  assert.equal(m.payRemaining(tl), "3650.00");
});
t("hesaplar: TL borçta yalnız TL; dövizli borçta TL önce, sonra döviz hesapları", () => {
  assert.deepEqual(m.payAccounts(acc, tl).map((a) => a.id), ["a", "d"]);
  assert.deepEqual(m.payAccounts(acc, usd).map((a) => a.id), ["a", "d", "b"]);
});
t("TL hesaptan dövizli ödemede çıkan TL gerekir; döviz hesabından gerekmez", () => {
  assert.equal(m.needsCash(usd, { currency: "TRY" }), true);
  assert.equal(m.needsCash(usd, { currency: "USD" }), false);
  assert.equal(m.needsCash(tl, { currency: "TRY" }), false);
  assert.equal(m.needsCash(usd, null), false);
});
t("TL önerisi: döviz × kur, kuruşa yuvarlanır, float yok", () => {
  assert.equal(m.cashSuggestion("100.00", "36.5"), "3.650,00");
  assert.equal(m.cashSuggestion("10.01", "36,123456"), "361,60");
  assert.equal(m.cashSuggestion("0", "36.5"), "");
  assert.equal(m.cashSuggestion("12", "x"), "");
  assert.equal(m.cashSuggestion("99999999.99", "40.123456"), "4.012.345.599,60");
});
t("bant: fatura kuruyla karşılığın %50–%150'si dışında uyarı", () => {
  assert.equal(m.cashOutOfBand("100.00", "36.5", "3650.00"), false);
  assert.equal(m.cashOutOfBand("100.00", "36.5", "1825.00"), false);
  assert.equal(m.cashOutOfBand("100.00", "36.5", "1824.99"), true);
  assert.equal(m.cashOutOfBand("100.00", "36.5", "5475.01"), true);
  assert.equal(m.cashOutOfBand("100.00", "", "1"), false);
});
t("gövde: currency her zaman; cash_amount yalnız TL hesaptan dövizli ödemede", () => {
  const base = { amount: "100.00", date: "2026-11-22", account_id: "a", idempotency_key: "k1", note: " fatura " };
  assert.deepEqual(m.paymentBody(usd, { currency: "TRY" }, base, "3650.00"),
    { amount: "100.00", date: "2026-11-22", account_id: "a", idempotency_key: "k1", currency: "USD", note: "fatura", cash_amount: "3650.00" });
  assert.deepEqual(m.paymentBody(usd, { currency: "USD" }, { ...base, note: "" }, "3650.00"),
    { amount: "100.00", date: "2026-11-22", account_id: "a", idempotency_key: "k1", currency: "USD" });
  assert.equal(m.paymentBody(tl, { currency: "TRY" }, base, null).currency, "TRY");
});
t("önceki ödeme satırı: dövizli ödemede döviz karşılığı ve çalışan cebinden", () => {
  assert.equal(m.paymentLine({ amount: "3650.00", currency: "TRY", fx: { amount: "100.00", currency: "USD" }, account_name: "Ana Banka" }), "₺3.650,00 (100,00 USD) · Ana Banka");
  assert.equal(m.paymentLine({ amount: "50.00", currency: "TRY", method: "employee", employee_name: "Ali" }), "₺50,00 · Çalışan cebinden · Ali");
});
t("hata metinleri", () => {
  assert.match(m.fxErrorText({ code: "PAYMENT_CASH_AMOUNT_OUT_OF_RANGE" }), /fatura kuruyla/);
  assert.match(m.fxErrorText({ code: "PAYMENT_CASH_AMOUNT_REQUIRED" }), /hesaptan çıkan TL/);
  assert.equal(m.fxErrorText({ code: "OTHER" }), null);
});
t("elle TL döviz tutarıyla aynı oranla ölçeklenir (kuruş, BigInt)", () => {
  assert.equal(m.scaleCash("3700.00", "100.00", "50.00"), "1.850,00");
  assert.equal(m.scaleCash("3700.00", "100.00", "33.33"), "1.233,21");
  assert.equal(m.scaleCash("1000.00", "3.00", "1.00"), "333,33");
  assert.equal(m.scaleCash("", "100.00", "50.00"), "");
  assert.equal(m.scaleCash("3700.00", "0", "50.00"), "");
  assert.equal(m.scaleCash("3700.00", "100.00", ""), "");
});
t("TL/tutar oranı önerilen kurdan %5'ten fazla saparsa uyarı", () => {
  assert.equal(m.rateDeviates("3650.00", "100.00", "36.5"), false);
  assert.equal(m.rateDeviates("3832.50", "100.00", "36.5"), false);
  assert.equal(m.rateDeviates("3832.51", "100.00", "36.5"), true);
  assert.equal(m.rateDeviates("3467.49", "100.00", "36,5"), true);
  assert.equal(m.rateDeviates("3650.00", "100.00", ""), false);
  assert.equal(m.rateDeviates("", "100.00", "36.5"), false);
});
console.log(`${n} test geçti`);
