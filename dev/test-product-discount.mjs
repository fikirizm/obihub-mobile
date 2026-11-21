// Birim testi: src/product-discount.ts (Faz A M4). Web: components/catalog/productDiscount.js (kuruş + baz puan, yarım yukarı).
// Sözleşme: price = satış (indirimli) fiyatı, regular_price = normal fiyat; regular_price > price ise mağaza üstü çizili gösterir.
// Kaydetme PATCH /products/{id} {price, regular_price}; tek fiyat değişimi /price/adjust (kanallara gönderir, regular_price'a dokunmaz).
// Çalıştırma: node dev/test-product-discount.mjs
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
const d = await load("product-discount.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("yüzdeden indirimli fiyat: yarım yukarı kuruş (web ile aynı)", () => {
  assert.deepEqual(d.discountFromPercent("1000", "20"), { mode: "percent", percent: "20", sale: "800.00" });
  assert.deepEqual(d.discountFromPercent("99.99", "33.33"), { mode: "percent", percent: "33.33", sale: "66.66" });
  assert.deepEqual(d.discountFromPercent("10,05", "50"), { mode: "percent", percent: "50", sale: "5.03" });
  assert.deepEqual(d.discountFromPercent("100", ""), { mode: "percent", percent: "", sale: "" });
  assert.throws(() => d.discountFromPercent("100", "100"), /0 ile 100/);
  assert.throws(() => d.discountFromPercent("0", "10"), /normal satış fiyatını/);
});
t("indirimli fiyattan yüzde", () => {
  assert.deepEqual(d.discountFromPrice("1000", "800"), { mode: "sale", percent: "20", sale: "800" });
  assert.deepEqual(d.discountFromPrice("300", "199.99"), { mode: "sale", percent: "33.34", sale: "199.99" });
  assert.throws(() => d.discountFromPrice("100", "100"), /normal fiyattan düşük/);
});
t("resolve: kaydedilecek price / regular_price", () => {
  assert.deepEqual(d.resolveDiscount("1000", { mode: "percent", percent: "20", sale: "" }).price, 800);
  assert.deepEqual(d.resolveDiscount("1000", { mode: "percent", percent: "20", sale: "" }).regular_price, 1000);
  const none = d.resolveDiscount("1000", d.blankDiscount());
  assert.equal(none.price, 1000); assert.equal(none.regular_price, 1000);
});
t("ürünün mevcut indirimi", () => {
  assert.deepEqual(d.discountForProduct({ price: 800, regular_price: 1000 }), { mode: "sale", percent: "20", sale: "800.00" });
  assert.deepEqual(d.discountForProduct({ price: 1000, regular_price: 1000 }), d.blankDiscount());
  assert.deepEqual(d.discountForProduct({ price: 1000, regular_price: null }), d.blankDiscount());
});
t("görünüm: normal / satış / yüzde", () => {
  assert.deepEqual(d.discountView({ price: 800, regular_price: 1000 }), { discounted: true, regular: 1000, sale: 800, percent: "%20" });
  assert.deepEqual(d.discountView({ price: 500, regular_price: 0 }), { discounted: false, regular: 500, sale: 500, percent: "" });
});
t("ana fiyat planı: indirimsiz ürün → /price/adjust; eski regular_price yüksekse eşitlenir (istenmeden indirim olmaz)", () => {
  assert.deepEqual(d.priceEditPlan({ price: 1000, regular_price: 1000 }, 900, "single"), { adjust: 900, patch: { regular_price: 900 } });
  assert.deepEqual(d.priceEditPlan({ price: 1000, regular_price: 0 }, 900, "single"), { adjust: 900, patch: null });
  assert.deepEqual(d.priceEditPlan({ price: 1000, regular_price: 1000 }, 1100, "single"), { adjust: 1100, patch: null });
});
t("ana fiyat planı: indirimli üründe hangi fiyat", () => {
  const p = { price: 800, regular_price: 1000 };
  assert.deepEqual(d.priceEditPlan(p, 850, "sale"), { adjust: 850, patch: null });
  assert.deepEqual(d.priceEditPlan(p, 1200, "regular"), { adjust: null, patch: { regular_price: 1200 } });
  assert.equal(d.priceEditPlan(p, 1000, "sale").error, "İndirimli fiyat normal fiyattan (₺1.000,00) düşük olmalı. İndirimi kaldırmak için İndirim bölümünü kullanın.");
  assert.equal(d.priceEditPlan(p, 700, "regular").error, "Normal fiyat indirimli fiyattan (₺800,00) yüksek olmalı.");
});
console.log(`${n} test geçti`);
