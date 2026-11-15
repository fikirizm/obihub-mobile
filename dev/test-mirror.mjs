// Birim testi: src/mirror.ts — Paraşüt aynası (G4-30): source_kind, read_only, mirror; aynalı kayda yazma 409.
// Çalıştırma: node dev/test-mirror.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/mirror.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("salt okunur: yalnız read_only true (kaynak bilgisi tek başına kilitlemez — cari bağlantıya bakar)", () => {
  assert.equal(m.isReadOnly({ read_only: true }), true);
  assert.equal(m.isReadOnly({ source_kind: "parasut", read_only: false }), false);
  assert.equal(m.isReadOnly({}), false);
  assert.equal(m.isReadOnly(null), false);
});
t("Paraşüt rozeti: kaynağı Paraşüt olan kayıtta; eşitleme zamanı varsa alt bilgi", () => {
  assert.deepEqual(m.mirrorBadge({ source_kind: "parasut", mirror: { synced_at: "2026-11-15T10:00:00Z" } }), { label: "Paraşüt", syncedAt: "2026-11-15T10:00:00Z" });
  assert.deepEqual(m.mirrorBadge({ read_only: true, mirror: { provider: "parasut" } }), { label: "Paraşüt", syncedAt: null });
  assert.equal(m.mirrorBadge({ source_kind: "obihub" }), null);
});
t("409 ayna hataları: sunucu detail'i; yoksa koda göre Türkçe", () => {
  assert.equal(m.isMirrorError({ status: 409, code: "MIRROR_READ_ONLY" }), true);
  assert.equal(m.isMirrorError({ status: 409, code: "COLLECT_IN_PARASUT" }), true);
  assert.equal(m.isMirrorError({ status: 409, code: "HAS_PAYMENTS" }), false);
  assert.equal(m.mirrorErrorText({ code: "MIRROR_READ_ONLY", message: "Bu kayıt Paraşüt'te yönetilir." }), "Bu kayıt Paraşüt'te yönetilir.");
  assert.match(m.mirrorErrorText({ code: "COLLECT_IN_PARASUT", message: "" }), /Paraşüt'te tahsil/);
  assert.match(m.mirrorErrorText({ code: "MIRROR_ACCOUNT_READ_ONLY", message: "Sunucu hatası (409)" }), /Paraşüt/);
});
t("tahsil edilemeyen fatura (collect_blocked): seçilemez, not 'Paraşüt'te tahsil edin'", () => {
  assert.equal(m.collectBlocked({ collect_blocked: true }), true);
  assert.equal(m.collectBlocked({ read_only: true }), false);
  assert.equal(m.COLLECT_IN_PARASUT_TEXT, "Paraşüt'te tahsil edin");
});
console.log(`\n${n} test geçti`);
