// Birim testi: src/order-filters.ts (sipariş durum grupları, sunucu süzgeci ve grup sayıları; kullanıcı isteği 13 Kas 2026:
// "sipariş durumları filtrelenebilmeli. Yani kargoda olanları tamamlananları görebilmeli").
// Çalıştırma: node dev/test-order-filters.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/order-filters.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const g = (k) => m.ORDER_GROUPS.find((x) => x.key === k);

t("gruplar ve sıra: Tümü, Bekleyen, Gönderime hazır, Kargoda, Tamamlandı, İptal / İade, Silinmiş", () => {
  assert.deepEqual(m.ORDER_GROUPS.map((x) => x.label), ["Tümü", "Bekleyen", "Gönderime hazır", "Kargoda", "Tamamlandı", "İptal / İade", "Silinmiş"]);
});
t("sunucunun iç durumları gruplara düşer (order_status.py): new / ready_to_ship açık siparişte", () => {
  for (const s of ["pending", "new", "processing", "ready_to_ship"]) assert.ok(g("pending").statuses.includes(s), s);
  for (const s of ["processing", "ready_to_ship"]) assert.ok(g("processing").statuses.includes(s), s);
  assert.ok(g("shipped").statuses.includes("shipped"));
  for (const s of ["delivered", "completed"]) assert.ok(g("delivered").statuses.includes(s), s);
  for (const s of ["cancelled", "returned", "refunded"]) assert.ok(g("cancelled").statuses.includes(s), s);
  assert.deepEqual(g("deleted").statuses, ["deleted"]);
  assert.deepEqual(g("all").statuses, []);
});
t("grup sayıları /orders/stats'tan (mağaza süzgeciyle aynı uç); özet yoksa sayı yok", () => {
  const st = { total: 74, pending: 12, processing: 8, shipped: 18, delivered: 25, cancelled: 9, deleted: 2 };
  assert.equal(m.groupCount(st, "all"), 74);
  assert.equal(m.groupCount(st, "pending"), 20); // Bekleyen = bekleyen + gönderime hazır (panel kartıyla aynı)
  assert.equal(m.groupCount(st, "processing"), 8);
  assert.equal(m.groupCount(st, "shipped"), 18);
  assert.equal(m.groupCount(st, "delivered"), 25);
  assert.equal(m.groupCount(st, "cancelled"), 9);
  assert.equal(m.groupCount(st, "deleted"), 2);
  assert.equal(m.groupCount(null, "shipped"), undefined);
  assert.equal(m.groupCount({ total: 3 }, "shipped"), 0);
});
t("sunucu sorgusu: durumlar virgüllü, mağaza ve arama birlikte (süzgeç sunucuda; sayfalama doğru)", () => {
  assert.deepEqual(m.orderQuery({ group: "shipped", integrationId: "i1", search: "  ayşe " }), { statuses: g("shipped").statuses, integrationId: "i1", search: "ayşe" });
  assert.deepEqual(m.orderQuery({ group: "all", integrationId: "", search: "" }), { statuses: [], integrationId: undefined, search: undefined });
  assert.deepEqual(m.orderQuery({ group: "bilinmeyen", integrationId: "i2", search: "a" }), { statuses: [], integrationId: "i2", search: undefined });
});

console.log(`\n${n} test geçti`);
