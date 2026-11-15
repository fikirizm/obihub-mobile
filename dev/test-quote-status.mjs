// Birim testi: src/quote-status.ts — teklif durumu (web frontend/src/lib/quoteStatus.js ile aynı kural).
// Çalıştırma: node dev/test-quote-status.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/quote-status.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const today = "2026-11-15";

t("sekmeler web ile aynı (sunucu quote_outcome)", () => {
  assert.deepEqual(m.OUTCOME_TABS, [["", "Tümü"], ["open", "Açık"], ["accepted", "Kabul edildi"], ["rejected", "Reddedildi"], ["expired", "Süresi doldu"]]);
});
t("etkin sonuç: faturaya çevrilmiş = kabul; açık + geçerlilik geçmiş = süresi doldu", () => {
  assert.equal(m.effectiveOutcome({ converted_invoice_id: "inv1", quote_outcome: "rejected" }, today), "accepted");
  assert.equal(m.effectiveOutcome({ quote_outcome: "open", valid_until: "2026-11-14" }, today), "expired");
  assert.equal(m.effectiveOutcome({ valid_until: "2026-11-15" }, today), "open");
  assert.equal(m.effectiveOutcome({ quote_outcome: "rejected" }, today), "rejected");
});
t("görünüm: iptal önce; etiket ve tür", () => {
  assert.deepEqual(m.quoteOutcomeView({ status: "iptal", quote_outcome: "accepted" }, today), { key: "cancelled", label: "İptal", kind: "neutral" });
  assert.equal(m.quoteOutcomeView({ quote_outcome: "accepted" }, today).kind, "success");
  assert.equal(m.quoteOutcomeView({ quote_outcome: "rejected" }, today).kind, "error");
});
t("eylemler: çevrilmiş teklif düzenlenemez/çevrilemez, faturası açılır; iptal edilmiş yalnız silinemez değil — web menüsüyle aynı", () => {
  assert.deepEqual(m.quoteActions({ status: "taslak" }), { edit: true, convert: true, mark: true, remove: true, openInvoice: false });
  assert.deepEqual(m.quoteActions({ status: "taslak", converted_invoice_id: "i1" }), { edit: false, convert: false, mark: false, remove: false, openInvoice: true });
  assert.deepEqual(m.quoteActions({ status: "iptal" }), { edit: false, convert: false, mark: false, remove: true, openInvoice: false });
});
t("teklif çevirme yanıtı: replayed ise 'daha önce çevrilmişti' metni", () => {
  assert.equal(m.convertText({ id: "i1", replayed: true }), "Bu teklif daha önce faturaya çevrilmişti; mevcut fatura açıldı.");
  assert.equal(m.convertText({ id: "i1" }), "Satış faturası taslağı oluşturuldu");
});
console.log(`\n${n} test geçti`);
