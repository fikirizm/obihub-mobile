// Birim testi: src/notifications/view.ts (bildirim çipleri, gün grupları, göreli zaman; web components/notifications/
// NotificationDrawer.jsx + notificationTime.js, KABUK-1 23 Kas 2026). Gün sınırı Europe/Istanbul (UTC+3).
// Çalıştırma: node dev/test-notification-view.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/notifications/view.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
// 25 Kas 2026 10:00 İstanbul = 07:00Z
const NOW = Date.parse("2026-11-25T07:00:00Z");
const at = (iso) => Date.parse(iso);

t("gün grubu İstanbul takvimiyle: bugün / dün / bu hafta / daha eski", () => {
  assert.equal(m.dayGroup(at("2026-11-24T21:30:00Z"), NOW), "today");      // 25 Kas 00:30 İstanbul
  assert.equal(m.dayGroup(at("2026-11-24T20:30:00Z"), NOW), "yesterday");  // 24 Kas 23:30 İstanbul
  assert.equal(m.dayGroup(at("2026-11-20T09:00:00Z"), NOW), "week");
  assert.equal(m.dayGroup(at("2026-11-17T09:00:00Z"), NOW), "older");
  assert.equal(m.dayGroup(NaN, NOW), "today");
});
t("göreli zaman web'le aynı: şimdi · 12 dk · 3 sa · dün 16:20 · 12 Kas", () => {
  assert.equal(m.relativeTime(NOW - 20000, NOW), "şimdi");
  assert.equal(m.relativeTime(NOW - 12 * 60000, NOW), "12 dk");
  assert.equal(m.relativeTime(NOW - 3 * 3600000, NOW), "3 sa");
  assert.equal(m.relativeTime(at("2026-11-24T13:20:00Z"), NOW), "dün 16:20");
  assert.equal(m.relativeTime(at("2026-11-12T09:00:00Z"), NOW), "12 Kas");
});
const list = [
  { id: "a", kind: "order", ts: NOW - 60000, read: false },
  { id: "b", kind: "support", ts: at("2026-11-24T13:20:00Z"), read: true },
  { id: "c", kind: "order", ts: at("2026-11-10T13:20:00Z"), read: true },
];
t("çipler: Tümü + yalnız içeriği olan türler, sayılarıyla (web sırası)", () => {
  assert.deepEqual(m.notificationChips(list), [
    { key: "all", label: "Tümü", count: 3 },
    { key: "order", label: "Siparişler", count: 2 },
    { key: "support", label: "Destek", count: 1 },
  ]);
  assert.deepEqual(m.notificationChips([]), []);
});
t("gruplar: süzgece göre, boş grup yok, sıra Bugün → Daha eski", () => {
  const g = m.groupNotifications(list, "all", NOW);
  assert.deepEqual(g.map((x) => [x.title, x.data.map((d) => d.id)]), [["Bugün", ["a"]], ["Dün", ["b"]], ["Daha eski", ["c"]]]);
  assert.deepEqual(m.groupNotifications(list, "support", NOW).map((x) => x.title), ["Dün"]);
  assert.deepEqual(m.groupNotifications(list, "stock", NOW), []);
});

console.log(`\n${n} test geçti`);
