// Birim testi: src/employees.ts (P5.3 Çalışanlar). Sunucu: backend/employees.py + routers/employees.py — kart (ad, görev, e-posta,
// telefon, IBAN, not), bakiye {amount, direction: we_owe|they_owe|none}, ekstre, işlem {kind: advance|salary|bonus|payment, amount,
// date, account_id (TL), note ≤200, period YYYY-AA yalnız maaş/prim} + Idempotency-Key zorunlu, DELETE ters kayıt, archive|unarchive.
// Web: pages/EmployeesPage.jsx. Çalıştırma: node dev/test-employees.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/employees.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("bakiye metni yönüyle", () => {
  assert.deepEqual(m.balanceView({ amount: "1500.00", direction: "we_owe" }), { text: "Çalışana borcunuz ₺1.500,00", tone: "error" });
  assert.deepEqual(m.balanceView({ amount: "200.00", direction: "they_owe" }), { text: "Çalışandan alacağınız ₺200,00", tone: "success" });
  assert.deepEqual(m.balanceView({ amount: "0.00", direction: "none" }), { text: "Bakiye yok", tone: "neutral" });
  assert.equal(m.summaryText({ count: 3, we_owe: "1500.00", they_owe: "200.00" }), "3 çalışan · borcunuz ₺1.500,00 · alacağınız ₺200,00");
});
t("kart formu: ad zorunlu, IBAN TR26, e-posta; boş alanlar gövdeye boş dize", () => {
  assert.equal(m.validateEmployee({ name: " " }).name, "Çalışanın adını girin.");
  assert.equal(m.validateEmployee({ name: "x".repeat(121) }).name, "Ad en çok 120 karakter olabilir.");
  assert.match(m.validateEmployee({ name: "Ali", iban: "TR12" }).iban, /26 karakter/);
  assert.equal(m.validateEmployee({ name: "Ali", iban: "tr33 0006 1005 1978 6457 8413 26" }).iban, undefined);
  assert.equal(m.validateEmployee({ name: "Ali", email: "ali@" }).email, "E-posta adresi geçersiz.");
  assert.deepEqual(m.employeeBody({ name: " Ali  Kaya ", title: "Kasiyer", email: "", phone: "0532 111 22 33", iban: "tr33 0006 1005 1978 6457 8413 26", notes: "" }),
    { name: "Ali Kaya", title: "Kasiyer", email: "", phone: "0532 111 22 33", iban: "TR330006100519786457841326", notes: "" });
});
t("işlem türleri ve dönem yalnız maaş/primde", () => {
  assert.deepEqual(m.KINDS.map((k) => k[0]), ["advance", "salary", "bonus", "payment"]);
  assert.equal(m.periodAllowed("salary"), true);
  assert.equal(m.periodAllowed("advance"), false);
});
t("işlem doğrulama: tutar, hesap, tarih ileri olamaz, dönem biçimi, açıklama 200", () => {
  const ok = { kind: "salary", amount: "15.000,00", account_id: "a1", date: "2026-11-22", period: "2026-11", note: "" };
  assert.deepEqual(m.validateTxn(ok, "2026-11-22"), {});
  assert.match(m.validateTxn({ ...ok, amount: "0" }, "2026-11-22").amount, /tutar/);
  assert.match(m.validateTxn({ ...ok, account_id: "" }, "2026-11-22").account, /hesab/);
  assert.match(m.validateTxn({ ...ok, date: "2026-11-23" }, "2026-11-22").date, /ileri/);
  assert.match(m.validateTxn({ ...ok, period: "2026-13" }, "2026-11-22").period, /YYYY-AA/);
  assert.match(m.validateTxn({ ...ok, note: "x".repeat(201) }, "2026-11-22").note, /200/);
});
t("işlem gövdesi: tutar noktalı; dönem yalnız maaş/primde ve doluysa", () => {
  assert.deepEqual(m.txnBody({ kind: "salary", amount: "15.000,50", account_id: "a1", date: "2026-11-22", period: "2026-11", note: " Kasım " }),
    { kind: "salary", amount: "15000.50", account_id: "a1", date: "2026-11-22", period: "2026-11", note: "Kasım" });
  assert.deepEqual(m.txnBody({ kind: "advance", amount: "500", account_id: "a1", date: "2026-11-22", period: "2026-11", note: "" }),
    { kind: "advance", amount: "500.00", account_id: "a1", date: "2026-11-22" });
});
t("ekstre satırı: yön, ters kayıt, silinebilir, cebinden", () => {
  const r = m.statementRow({ id: "e1", date: "2026-11-20", label: "Maaş", side: "debit", amount: "15000.00", currency: "TRY", kind: "payment", reversed: false, transaction_id: "t1", can_void: true, pocket: false });
  assert.deepEqual(r, { id: "e1", title: "Maaş", sub: "20.11.2026 · Ödeme", amount: "₺15.000,00", reversed: false, canVoid: true, txnId: "t1" });
  assert.equal(m.statementRow({ id: "e2", date: "2026-11-21", label: "Fatura INV-9", side: "credit", amount: "250.00", pocket: true, can_void: false }).sub, "21.11.2026 · Tahakkuk · Cebinden ödeme");
  assert.equal(m.statementRow({ id: "e3", date: "2026-11-21", label: "x", side: "debit", amount: "1", reversed: true, can_void: true, transaction_id: "t" }).canVoid, false);
});
t("hesaplar: yalnız TL kasa/banka", () => {
  assert.deepEqual(m.tlAccounts([{ id: "a", currency: "TRY" }, { id: "b", currency: "USD" }, { id: "c", currency: "" }]).map((a) => a.id), ["a", "c"]);
});
t("hata metni: sunucu detayı; 403", () => {
  assert.equal(m.errorText({ status: 409, code: "EMPLOYEE_BALANCE_OPEN", message: "Bu çalışanın açık bakiyesi var." }), "Bu çalışanın açık bakiyesi var.");
  assert.match(m.errorText({ status: 403 }), /yetkiniz yok/);
  assert.match(m.errorText({}), /Biraz sonra/);
});
console.log(`${n} test geçti`);
