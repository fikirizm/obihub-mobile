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

// Sözleşme (13 Kas 2026, backend/order_status.py ORDER_STATUS_GROUPS): GET /orders?status_group=…, /orders/stats → groups.
t("gruplar sunucu gruplarıyla bire bir: Tümü, Bekleyen, Gönderime hazır, Kargoda, Tamamlandı, İptal, İade, Silinmiş", () => {
  assert.deepEqual(m.ORDER_GROUPS.map((x) => x.key), ["all", "pending", "ready_to_ship", "shipped", "delivered", "cancelled", "returned", "deleted"]);
  assert.deepEqual(m.ORDER_GROUPS.map((x) => x.label), ["Tümü", "Bekleyen", "Gönderime hazır", "Kargoda", "Tamamlandı", "İptal", "İade", "Silinmiş"]);
});
t("çip sayıları stats.groups'tan; toplama yok; groups yoksa sayı yok", () => {
  const st = { total: 74, pending: 12, processing: 8, groups: { all: 74, pending: 20, ready_to_ship: 3, shipped: 18, delivered: 25, cancelled: 4, returned: 2, deleted: 2 } };
  assert.equal(m.groupCount(st, "all"), 74);
  assert.equal(m.groupCount(st, "pending"), 20);
  assert.equal(m.groupCount(st, "ready_to_ship"), 3);
  assert.equal(m.groupCount(st, "returned"), 2);
  assert.equal(m.groupCount(st, "cancelled"), 4);
  assert.equal(m.groupCount(null, "shipped"), undefined);
  assert.equal(m.groupCount({ total: 3, pending: 1, processing: 1 }, "pending"), undefined);
  assert.equal(m.groupCount({ groups: { all: 3 } }, "shipped"), 0);
});
t("sunucu sorgusu status_group ile; Tümü'de grup gönderilmez; mağaza ve arama birlikte", () => {
  assert.deepEqual(m.orderQuery({ group: "returned", integrationId: "i1", search: "  ayşe " }), { statusGroup: "returned", integrationId: "i1", search: "ayşe" });
  assert.deepEqual(m.orderQuery({ group: "all", integrationId: "", search: "" }), { statusGroup: undefined, integrationId: undefined, search: undefined });
  assert.deepEqual(m.orderQuery({ group: "bilinmeyen", integrationId: "i2", search: "a" }), { statusGroup: undefined, integrationId: "i2", search: undefined });
});
t("arama sunucuda kaçışlanır: istemci metni olduğu gibi gönderir (+90 telefon, parantez)", () => {
  assert.equal(m.orderQuery({ group: "all", search: "+90 (555)" }).search, "+90 (555)");
});

console.log(`\n${n} test geçti`);
