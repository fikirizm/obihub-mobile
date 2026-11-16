// Birim testi: src/cheques.ts — Dalga 3 (P3.1): çekle tahsilat kasaya girmez; POST /cheques/receive, çek listesi ve eylemleri.
// Çalıştırma: node dev/test-cheques.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/cheques.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("çek yöntemi: cek / çek / Çek", () => {
  for (const v of ["cek", "çek", "Çek", "CEK"]) assert.equal(m.isChequeMethod(v), true, v);
  assert.equal(m.isChequeMethod("nakit"), false);
});
t("tahsilat yöntemleri: çek kasa yöntemi değil; düzenlemede yalnız eski satır çekliyse kalır", () => {
  const list = [{ value: "nakit", label: "Nakit" }, { value: "cek", label: "Çek" }, { value: "havale", label: "Havale" }];
  assert.deepEqual(m.cashMethods(list).map((x) => x.value), ["nakit", "havale"]);
  assert.deepEqual(m.editMethods(list, "nakit").map((x) => x.value), ["nakit", "havale"]);
  assert.deepEqual(m.editMethods(list, "cek").map((x) => x.value), ["nakit", "cek", "havale"]);
});
t("çek alma gövdesi: fatura ya da cari, tutar, vade zorunlu; boş alanlar gönderilmez", () => {
  assert.equal(m.receiveBody({ invoiceId: "li1", amount: "0", dueDate: "2026-12-01" }).error, "Çek tutarını girin.");
  assert.equal(m.receiveBody({ invoiceId: "li1", amount: "100", dueDate: "" }).error, "Çekin vade tarihini girin.");
  assert.equal(m.receiveBody({ amount: "100", dueDate: "2026-12-01" }).error, "Çekin hangi faturaya ya da cariye ait olduğunu seçin.");
  assert.deepEqual(m.receiveBody({ invoiceId: "li1", amount: "1.250,50", dueDate: "01.12.2026", chequeNo: " 123 ", bankName: "", drawer: "Ali", note: "", date: "2026-11-16" }).body,
    { invoice_id: "li1", amount: "1250.50", due_date: "2026-12-01", cheque_no: "123", drawer: "Ali", date: "2026-11-16" });
  assert.deepEqual(m.receiveBody({ customerId: "c1", amount: "10", dueDate: "2026-12-01" }).body, { customer_id: "c1", amount: "10.00", due_date: "2026-12-01" });
});
t("çek alma: dağıtım toplamı çek tutarına eşit olmalı (kuruşla)", () => {
  const ok = m.receiveBody({ customerId: "c1", amount: "300", dueDate: "2026-12-01", allocations: [{ invoice_id: "a", amount: "100.10" }, { invoice_id: "b", amount: "199.90" }] });
  assert.deepEqual(ok.body.allocations, [{ invoice_id: "a", amount: "100.10" }, { invoice_id: "b", amount: "199.90" }]);
  assert.match(m.receiveBody({ customerId: "c1", amount: "300", dueDate: "2026-12-01", allocations: [{ invoice_id: "a", amount: "100" }] }).error, /eşit/);
});
t("çekli tahsilat satırı salt okunur", () => {
  assert.equal(m.isChequeRow({ source: "cheque" }), true);
  assert.equal(m.isChequeRow({ method: "cek" }), false);
  assert.match(m.chequeErrorText({ code: "COLLECTION_IS_CHEQUE" }), /Çekler/);
  assert.match(m.chequeErrorText({ code: "CHEQUE_USE_CHEQUES" }), /Çekler/);
  assert.equal(m.chequeErrorText({ code: "CHEQUE_STATE", message: "Sunucu metni." }), "Sunucu metni.");
});
t("liste: süzgeçler, vade metni, para birimi başına toplam (asla tek sayı)", () => {
  assert.deepEqual(m.FILTERS.received.map((f) => f[0]), ["", "portfoy", "due_soon", "tahsil_edildi", "ciro_edildi", "karsiliksiz", "iade_edildi"]);
  assert.deepEqual(m.FILTERS.issued.map((f) => f[0]), ["", "verildi", "due_soon", "odendi"]);
  assert.equal(m.chequesPath("received", "portfoy"), "/cheques?direction=received&status=portfoy");
  assert.equal(m.chequesPath("issued", ""), "/cheques?direction=issued");
  assert.equal(m.dueText({ due_state: "x", days_to_due: -3 }), "3 gün gecikti");
  assert.equal(m.dueText({ due_state: "x", days_to_due: 0 }), "Bugün vadesi geliyor");
  assert.equal(m.dueText({ due_state: "x", days_to_due: 1 }), "Yarın vadesi geliyor");
  assert.equal(m.dueText({ due_state: "x", days_to_due: 9 }), "9 gün sonra");
  assert.deepEqual(m.totalsOf([{ currency: "USD", amount: "10.00", count: 1 }, { currency: "TRY", amount: "36.00", count: 2 }]),
    { lines: [{ currency: "TRY", amount: 36 }, { currency: "USD", amount: 10 }], count: 3 });
});
t("eylemler: sunucunun actions'ı; ayrılmış (detached) çekte yalnız Sil", () => {
  assert.deepEqual(m.chequeActions({ actions: { collect: true, endorse: true, return: true, pay: false, delete: true, receipt: true } }),
    ["collect", "endorse", "return", "receipt", "delete"]);
  assert.deepEqual(m.chequeActions({ detached: true, actions: { collect: true, delete: true } }), ["delete"]);
  assert.deepEqual(m.chequeActions({ actions: { pay: true, delete: true } }), ["pay", "delete"]);
});
t("okuma hatası metni", () => {
  assert.match(m.readError({ status: 403 }), /yetkiniz yok/);
  assert.match(m.readError({ status: 500 }), /okunamadı/);
});

console.log(`\n${n} test geçti`);
