// Birim testi: src/integration-sync.ts — İlk kullanım dalgası: sipariş çekme arka plan işi (202 + job_id, GET /integration-jobs/{id},
// 409 + X-Job-Id) ve entegrasyon durumu (auth_failed → yeniden bağlan; geçici hata "Hata" değil).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/integration-sync.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("başlatma: 202 job_id → iş izlenir; senkron yanıt → iş yok", () => {
  assert.equal(m.jobIdOf({ success: true, accepted: true, job_id: "j1", message: "Çekim arka planda başladı." }), "j1");
  assert.equal(m.jobIdOf({ success: true, count: 3 }), null);
  assert.equal(m.jobIdOfError({ status: 409, jobId: "j2" }), "j2");
  assert.equal(m.jobIdOfError({ status: 409 }), null);
  assert.equal(m.jobIdOfError({ status: 500, jobId: "j3" }), null);
});
t("iş görünümü: sürüyor (ilerleme), bitti (özet / kısmi), hata (error_tr)", () => {
  assert.deepEqual(m.jobView({ state: "running", progress: { done: 30, total: 120, label: "Sayfa 3/12" } }), { phase: "running", percent: 25, text: "Sayfa 3/12 · %25", tone: "info" });
  assert.deepEqual(m.jobView({ state: "running", progress: {} }), { phase: "running", percent: null, text: "Çekim sürüyor…", tone: "info" });
  assert.deepEqual(m.jobView({ state: "done", message: "45 sipariş çekildi" }), { phase: "done", percent: 100, text: "45 sipariş çekildi", tone: "success" });
  assert.equal(m.jobView({ state: "done", partial: true, message: "" }).tone, "info");
  assert.match(m.jobView({ state: "done", partial: true }).text, /bir kısmı/);
  assert.deepEqual(m.jobView({ state: "failed", error_tr: "Trendyol yetkisi reddedildi." }), { phase: "failed", percent: null, text: "Trendyol yetkisi reddedildi.", tone: "error" });
  assert.equal(m.jobView({ state: "failed", error_kind: "rate_limited", error_tr: "Hız sınırı." }).tone, "info");
});
t("entegrasyon durumu: auth_failed → yeniden bağlan; geçici hata durumu bozmaz, ikincil satır", () => {
  assert.deepEqual(m.integrationStatus({ status: "success", auto_sync_status: "auth_failed", last_sync_error: "401" }), { label: "Yetki gerekli – Yeniden bağlan", tone: "error", reconnect: true, note: null });
  assert.deepEqual(m.integrationStatus({ status: "success", last_sync_error: "Trendyol hız sınırı", last_sync_error_kind: "rate_limited" }), { label: "Bağlı", tone: "success", reconnect: false, note: "Son çekim: Trendyol hız sınırı" });
  assert.deepEqual(m.integrationStatus({ status: "connected", sync_running: true }), { label: "Bağlı", tone: "success", reconnect: false, note: "Sipariş çekimi sürüyor…" });
  assert.equal(m.integrationStatus({ status: "failed" }).label, "Bağlantı sorunu");
  assert.equal(m.integrationStatus({ status: "failed" }).reconnect, true);
  assert.equal(m.integrationStatus({ status: "pending" }).label, "Kurulum bekliyor");
});

console.log(`\n${n} test geçti`);
