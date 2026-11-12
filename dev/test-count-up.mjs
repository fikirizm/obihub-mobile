// Birim testi: src/count-up.ts (G5 özet tutarı sayaç animasyonu; ara değer, kuruşa yuvarlama, süre).
// Çalıştırma: node dev/test-count-up.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/count-up.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("uçlar: t=0 başlangıç, t>=1 tam hedef (yuvarlama kaybı yok)", () => {
  assert.equal(m.countUpValue(0, 1234.56, 0), 0);
  assert.equal(m.countUpValue(0, 1234.56, 1), 1234.56);
  assert.equal(m.countUpValue(0, 1234.56, 1.4), 1234.56);
  assert.equal(m.countUpValue(500, 200, 1), 200);
});
t("ara değer kuruşa yuvarlanır ve yavaşlayarak yaklaşır (ease-out)", () => {
  const mid = m.countUpValue(0, 1000, 0.5);
  assert.ok(mid > 500 && mid < 1000, String(mid));
  assert.equal(Math.round(mid * 100), mid * 100);
  assert.ok(m.countUpValue(0, 1000, 0.25) > 250);
});
t("azalan değer de çalışır; geçersiz sayı hedefe atlar", () => {
  const v = m.countUpValue(1000, 0, 0.5);
  assert.ok(v < 500 && v > 0);
  assert.equal(m.countUpValue(NaN, 50, 0.3), 50);
});
t("animasyon gerekmez: aynı değer, hareketi azalt açık ya da çok küçük fark", () => {
  assert.equal(m.shouldAnimate(10, 10, false), false);
  assert.equal(m.shouldAnimate(0, 10, true), false);
  assert.equal(m.shouldAnimate(10, 10.004, false), false);
  assert.equal(m.shouldAnimate(0, 10, false), true);
});

console.log(`\n${n} test geçti`);
