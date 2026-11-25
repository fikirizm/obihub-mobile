// Birim testi: src/classification.ts (kategori/etiket çipleri ve filtre; web lib/classification.js, ClassChips.jsx,
// useClassificationNames.js). PM kararı 25 Kas: A salt okuma çipleri, B filtre; arşivli soluk; 403'te çipler gizli.
// Çalıştırma: node dev/test-classification.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/classification.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const names = m.nameIndex(
  [{ id: "c1", name: "Toptan", color: "blue", active: true }, { id: "c2", name: "Eski müşteri", color: "nope", active: false }],
  [{ id: "t1", name: "VIP", color: "amber", active: true }, { id: "t2", name: "Kampanya", active: false }, { id: "t3", name: "Bayi" }, { id: "t4", name: "Yurt dışı" }],
);

t("renk kimliği → hex (web paleti); bilinmeyen renk yok", () => {
  assert.equal(m.colorHex("blue"), "#3b82f6");
  assert.equal(m.colorHex("nope"), null);
});
t("satır biçimleri: doğrudan (cari, fatura) ve classification nesnesi (gider); kasada yalnız etiket", () => {
  assert.deepEqual(m.classOf({ category_id: "c1", tag_ids: ["t1"] }), { categoryId: "c1", tagIds: ["t1"] });
  assert.deepEqual(m.classOf({ classification: { category_id: "c2", tag_ids: ["t2", "t2", ""] } }), { categoryId: "c2", tagIds: ["t2"] });
  assert.deepEqual(m.classOf({ tag_ids: ["t3"] }), { categoryId: null, tagIds: ["t3"] });
  assert.deepEqual(m.classOf(null), { categoryId: null, tagIds: [] });
  assert.equal(m.hasClass({ tag_ids: [] }), false);
  assert.equal(m.hasClass({ classification: { category_id: "c1" } }), true);
});
t("çipler: kategori önce; arşivli soluk ve '(arşiv)'; en çok 3 etiket + '+N'; çözülmeyen kimlik atlanır", () => {
  const v = m.chipsView(names, { categoryId: "c2", tagIds: ["t1", "t2", "t3", "t4", "yok"] });
  assert.deepEqual(v.chips, [
    { key: "c:c2", label: "Eski müşteri (arşiv)", color: null, archived: true, kind: "category" },
    { key: "t:t1", label: "VIP", color: "#e8a317", archived: false, kind: "tag" },
    { key: "t:t2", label: "Kampanya (arşiv)", color: null, archived: true, kind: "tag" },
    { key: "t:t3", label: "Bayi", color: null, archived: false, kind: "tag" },
  ]);
  assert.equal(v.more, 1);  // çözülemeyen "yok" sayılmaz
  assert.deepEqual(m.chipsView(names, { categoryId: null, tagIds: [] }), { chips: [], more: 0 });
});
t("eksik etiket kimlikleri (listede olmayan) ayrıca istenecek", () => {
  assert.deepEqual(m.missingTagIds(names, [{ tag_ids: ["t1", "x9"] }, { classification: { tag_ids: ["x8", "x9"] } }]), ["x8", "x9"]);
});
t("B filtre sorgusu (sunucu parse_classification_filter): category_id, tags, tag_mode", () => {
  assert.deepEqual(m.classificationQuery({ categoryId: "c1", tagIds: ["t1", "t3"], tagMode: "any" }), { category_id: "c1", tags: "t1,t3", tag_mode: "any" });
  assert.deepEqual(m.classificationQuery({ categoryId: null, tagIds: ["t1"], tagMode: "untagged" }), { tag_mode: "untagged" });
  assert.deepEqual(m.classificationQuery(m.EMPTY_FILTER), {});
  assert.equal(m.filterCount({ categoryId: "c1", tagIds: ["a", "b"], tagMode: "all" }), 3);
  assert.equal(m.filterCount({ categoryId: null, tagIds: [], tagMode: "untagged" }), 1);
});
t("filtre özet metni", () => {
  assert.equal(m.filterLabel(names, { categoryId: "c1", tagIds: ["t1", "t3"], tagMode: "all" }), "Toptan · VIP + Bayi");
  assert.equal(m.filterLabel(names, { categoryId: null, tagIds: ["t1", "t3"], tagMode: "any" }), "VIP ya da Bayi");
  assert.equal(m.filterLabel(names, { categoryId: null, tagIds: [], tagMode: "untagged" }), "Etiketsiz");
});

console.log(`\n${n} test geçti`);
