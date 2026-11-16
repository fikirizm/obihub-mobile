// Birim testi: src/recurring.ts — Dalga 5a (P5.2): tekrarlayan belgeler listesi (plan metni, durum, dönem kaydı), sipariş iade talebi rozeti.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/recurring.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("plan metni (web scheduleText ile aynı)", () => {
  assert.equal(m.scheduleText({ frequency: "monthly", every: 1, start_date: "2026-11-16" }), "Her ay, ayın 16. günü");
  assert.equal(m.scheduleText({ frequency: "monthly", every: 2, start_date: "2026-01-31", day: 31 }), "2 ayda bir, ayın 31. günü (kısa aylarda son gün)");
  assert.equal(m.scheduleText({ frequency: "weekly", every: 1, start_date: "2026-11-16" }), "Her hafta Pazartesi");
  assert.equal(m.scheduleText({ frequency: "weekly", every: 2, start_date: "2026-11-16" }), "2 haftada bir Pazartesi");
  assert.equal(m.scheduleText({ frequency: "yearly", every: 1, start_date: "2026-11-16" }), "Her yıl, 16 Kasım");
  assert.equal(m.scheduleText({}), "—");
});
t("durum ve eylemler: etkin → durdur, durdurulmuş → sürdür, tamamlanmış → yok", () => {
  assert.deepEqual(m.planStatus({ status: "active" }), { label: "Etkin", kind: "success", action: "pause" });
  assert.deepEqual(m.planStatus({ status: "paused" }), { label: "Durduruldu", kind: "warning", action: "resume" });
  assert.deepEqual(m.planStatus({ status: "ended" }), { label: "Tamamlandı", kind: "neutral", action: null });
});
t("dönem kaydı metni ve özet satırı", () => {
  assert.equal(m.runText({ ref_type: "sales_invoice", issued: true, ref_number: "OBI1" }), "Fatura kesildi · OBI1");
  assert.equal(m.runText({ ref_type: "expense_draft" }), "Gider taslağı");
  assert.equal(m.summaryLine({ summary: { customer_name: "Elif", source_number: "OBI9" } }), "Elif · Şablon OBI9");
});
t("sipariş iade talebi rozeti", () => {
  assert.deepEqual(m.returnBadge({ return_request: { state: "requested", label: "İade talebi", reason: "Beden uymadı" } }), { label: "İade talebi", kind: "warning", reason: "Beden uymadı" });
  assert.equal(m.returnBadge({ return_request: { state: "approved", label: "İade onaylandı" } }).kind, "info");
  assert.equal(m.returnBadge({ return_request: { state: "rejected", label: "İade reddedildi" } }).kind, "neutral");
  assert.equal(m.returnBadge({}), null);
});

console.log(`\n${n} test geçti`);
