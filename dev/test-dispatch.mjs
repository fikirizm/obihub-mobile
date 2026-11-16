// Birim testi: src/dispatch.ts — Dalga 5a (P5.1): irsaliye listesi, durum etiketleri, siparişten/faturadan irsaliye gövdesi,
// seçili irsaliyelerden tek fatura, e-İrsaliye (yalnız onayla; belirsiz sonuçta retry_uncertain).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/dispatch.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("liste yolu: yön, faturalanma, arama, imleç", () => {
  assert.equal(m.listPath({ direction: "out" }), "/dispatch-notes?direction=out&limit=50");
  assert.equal(m.listPath({ direction: "in", status: "not_invoiced", q: " IRS ", cursor: "c1" }), "/dispatch-notes?direction=in&limit=50&status=not_invoiced&q=IRS&cursor=c1");
});
t("durum: faturalanma ve e-İrsaliye etiketleri", () => {
  assert.deepEqual(m.statusBadges({ invoice_status: "invoiced", edoc: { status: "sent" } }).map((b) => b.label), ["Faturalandı", "e-İrsaliye gönderildi"]);
  assert.deepEqual(m.statusBadges({ invoice_status: "not_invoiced", edoc: { status: "none" } }).map((b) => b.label), ["Faturalanmadı"]);
  assert.deepEqual(m.statusBadges({ invoice_status: "not_invoiced", edoc: { status: "uncertain" } }).map((b) => [b.label, b.kind]), [["Faturalanmadı", "neutral"], ["e-İrsaliye sonucu belirsiz", "warning"]]);
  assert.equal(m.statusBadges({ invoice_status: "not_invoiced", edoc: { status: "failed" } })[1].kind, "error");
});
t("eylemler sunucunun bayraklarından", () => {
  assert.deepEqual(m.noteActions({ editable: true, deletable: true, can_invoice: true, can_send_edoc: true, edoc: { status: "none" } }), { remove: true, invoice: true, edoc: true, retryUncertain: false });
  assert.deepEqual(m.noteActions({ edoc: { status: "uncertain" } }), { remove: false, invoice: false, edoc: false, retryUncertain: true });
});
t("ön doldurma → gövde: satırlar korunur, kargo ve tarih; kaynak kimliği", () => {
  const b = m.prefillBody({ direction: "out", party_name: "Elif", customer_id: "c1", issue_date: "2026-11-16", cargo: { carrier: "Aras", tracking_no: "123" }, order_id: "o1",
    lines: [{ product_id: "p1", product_name: "Ürün", quantity: "2", unit: "adet", warehouse_id: "w1" }] }, { tracking: " 999 ", notes: " Kapıya " });
  assert.equal(b.direction, "out"); assert.equal(b.order_id, "o1"); assert.equal(b.cargo.tracking_no, "999"); assert.equal(b.cargo.carrier, "Aras"); assert.equal(b.notes, "Kapıya");
  assert.equal(b.lines.length, 1); assert.equal(b.shipment_method, "cargo");
});
t("tek faturaya: yalnız aynı cari, giden, faturalanabilir", () => {
  const notes = [{ id: "a", party_name: "Elif", direction: "out", can_invoice: true }, { id: "b", party_name: "Elif", direction: "out", can_invoice: true }, { id: "c", party_name: "Can", direction: "out", can_invoice: true }];
  assert.deepEqual(m.invoiceSelection(notes, ["a", "b"]), { ok: true, ids: ["a", "b"], error: null });
  assert.match(m.invoiceSelection(notes, ["a", "c"]).error, /aynı cariye/);
  assert.match(m.invoiceSelection(notes, []).error, /seçin/);
});
t("e-İrsaliye gövdesi ve hata metni", () => {
  assert.deepEqual(m.edocBody(false), { confirm: true });
  assert.deepEqual(m.edocBody(true), { confirm: true, retry_uncertain: true });
  assert.equal(m.dispatchErrorText({ code: "X", message: "Sunucu metni." }), "Sunucu metni.");
  assert.match(m.dispatchErrorText({ code: "DISPATCH_INVOICED" }), /Faturalanmış/);
});

console.log(`\n${n} test geçti`);
