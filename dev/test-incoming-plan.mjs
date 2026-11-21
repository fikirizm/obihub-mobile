// Birim testi: src/incoming-plan.ts (Faz A M6). Web: components/quickImport/useQuickImportPreview.js: stoklu modda form açıkken bir satır
// "Yeni ürün" (new_product_draft) seçilince önce POST …/quick-import/remember-products {line_indexes} ile kart planı alınır; planlanan
// (planned/existing + product_id) satırlar new_product_draft:false ile önizlenir; daha önce planlanan satırlar plana dahil kalır.
// Çalıştırma: node dev/test-incoming-plan.mjs
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
const m = await load("incoming-plan.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const c = (o = {}) => ({ kind: "product", product_id: null, new_product_draft: false, stock: true, vat_exemption_code: null, ...o });

t("plan gerekmez: form kapalı, gider modu ya da yeni ürün seçimi yok", () => {
  assert.equal(m.planIndexes([c({ new_product_draft: true })], new Set(), { formOpen: false, mode: "expense_and_stock" }), null);
  assert.equal(m.planIndexes([c({ new_product_draft: true })], new Set(), { formOpen: true, mode: "expense_only" }), null);
  assert.equal(m.planIndexes([c()], new Set([0]), { formOpen: true, mode: "expense_and_stock" }), null);
});
t("plan satırları: yeni ürün seçilenler + önceden planlananlar (ürünü seçilmemiş ürün satırı)", () => {
  const choices = [c({ new_product_draft: true }), c({ product_id: "p9" }), c(), c({ kind: "service", stock: null }), c({ new_product_draft: true })];
  assert.deepEqual(m.planIndexes(choices, new Set([2]), { formOpen: true, mode: "expense_and_stock" }), [0, 2, 4]);
});
t("plan yanıtı: planned/existing + product_id olan satırlar new_product_draft:false; planlanan küme güncellenir", () => {
  const choices = [c({ new_product_draft: true }), c({ new_product_draft: true }), c({ product_id: "p9" })];
  const res = { lines: [{ index: 0, status: "planned", product_id: "np1" }, { index: 1, status: "failed", product_id: null }, { index: 2, status: "existing", product_id: "p9" }] };
  const out = m.applyPlan(choices, res);
  assert.deepEqual([...out.planned].sort(), [0, 2]);
  assert.equal(out.choices[0].new_product_draft, false);
  assert.equal(out.choices[0].product_id, null);
  assert.equal(out.choices[1].new_product_draft, true);
  assert.equal(out.choices[2].product_id, "p9");
});
t("bozuk yanıt: hiçbir satır çözülmez", () => {
  const out = m.applyPlan([c({ new_product_draft: true })], null);
  assert.equal(out.planned.size, 0); assert.equal(out.choices[0].new_product_draft, true);
});
console.log(`${n} test geçti`);
