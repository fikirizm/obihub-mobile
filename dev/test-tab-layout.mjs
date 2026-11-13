// Birim testi: src/tab-layout.ts (alt sekme düzeni: Mağaza · Sipariş · [ObiHub = Panel] · Finans · Menü; kullanıcı kararı 13 Kas 2026).
// Çalıştırma: node dev/test-tab-layout.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/tab-layout.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("düzen: 2 sol · ortada Panel (ObiHub rozeti) · 2 sağ", () => {
  const s = m.tabSlots({ integrations: true });
  assert.deepEqual(s.left, ["integrations", "orders"]);
  assert.equal(s.center, "dashboard");
  assert.deepEqual(s.right, ["finance", "menu"]);
});
t("soldan sağa sıra ve erişilebilirlik etiketleri", () => {
  assert.deepEqual(m.tabOrder({ integrations: true }), ["integrations", "orders", "dashboard", "finance", "menu"]);
  assert.equal(m.TAB_LABELS.dashboard, "Panel");
  assert.deepEqual(["integrations", "orders", "finance", "menu"].map((k) => m.TAB_LABELS[k]), ["Mağaza", "Sipariş", "Finans", "Menü"]);
});
t("HepsiJet sekmede yok; Panel ayrı bir sekme değil, rozetin kendisi", () => {
  const all = [...m.tabSlots({ integrations: true }).left, m.tabSlots({ integrations: true }).center, ...m.tabSlots({ integrations: true }).right];
  assert.equal(all.includes("hepsijet"), false);
  assert.equal(all.filter((x) => x === "dashboard").length, 1);
});
t("Mağaza yetkisi yoksa rozet ortada kalır: solda boş yer tutucu", () => {
  const s = m.tabSlots({ integrations: false });
  assert.deepEqual(s.left, [null, "orders"]);
  assert.deepEqual(s.right, ["finance", "menu"]);
  assert.deepEqual(m.tabOrder({ integrations: false }), ["orders", "dashboard", "finance", "menu"]);
});
t("Panel yönlendirmesi değişmedi: rozet dashboard rotasını açar", () => {
  assert.equal(m.PANEL_ROUTE, "/(tabs)/dashboard");
  assert.equal(m.CENTER_TAB, "dashboard");
});

console.log(`\n${n} test geçti`);
