// Birim testi: src/form-draft.ts (KABUK-2 form taslakları; web lib/formDraft.js). PM kararı 25 Kas: yeni fatura ve yeni ürün,
// kullanıcı + firma anahtarı, çıkışta / firma değişince temizlenir, para tutarları ham (girilen metin) saklanır.
// Çalıştırma: node dev/test-form-draft.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/form-draft.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const NOW = Date.parse("2026-11-25T11:32:00Z"); // 14:32 İstanbul

t("anahtar: firma + kullanıcı + tür; üye e-postasıyla ayrışır; kullanıcı yoksa taslak kapalı", () => {
  assert.equal(m.draftKey({ id: "u1" }, "sales"), "obihub.taslak.v1:u1:u1:sales");
  assert.equal(m.draftKey({ id: "u2", owner_id: "u1" }, "product"), "obihub.taslak.v1:u1:u2:product");
  assert.equal(m.draftKey({ id: "u2", company_id: "c9", owner_id: "u1" }, "sales"), "obihub.taslak.v1:c9:u2:sales");
  assert.equal(m.draftKey({ id: "u2", owner_id: "u1", role: "member", email: "Ali@Example.test" }, "sales"), "obihub.taslak.v1:u1:u2~ali@example.test:sales");
  assert.equal(m.draftKey(null, "sales"), null);
  assert.equal(m.draftKey({ id: "u1" }, ""), null);
  assert.equal(m.tenantPrefix({ id: "u2", owner_id: "u1" }), "obihub.taslak.v1:u1:u2:");
});
t("zarf: sürüm + zaman; 7 günden eski, bozuk ya da başka sürüm okunmaz", () => {
  const text = m.envelope({ a: 1 }, NOW);
  assert.deepEqual(m.parseDraft(text, NOW + 1000), { v: 1, at: NOW, form: { a: 1 } });
  assert.equal(m.parseDraft(text, NOW + 8 * 86400000), null);
  assert.equal(m.parseDraft("{bozuk", NOW), null);
  assert.equal(m.parseDraft(JSON.stringify({ v: 2, at: NOW, form: {} }), NOW), null);
  assert.equal(m.parseDraft(null, NOW), null);
});
t("200 KB'ı aşan taslak yazılmaz", () => {
  assert.equal(m.envelope({ big: "x".repeat(210 * 1024) }, NOW), null);
});
t("temizleme: işlem anahtarları ve yerel görsel adresleri her derinlikte düşer; para metni olduğu gibi kalır", () => {
  const f = { createKey: "k", lines: [{ price: "1.250,5075", idempotency_key: "x", image: "data:image/png;base64,AAA" }], photo: "file:///tmp/a.jpg", notes: "not", omitMe: 1 };
  assert.deepEqual(m.sanitize(f, ["omitMe"]), { lines: [{ price: "1.250,5075" }], notes: "not" });
});
t("zaman metni İstanbul saatiyle: bugün / dün / 12 Kas", () => {
  assert.equal(m.formatDraftTime(NOW - 60000, NOW), "bugün 14:31");
  assert.equal(m.formatDraftTime(NOW - 86400000, NOW), "dün 14:32");
  assert.equal(m.formatDraftTime(Date.parse("2026-11-12T09:05:00Z"), NOW), "12 Kas 12:05");
});
t("firma/kullanıcı değişince başka kapsamın taslakları silinecek anahtarlar", () => {
  const keys = ["obihub.taslak.v1:u1:u1:sales", "obihub.taslak.v1:u1:u2:sales", "obihub.taslak.v1:c9:u2:product", "baska"];
  assert.deepEqual(m.staleKeys(keys, "obihub.taslak.v1:u1:u2:"), ["obihub.taslak.v1:u1:u1:sales", "obihub.taslak.v1:c9:u2:product"]);
  assert.deepEqual(m.staleKeys(keys, null), ["obihub.taslak.v1:u1:u1:sales", "obihub.taslak.v1:u1:u2:sales", "obihub.taslak.v1:c9:u2:product"]);
});

console.log(`\n${n} test geçti`);
