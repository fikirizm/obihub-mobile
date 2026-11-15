// Birim testi: src/session-refresh.ts — uzun oturum (erişim + yenileme anahtarı). Sunucu sözleşmesi: docs/pm/tasarim/mobil-oturum-push.md.
// Çalıştırma: node dev/test-session-refresh.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/session-refresh.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload) => `${b64u({ alg: "HS256" })}.${b64u(payload)}.imza`;

await t("JWT exp okunur (base64url, dolgu yok); bozuk anahtarda null", () => {
  assert.equal(m.jwtExpMs(jwt({ exp: 1800000000, sub: "u" })), 1800000000 * 1000);
  assert.equal(m.jwtExpMs(jwt({ sub: "u" })), null);
  assert.equal(m.jwtExpMs("bozuk"), null);
  assert.equal(m.jwtExpMs(""), null);
});
await t("yenileme zamanı: bitişe 5 dakikadan az kaldıysa ya da geçtiyse; exp yoksa hayır", () => {
  const now = 1_700_000_000_000;
  assert.equal(m.refreshDue(jwt({ exp: (now + 4 * 60_000) / 1000 }), now), true);
  assert.equal(m.refreshDue(jwt({ exp: (now - 1000) / 1000 }), now), true);
  assert.equal(m.refreshDue(jwt({ exp: (now + 30 * 60_000) / 1000 }), now), false);
  assert.equal(m.refreshDue("opak-anahtar", now), false);
});
await t("tek uçuş: aynı anda gelen istekler tek yenileme yapar ve aynı sonucu alır; bitince yeni çağrı yeniden çalışır", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const run = m.singleFlight(async () => { calls++; await gate; return "yeni-" + calls; });
  const a = run(); const b = run(); const c = run();
  release();
  assert.deepEqual(await Promise.all([a, b, c]), ["yeni-1", "yeni-1", "yeni-1"]);
  assert.equal(calls, 1);
  assert.equal(await run(), "yeni-2");
});
await t("tek uçuş: hata da paylaşılır, sonra yeniden denenebilir", async () => {
  let calls = 0;
  const run = m.singleFlight(async () => { calls++; if (calls === 1) throw new Error("ağ"); return "ok"; });
  const [x, y] = await Promise.allSettled([run(), run()]);
  assert.equal(x.status, "rejected"); assert.equal(y.status, "rejected");
  assert.equal(await run(), "ok");
});
await t("yenileme sonucu: yalnız kesin ret (401/403 ya da bilinen kod) çıkışa düşürür; ağ hatası oturumu korur", () => {
  assert.equal(m.refreshFailureKind({ status: 401 }), "rejected");
  assert.equal(m.refreshFailureKind({ status: 403 }), "rejected");
  assert.equal(m.refreshFailureKind({ status: 400, code: "REFRESH_TOKEN_INVALID" }), "rejected");
  assert.equal(m.refreshFailureKind({ status: 0 }), "transient");
  assert.equal(m.refreshFailureKind({ status: 503 }), "transient");
  assert.equal(m.refreshFailureKind({ status: 429 }), "transient");
});
console.log(`\n${n} test geçti`);
