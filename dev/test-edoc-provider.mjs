// Birim testi: src/edoc-provider.ts (EDM e-Fatura / Trendyol E-Faturam e-belge özeti; web EdmEdocCard.jsx, TrendyolEdocCard.jsx,
// lib/edmEfatura.js; sözleşme docs/pm/tasarim/edm-efatura-final-rapor-2026-11-25.md, canlı f5650b8d0).
// Çalıştırma: node dev/test-edoc-provider.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/edoc-provider.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("yalnız e-belge sağlayıcısıyla resmileşmiş faturada görünüm; Paraşüt faturasında yok", () => {
  assert.equal(m.edocProviderView({ edoc_state: "done", parasut_invoice_id: "9" }), null);
  assert.equal(m.edocProviderView({ edoc_provider: "edm_efatura" }).provider, "EDM e-Fatura");
  assert.equal(m.edocProviderView({ edoc_provider: "trendyol_efaturam" }).provider, "Trendyol E-Faturam");
});
t("EDM metin durumu önce, yoksa ortak uzak durum; bilinmeyen 'Bilinmiyor'", () => {
  assert.deepEqual(m.edocProviderView({ edoc_provider: "edm_efatura", edoc_remote_code: "send - wait_application_response", edoc_remote_state: "pending" }).status, { label: "Alıcı yanıtı bekleniyor", tone: "warn" });
  assert.deepEqual(m.edocProviderView({ edoc_provider: "edm_efatura", edoc_remote_state: "accepted" }).status, { label: "Onaylandı", tone: "ok" });
  assert.deepEqual(m.edocProviderView({ edoc_provider: "trendyol_efaturam", edoc_remote_state: "garip" }).status, { label: "Bilinmiyor", tone: "neutral" });
  assert.equal(m.edocProviderView({ edoc_provider: "edm_efatura" }).status, null);
});
t("Test ortamı rozeti ve notu (edoc_test_mode)", () => {
  const v = m.edocProviderView({ edoc_provider: "edm_efatura", edoc_test_mode: true });
  assert.equal(v.testMode, true);
  assert.equal(v.notes[0].key, "test");
  assert.match(v.notes[0].text, /Test ortamında kesildi/);
  assert.equal(m.edocProviderView({ edoc_provider: "edm_efatura", edoc_test_mode: false }).testMode, false);
});
t("bilgiler: tür, resmî numara, ETTN, önceki ETTN'ler (en yeni önce), internet satışı", () => {
  const v = m.edocProviderView({ edoc_provider: "edm_efatura", edoc_kind: "e_arsiv", official_number: "EDM2026000000012", edoc_ettn: "aaa-3",
    edoc_previous_ettns: ["aaa-1", "aaa-2", "", null], edoc_internet_sale: true });
  assert.deepEqual(v.facts, [["Belge türü", "e-Arşiv"], ["Resmî numara", "EDM2026000000012"], ["ETTN", "aaa-3"], ["İnternet satışı", "Evet"]]);
  assert.deepEqual(v.previousEttns, ["aaa-2", "aaa-1"]);
});
t("notlar: numara bekleniyor, yeniden gönderim sürüyor, gönderim başarısız, alıcı reddetti", () => {
  const keys = (inv) => m.edocProviderView({ edoc_provider: "edm_efatura", ...inv }).notes.map((x) => x.key);
  assert.deepEqual(keys({ edoc_number_pending: true }), ["number"]);
  assert.deepEqual(keys({ edoc_number_pending: true, official_number: "X" }), []);
  assert.deepEqual(keys({ edoc_resend_ettn: "n" }), ["resend"]);
  assert.deepEqual(keys({ edoc_remote_state: "failed" }), ["failed"]);
  assert.deepEqual(keys({ edoc_remote_state: "failed", edoc_resend_uncertain: true }), ["resend"]);
  assert.deepEqual(keys({ edoc_remote_state: "rejected" }), ["rejected"]);
});
t("yeniden gönder: yalnız EDM, başarısız, yeniden gönderim sürmüyor, iptal değil", () => {
  assert.equal(m.edocProviderView({ edoc_provider: "edm_efatura", edoc_remote_state: "failed" }).canResend, true);
  assert.equal(m.edocProviderView({ edoc_provider: "edm_efatura", edoc_remote_state: "failed", edoc_resend_lock: { at: "x" } }).canResend, false);
  assert.equal(m.edocProviderView({ edoc_provider: "edm_efatura", edoc_remote_state: "failed", edoc_cancelled_at: "x" }).canResend, false);
  assert.equal(m.edocProviderView({ edoc_provider: "trendyol_efaturam", edoc_remote_state: "failed" }).canResend, false);
});
t("hata metni: EDM kodu yerel metin; detay öncelikli kodlarda ve EDOC_* / UBL_* kodlarında sunucu metni", () => {
  assert.match(m.edocErrorText({ code: "EDM_UNAUTHORIZED", message: "x" }), /web servis kullanıcı adı/);
  assert.equal(m.edocErrorText({ code: "EDM_VALIDATION_FAILED", message: "Alıcı VKN hatalı." }), "Alıcı VKN hatalı.");
  assert.equal(m.edocErrorText({ code: "EDOC_RESEND_IN_PROGRESS", message: "Yeniden gönderim sürüyor." }), "Yeniden gönderim sürüyor.");
  assert.equal(m.edocErrorText({ code: "UBL_SUPPLIER_INCOMPLETE", message: "Firma bilgisi eksik: vergi dairesi." }), "Firma bilgisi eksik: vergi dairesi.");
  assert.equal(m.edocErrorText({ code: "X", message: "Sunucu hatası (500)" }, "Olmadı."), "Olmadı.");
});

console.log(`\n${n} test geçti`);
