// Birim testi: src/expense-kinds.ts — Dalga 3 (P3.3): gider türleri. Banka gideri / vergi-SGK (kasadan çıkış, POST /kinds/{kind}),
// hızlı fiş (elle alış hattı entry_mode=quick; listeden seçilen tedarikçi party_id ile; toplam kuruşla karşılaştırılır), parasut_warning.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/expense-kinds.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("kuruş: '100' = '100.00' = 10000; geçersiz null", () => {
  assert.equal(m.toKurus("100"), 10000); assert.equal(m.toKurus("100.5"), 10050); assert.equal(m.toKurus("1,5"), null); assert.equal(m.toKurus(""), null);
});
t("tedarikçi: aynı ad tek kayıtsa kimlik; birden çoksa tahmin yok", () => {
  const s = [{ id: "s1", name: "Kargo A.Ş." }, { id: "s2", name: "Ofis" }, { id: "s3", name: "ofis" }];
  assert.deepEqual(m.matchSupplier(s, " kargo  a.ş. "), { id: "s1", ambiguous: false });
  assert.deepEqual(m.matchSupplier(s, "Ofis"), { id: "", ambiguous: true });
  assert.deepEqual(m.matchSupplier(s, "Yeni"), { id: "", ambiguous: false });
});
const base = { documentName: "", supplierName: "", supplierPartyId: "", documentNumber: "", issueDate: "2026-11-16", total: "1.250,50", vatRate: "20", dueDate: "",
  categoryId: "", spenderId: "", receiptId: "", paymentState: "payable", paymentAccountId: "", paymentDate: "" };
t("hızlı fiş gövdesi: entry_mode quick, toplam metin, KDV oranı; tedarikçi kimlikle ya da adla", () => {
  const b = m.quickBody({ ...base, supplierName: "Kargo A.Ş.", supplierPartyId: "s1", spenderId: "u2", receiptId: "rf-1" }).body;
  assert.deepEqual(b, { entry_mode: "quick", issue_date: "2026-11-16", total: "1250.50", vat_rate: "20", currency: "TRY", supplier: { party_id: "s1" }, spender_user_id: "u2", receipt_file_id: "rf-1" });
  assert.deepEqual(m.quickBody({ ...base, supplierName: " Yeni Büfe " }).body.supplier, { name: "Yeni Büfe" });
  assert.equal(m.quickBody({ ...base }).body.supplier, undefined);
});
t("hızlı fiş: eksikler; ödendi hesap ve tarih ister; vade yalnız ödenecekte", () => {
  assert.deepEqual(m.quickBody({ ...base, total: "0" }).problems, ["total"]);
  assert.deepEqual(m.quickBody({ ...base, issueDate: "" }).problems, ["issueDate"]);
  assert.deepEqual(m.quickBody({ ...base, dueDate: "2026-11-01" }).problems, ["dueDate"]);
  assert.equal(m.quickBody({ ...base, paymentState: "paid" }).paymentIncomplete, true);
  const p = m.quickBody({ ...base, paymentState: "paid", paymentAccountId: "a1", paymentDate: "2026-11-16", dueDate: "2026-12-01" });
  assert.equal(p.body.payment_state, "paid"); assert.equal(p.body.payment_account_id, "a1"); assert.equal(p.body.due_date, undefined);
  assert.equal(m.quickBody({ ...base, dueDate: "2026-12-01" }).body.due_date, "2026-12-01");
});
t("sunucu toplamı girilenden farklıysa uyarı (kuruşla)", () => {
  assert.equal(m.totalDiffers("1250.50", "1250.5"), false);
  assert.equal(m.totalDiffers("1250.49", "1250.50"), true);
});
t("banka gideri / vergi-SGK gövdesi: ödendiği hesap zorunlu, vergi türü ve dönemi", () => {
  assert.deepEqual(m.cashKindBody("bank_fee", { amount: "15,90", date: "16.11.2026", accountId: "a2", name: " EFT masrafı ", categoryId: "" }).body,
    { amount: "15.90", entry_date: "2026-11-16", account_id: "a2", payment_state: "paid", document_name: "EFT masrafı" });
  assert.equal(m.cashKindBody("bank_fee", { amount: "15", date: "2026-11-16", accountId: "" }).error, "Ödemenin yapıldığı kasa ya da banka hesabını seçin.");
  assert.equal(m.cashKindBody("tax_payment", { amount: "15", date: "2026-11-16", accountId: "a1", taxType: "", taxPeriod: "2026-10" }).error, "Vergi türünü seçin.");
  assert.equal(m.cashKindBody("tax_payment", { amount: "15", date: "2026-11-16", accountId: "a1", taxType: "kdv", taxPeriod: "" }).error, "Vergi dönemini (ay ve yıl) seçin.");
  assert.deepEqual(m.cashKindBody("tax_payment", { amount: "1000", date: "2026-11-16", accountId: "a1", taxType: "kdv", taxPeriod: "2026-10" }).body,
    { amount: "1000.00", entry_date: "2026-11-16", account_id: "a1", payment_state: "paid", tax_type: "kdv", tax_period: "2026-10" });
  assert.equal(m.cashKindBody("bank_fee", { amount: "0", date: "2026-11-16", accountId: "a1" }).error, "Sıfırdan büyük bir tutar girin.");
});
t("vergi dönemi seçenekleri: son 12 ay, yeni önce", () => {
  const p = m.taxPeriods("2026-11-16");
  assert.equal(p.length, 12); assert.deepEqual(p[0], { value: "2026-10", label: "Ekim 2026" }); assert.deepEqual(p[11], { value: "2025-11", label: "Kasım 2025" });
});
t("parasut_warning: kayıt başarılı, uyarı ayrı ve olduğu gibi", () => {
  assert.equal(m.warningOf({ parasut_warning: "Bu kayıt Paraşüt'e aktarılmadı." }), "Bu kayıt Paraşüt'e aktarılmadı.");
  assert.equal(m.warningOf({ result: { parasut_warning: "X" } }), "X");
  assert.equal(m.warningOf({}), null);
  assert.deepEqual(m.KIND_MENU.map((k) => k.key), ["quick_receipt", "purchase_invoice", "bank_fee", "tax_payment", "expense_voucher"]);
});

console.log(`\n${n} test geçti`);
