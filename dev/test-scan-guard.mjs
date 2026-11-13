// Birim testi: src/scan-guard.ts (kamera barkodu her karede okur; aynı barkod çerçeveden çıkmadan yeniden sayılmaz).
// Çalıştırma: node dev/test-scan-guard.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/scan-guard.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
// Her 100 ms'de bir okuma (kamera karesi) gibi bir dizi: [kod, zaman]
function run(reads) {
  const g = m.createScanGuard();
  return reads.filter(([code, at]) => g.accept(code, at)).map(([c]) => c);
}

t("barkod çerçevede 10 saniye tutulursa yalnız 1 kez sayılır (asıl hata)", () => {
  const reads = Array.from({ length: 100 }, (_, i) => ["8690000000001", i * 100]);
  assert.deepEqual(run(reads), ["8690000000001"]);
});
t("çerçeveden çıkarılıp yeniden gösterilirse ikinci kez sayılır", () => {
  const reads = [["A", 0], ["A", 100], ["A", 200], /* çekildi */ ["A", 1500], ["A", 1600]];
  assert.deepEqual(run(reads), ["A", "A"]);
});
t("kısa okuma kesintisi (kare kaçırma) yeni okuma sayılmaz", () => {
  const reads = [["A", 0], ["A", 100], ["A", 500], ["A", 900], ["A", 1300]];
  assert.deepEqual(run(reads), ["A"]);
});
t("farklı barkod hemen sayılır; geri dönülen ilk barkod da yeniden sayılır", () => {
  const reads = [["A", 0], ["A", 100], ["B", 200], ["B", 300], ["A", 400]];
  assert.deepEqual(run(reads), ["A", "B", "A"]);
});
t("boş okuma yok sayılır", () => {
  assert.deepEqual(run([["", 0], ["A", 50]]), ["A"]);
});

console.log(`\n${n} test geçti`);
