// Birim testi: src/product-text.ts (Faz A M10: ürün kısa / detaylı açıklama ve ObiHub web sitesi durumu).
// Sunucu: GET /settings/website/integration/products/{id} (website_store_integration.product_status); web NativeStoreProductPanel.jsx.
// Çalıştırma: node dev/test-product-text.mjs
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
const m = await load("product-text.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
t("biçimli açıklama mobilde düzenlenmez (HTML etiketi)", () => {
  assert.equal(m.isPlainText("Pamuklu, 2 renk."), true);
  assert.equal(m.isPlainText(""), true);
  assert.equal(m.isPlainText("<p>Pamuk</p>"), false);
  assert.equal(m.isPlainText("a <br/> b"), false);
  assert.equal(m.isPlainText("3 < 5 ve 7 > 2"), true);
});
t("düz metin önizlemesi: etiketler ve boşluklar temizlenir", () => {
  assert.equal(m.plainPreview("<p>Pamuk&nbsp;kumaş</p><ul><li>Yıkanabilir</li></ul>"), "Pamuk kumaş Yıkanabilir");
  assert.equal(m.plainPreview("  a \n\n b "), "a b");
});
t("web sitesi durum etiketi (web NativeStoreProductPanel)", () => {
  assert.equal(m.webStatusLabel({ published: true }), "Yayında");
  assert.equal(m.webStatusLabel({ ready: true }), "Yayına hazır");
  assert.equal(m.webStatusLabel({ state: "processing" }), "Yayına hazırlanıyor");
  assert.equal(m.webStatusLabel({ selected: true, state: "error" }), "Düzenleme gerekli");
  assert.equal(m.webStatusLabel({ state: "not_sent" }), "Yayında değil");
  assert.equal(m.webStatusTone({ published: true }), "success");
  assert.equal(m.webStatusTone({ selected: true, state: "error" }), "warning");
  assert.equal(m.pushLabel({ matched: true }), "Mağazada güncelle");
  assert.equal(m.pushLabel({ matched: false }), "Mağazaya gönder");
});
console.log(`${n} test geçti`);
