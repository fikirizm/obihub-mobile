// Birim testi: src/label-options.ts (E2: kanal başına etiket şablonları ve varsayılan; web components/CargoLabelSidebar.js).
// Çalıştırma: node dev/test-label-options.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/label-options.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const tpl = (p) => m.labelOptionsFor(p).map((o) => o.template);

t("kanal anahtarı web ile aynı", () => {
  assert.equal(m.channelKeyOf("WooCommerce"), "woocommerce");
  assert.equal(m.channelKeyOf("trendyol-2"), "trendyol");
  assert.equal(m.channelKeyOf(""), "other");
});
t("E2: WooCommerce ve diğerlerinde varsayılan orijinal HepsiJet etiketi, ikinci seçenek ürünlü etiket", () => {
  assert.deepEqual(tpl("woocommerce"), ["original", "cargo"]);
  assert.deepEqual(tpl("other"), ["original", "cargo"]);
  assert.deepEqual(tpl("amazon"), ["original", "cargo"]);
  assert.equal(m.labelOptionsFor("woocommerce")[0].label, "Orijinal HepsiJet etiketi");
  assert.equal(m.labelOptionsFor("woocommerce")[1].label, "Ürünlü etiket");
});
t("pazaryerleri değişmedi: Trendyol / n11 / Pazarama yalnız ürünlü, Hepsiburada ürünlü önce, Idefix ortak HepsiJet önce", () => {
  assert.deepEqual(tpl("trendyol"), ["product"]);
  assert.deepEqual(tpl("n11"), ["product"]);
  assert.deepEqual(tpl("pazarama"), ["product"]);
  assert.deepEqual(tpl("hepsiburada"), ["product", "marketplace"]);
  assert.deepEqual(tpl("idefix"), ["shared", "product"]);
});

t("Yurtiçi (ya da başka kargo) takipli siparişte Orijinal HepsiJet etiketi yok; HepsiJet ya da sağlayıcısız siparişte var", () => {
  assert.deepEqual(m.labelOptionsFor("website", "yurtici").map((o) => o.template), ["cargo"]);
  assert.deepEqual(m.labelOptionsFor("woocommerce", "Yurtici").map((o) => o.template), ["cargo"]);
  assert.deepEqual(m.labelOptionsFor("website", "hepsijet").map((o) => o.template), ["original", "cargo"]);
  assert.deepEqual(m.labelOptionsFor("website", "").map((o) => o.template), ["original", "cargo"]);
  assert.deepEqual(m.labelOptionsFor("website").map((o) => o.template), ["original", "cargo"]);
  assert.deepEqual(m.labelOptionsFor("idefix", "yurtici").map((o) => o.template), ["shared", "product"]);
});
console.log(`\n${n} test geçti`);
