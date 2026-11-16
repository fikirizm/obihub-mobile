// Birim testi: src/sync-error.ts — Dalga 4 (acil): mağaza sipariş çekme hatası. 429 (hız sınırı, Retry-After) ve 503 (geçici; sunucu
// 502/504'ü 503'e çevirir) entegrasyonu bozmaz: sunucu metni bilgi tonuyla, bekleme süresiyle; 400/401/403 hata.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/sync-error.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("429: sunucu metni, bilgi tonu, Retry-After kadar bekleme (yoksa 60 sn)", () => {
  assert.deepEqual(m.syncErrorView({ status: 429, message: "Trendyol hız sınırı; 1 dakika sonra yeniden deneyin.", retryAfter: 60 }),
    { text: "Trendyol hız sınırı; 1 dakika sonra yeniden deneyin.", tone: "info", cooldownMs: 60000, temporary: true });
  assert.equal(m.syncErrorView({ status: 429, message: "" }).cooldownMs, 60000);
  assert.match(m.syncErrorView({ status: 429, message: "Çok fazla istek gönderildi. Lütfen biraz bekleyin." }).text, /biraz/);
});
t("503 / 502 / 504: geçici, entegrasyon bozulmaz, sunucu metni", () => {
  for (const s of [502, 503, 504]) {
    const v = m.syncErrorView({ status: s, message: "Trendyol şu an yanıt vermiyor; biraz sonra yeniden deneyin." });
    assert.equal(v.tone, "info"); assert.equal(v.temporary, true); assert.equal(v.cooldownMs, 30000);
  }
  assert.match(m.syncErrorView({ status: 503, message: "Sunucu hatası (503)" }).text, /geçici/);
});
t("400/401/403 ve diğerleri hata tonu", () => {
  assert.deepEqual(m.syncErrorView({ status: 400, message: "API bilgileri hatalı ya da yetkisiz" }), { text: "API bilgileri hatalı ya da yetkisiz", tone: "error", cooldownMs: 0, temporary: false });
  assert.equal(m.syncErrorView({ status: 200, message: "" }).text, "Senkronizasyon başarısız oldu.");
});

console.log(`\n${n} test geçti`);
