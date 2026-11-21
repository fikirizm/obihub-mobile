// Birim testi: src/auth/permissions.ts — D-30 ekip üyesi yetkileri (rol "member": yalnız sunucunun /team/me permissions listesi).
// "../types" yalnız tip içe aktarımıdır (derlemede silinir).
// Çalıştırma: node dev/test-permissions.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/auth/permissions.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("firma sahibi ve eski roller değişmez (owner = her şey)", () => {
  assert.equal(m.canManage({ role: "owner" }, "billing"), true);
  assert.equal(m.canAccess({ role: "operator" }, "billing"), false);
  assert.equal(m.canManage({}, "catalog"), true);
});
t("D-30 üye (role member): yalnız sunucunun izinleri; bilinmeyen rol gibi sahip SAYILMAZ", () => {
  const ece = { role: "member", permissions: ["dashboard.view", "orders.view", "customers.view", "catalog.view", "inventory.view", "reports.view", "billing.view"] };
  assert.equal(m.canAccess(ece, "billing"), true);
  assert.equal(m.canManage(ece, "billing"), false);
  assert.equal(m.canAccess(ece, "integrations"), false);
  assert.equal(m.canOpenRoute(ece, "local-invoices"), true);
  assert.equal(m.canOpenRoute(ece, "integrations"), false);
  assert.equal(m.canAccess({ role: "member" }, "orders"), false);
  assert.equal(m.canManage({ role: "member", permissions: ["*"] }, "billing"), true);
});
t("yalnız firma sahibi işleri (abonelik, ekip, entegrasyon kimlik bilgisi)", () => {
  assert.equal(m.isOwner({ role: "owner" }), true);
  assert.equal(m.isOwner({ role: "member", is_owner: false }), false);
  assert.equal(m.isOwner({ role: "member", permissions: ["*"] }), false);
});
t("403 PERMISSION_DENIED: sunucu detail'i aynen", () => {
  assert.equal(m.permissionDeniedText({ status: 403, code: "PERMISSION_DENIED", message: "Satışlar modülünde düzenleme yetkiniz yok." }), "Satışlar modülünde düzenleme yetkiniz yok.");
  assert.equal(m.permissionDeniedText({ status: 403, code: "OTHER" }), null);
});
t("Faz A menü kuralı: Satış Ekranı orders.manage, Satış Fişleri orders.view|manage (web Sidebar)", () => {
  const member = (permissions) => ({ role: "member", permissions });
  assert.equal(m.canSell(member(["orders.manage"])), true);
  assert.equal(m.canSell(member(["orders.view"])), false);
  assert.equal(m.canSell(member(["billing.manage"])), false);
  assert.equal(m.canSeeReceipts(member(["orders.view"])), true);
  assert.equal(m.canSeeReceipts(member(["orders.manage"])), true);
  assert.equal(m.canSeeReceipts(member(["billing.manage"])), false);
  assert.equal(m.canSell({ role: "owner" }), true);
  assert.equal(m.canSell({ role: "accountant" }), false);
});
console.log(`\n${n} test geçti`);
