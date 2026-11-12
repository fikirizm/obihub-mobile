// Birim testi: src/money-retry.ts (anahtarlı para yazımında yeniden deneme kuralı).
// Çalıştırma: node dev/test-money-retry.mjs  (obihub-mobile kökünden; TypeScript derleyicisi frontend/node_modules'tan)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/money-retry.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const err = (status, code) => Object.assign(new Error(code || "e"), { status, code });
function sender(results) {
  const calls = [];
  const send = async () => {
    calls.push(1);
    const r = results.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return { send, calls };
}
const yes = async () => true;
const no = async () => false;
let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }

await t("500 sonrası onayla yeniden gönderir, ikinci denemede başarı", async () => {
  const s = sender([err(500, "INTERNAL"), { id: "x", replayed: true }]);
  const out = await m.sendKeyedMoney(s.send, yes);
  assert.equal(out.ok, true); assert.equal(out.result.replayed, true); assert.equal(s.calls.length, 2);
});
await t("MONEY_INCOMPLETE yeniden denenebilir", async () => {
  const s = sender([err(500, "MONEY_INCOMPLETE"), { id: "x" }]);
  assert.equal((await m.sendKeyedMoney(s.send, yes)).ok, true); assert.equal(s.calls.length, 2);
});
await t("ağ hatası (status 0) yeniden denenebilir", async () => {
  const s = sender([err(0), { id: "x" }]);
  assert.equal((await m.sendKeyedMoney(s.send, yes)).ok, true); assert.equal(s.calls.length, 2);
});
for (const code of ["MONEY_PARTIAL", "MONEY_PENDING"]) {
  await t(`${code} yeniden gönderilmez`, async () => {
    let asked = false;
    const s = sender([err(500, code), { id: "x" }]);
    const out = await m.sendKeyedMoney(s.send, async () => { asked = true; return true; });
    assert.equal(out.ok, false); assert.equal(out.uncertain, true); assert.equal(asked, false); assert.equal(s.calls.length, 1);
  });
}
for (const [status, code] of [[400, "ACCOUNT_REQUIRED"], [409, "PAYMENT_EXCEEDS_REMAINING"], [409, "IDEMPOTENCY_CONFLICT"], [422, "CURRENCY_MISMATCH"]]) {
  await t(`${status} ${code}: tek istek, kesin hata`, async () => {
    const s = sender([err(status, code)]);
    const out = await m.sendKeyedMoney(s.send, yes);
    assert.equal(out.ok, false); assert.equal(out.uncertain, false); assert.equal(s.calls.length, 1);
  });
}
await t("kullanıcı yeniden göndermeyi reddederse belirsiz sonuç döner", async () => {
  const s = sender([err(502)]);
  const out = await m.sendKeyedMoney(s.send, no);
  assert.equal(out.ok, false); assert.equal(out.uncertain, true); assert.equal(s.calls.length, 1);
});
console.log(`${n} test geçti`);
