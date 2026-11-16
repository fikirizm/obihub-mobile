// Birim testi: src/stock-count.ts — Dalga 4 (P4.1): barkodla toplu sayım. POST /stock/count-bulk/preview → farklar; /apply yalnız farklı
// satırlar (product_id, counted, expected) + Idempotency-Key. Tek satır bile engelliyse hiçbiri yazılmaz (409).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/stock-count.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("okutma: aynı kod +1 artar, yeni kod listenin başına 1 ile eklenir; boşluk kırpılır", () => {
  let l = m.addScan([], " 8690001 ");
  l = m.addScan(l, "8690002");
  l = m.addScan(l, "8690001");
  assert.deepEqual(l, [{ code: "8690002", counted: 1 }, { code: "8690001", counted: 2 }].reverse().sort((a, b) => (a.code === "8690001" ? -1 : 1)));
  assert.deepEqual(m.addScan(l, "  "), l);
});
t("elle miktar: tamsayı ≥ 0; 0 bırakılabilir; satır silme", () => {
  const l = [{ code: "A", counted: 3 }, { code: "B", counted: 1 }];
  assert.deepEqual(m.setCount(l, "A", "7"), [{ code: "A", counted: 7 }, { code: "B", counted: 1 }]);
  assert.deepEqual(m.setCount(l, "A", "0"), [{ code: "A", counted: 0 }, { code: "B", counted: 1 }]);
  assert.deepEqual(m.setCount(l, "A", "2,5"), l);
  assert.deepEqual(m.removeLine(l, "B"), [{ code: "A", counted: 3 }]);
});
t("önizleme gövdesi: depo + satırlar (kod ile)", () => {
  assert.deepEqual(m.previewBody("w1", [{ code: "A", counted: 3 }]), { warehouse_id: "w1", lines: [{ code: "A", counted_quantity: 3 }] });
});
t("onay gövdesi: yalnız farkı olan, ürünü bulunan satırlar; gerekçe", () => {
  const rows = [
    { product_id: "p1", counted: 5, expected: 3, diff: 2, status: "change" },
    { product_id: "p2", counted: 4, expected: 4, diff: 0, status: "same" },
    { product_id: null, counted: 1, status: "error", code: "PRODUCT_NOT_FOUND" },
  ];
  assert.deepEqual(m.applyBody("w1", rows, " Yıl sonu sayımı "), { warehouse_id: "w1", reason: "Yıl sonu sayımı", lines: [{ product_id: "p1", counted_quantity: 5, expected_quantity: 3 }] });
  assert.equal(m.applyBody("w1", rows, "").reason, "Mobil toplu sayım");
  assert.equal(m.canApply(rows), false);
  assert.equal(m.canApply(rows.slice(0, 2)), true);
  assert.equal(m.canApply([rows[1]]), false);
});
t("özet ve hata metinleri", () => {
  assert.equal(m.summaryText({ lines: 3, changes: 1, same: 1, errors: 1, increase: 2, decrease: 0 }), "3 satır · 1 farklı (+2 / −0) · 1 aynı · 1 hatalı");
  assert.match(m.countErrorText({ code: "STOCK_CHANGED" }), /Önizlemeyi yenileyin/);
  assert.equal(m.countErrorText({ code: "X", message: "Sunucu metni." }), "Sunucu metni.");
  assert.equal(m.applyResultText({ status: "done", applied: 2, unchanged: 0, replayed: 0, failed: [] }), "Sayım kaydedildi: 2 ürün güncellendi.");
  assert.match(m.applyResultText({ status: "partial", applied: 1, failed: [{ product_id: "p9" }] }), /1 ürün yazılamadı/);
});

console.log(`\n${n} test geçti`);
