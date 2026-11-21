// Birim testi: src/pos-card.ts (Faz C1: satış ekranı kart hesabı). Sunucu: GET/PATCH /pos/payment-settings (money_pos.settings_view),
// POST /pos/sales card_account_id + payment_provider "manual"; 400 POS_CARD_ACCOUNT_REQUIRED, 422 POS_CARD_ACCOUNT_NOT_ALLOWED /
// POS_CARD_ACCOUNT_INVALID, 400 POS_CASH_ACCOUNT_UNAVAILABLE. Web: pages/POSPage.js CardAccountPicker. Çalıştırma: node dev/test-pos-card.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
async function load(rel) {
  const src = readFileSync(join(here, "../frontend/src", rel), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const m = await load("pos-card.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const paytr = { id: "a9", name: "PayTR", web_payment: true }, yk = { id: "a5", name: "Yapı Kredi POS", web_payment: false };

t("ayarlı firma: card_accounts ve yalnız effective_default ön seçili", () => {
  const s = m.cardSettings({ configured: true, card_accounts: [yk], card_candidates: [yk, paytr], effective_default_card_account_id: "a5" });
  assert.deepEqual(s, { configured: true, accounts: [yk], preferred: "a5" });
});
t("ayarsız firma: adaylar listelenir, hiçbiri (PayTR dahil) kendiliğinden seçilmez", () => {
  const s = m.cardSettings({ configured: false, card_accounts: [], card_candidates: [paytr], effective_default_card_account_id: null });
  assert.deepEqual(s, { configured: false, accounts: [paytr], preferred: "" });
  assert.deepEqual(m.cardSettings(null), { configured: false, accounts: [], preferred: "" });
});
t("seçim korunur (hâlâ listedeyse), yoksa ön seçim", () => {
  assert.equal(m.keepSelection("a5", [yk], "x"), "a5");
  assert.equal(m.keepSelection("a1", [yk], "a5"), "a5");
  assert.equal(m.keepSelection("", [yk], ""), "");
});
t("seçici biçimi: yok / tek hesap (ayarlı) / seçim", () => {
  assert.equal(m.pickerMode([], true), "none");
  assert.equal(m.pickerMode([yk], true), "single");
  assert.equal(m.pickerMode([yk], false), "pick");
  assert.equal(m.pickerMode([yk, paytr], true), "pick");
});
t("etiket ve 'hatırla' varsayılanı: web ödemesi hesabında kapalı", () => {
  assert.equal(m.accountLabel(paytr), "PayTR — web ödemesi");
  assert.equal(m.accountLabel(yk), "Yapı Kredi POS");
  assert.equal(m.rememberDefault(paytr), false);
  assert.equal(m.rememberDefault(yk), true);
  assert.equal(m.WEB_PAYMENT_WARNING, "Bu hesap web mağazası ödemeleri içindir. Mağazadaki POS cihazıyla çektiyseniz cihazın bağlı olduğu hesabı seçin.");
});
t("satış sonrası 'hatırla' gövdesi yalnız ayarsız firmada ve işaretliyse", () => {
  assert.deepEqual(m.rememberBody(false, true, "a5"), { card_account_ids: ["a5"], default_card_account_id: "a5" });
  assert.equal(m.rememberBody(true, true, "a5"), null);
  assert.equal(m.rememberBody(false, false, "a5"), null);
  assert.equal(m.rememberBody(false, true, ""), null);
});
t("kart alanları: hesap + manual sağlayıcı; kartsız ödemede yok", () => {
  assert.deepEqual(m.cardFields(true, "a5"), { card_account_id: "a5", payment_provider: "manual" });
  assert.deepEqual(m.cardFields(true, ""), {});
  assert.deepEqual(m.cardFields(false, "a5"), {});
});
t("hesap ayarını yeniden okutan kodlar", () => {
  for (const c of ["POS_CARD_ACCOUNT_REQUIRED", "POS_CARD_ACCOUNT_NOT_ALLOWED", "POS_CARD_ACCOUNT_INVALID", "POS_CASH_ACCOUNT_UNAVAILABLE"]) assert.equal(m.reloadsSettings(c), true, c);
  assert.equal(m.reloadsSettings("POS_STOCK_RESERVED"), false);
});
console.log(`${n} test geçti`);
