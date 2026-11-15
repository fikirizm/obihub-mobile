// Birim testi: src/api-iceri-al.ts — İçeri Al 2 (docs/pm/tasarim/iceri-al-2.md; Kıyas 2 hızlı gider; web model.js, KabulKapisi, GiderFormu, PaymentStatusField).
// Çalıştırma: node dev/test-iceri-al-2.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
let src = readFileSync(join(here, "../frontend/src/api-iceri-al.ts"), "utf8");
src = src.replace(/import \{ request \} from "\.\/api";/, "const request = async () => { throw new Error('ağ yok'); };");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const args = (over = {}) => ({ ...m.INITIAL_ARGS, ...over, form: { ...m.EMPTY_FORM, ...(over.form || {}) } });

t("Hayır = hızlı gider: quick_expense yalnız gider modunda ve true iken", () => {
  assert.equal(m.importPayload(args({ quickExpense: true }), false).quick_expense, true);
  assert.ok(!("quick_expense" in m.importPayload(args({ quickExpense: false }), false)));
  assert.ok(!("quick_expense" in m.importPayload(args({ quickExpense: true, mode: "expense_and_stock" }), false)));
  assert.equal(m.answerArgs(m.INITIAL_ARGS, { lines: [{}] }, "no").quickExpense, true);
  assert.equal(m.answerArgs(m.INITIAL_ARGS, { lines: [{}] }, "yes").quickExpense, false);
});
t("Ödendi: hesap + tarih tamamsa gönderilir; eksikse önizleme Ödenecek gibi; çalışan cebinden olduğu gibi", () => {
  const paid = m.importPayload(args({ form: { payment_state: "paid", payment_account_id: "acc-kasa", payment_date: "2026-11-15" } }), true);
  assert.equal(paid.payment_state, "paid");
  assert.equal(paid.payment_account_id, "acc-kasa");
  assert.equal(paid.payment_date, "2026-11-15");
  const half = m.importPayload(args({ form: { payment_state: "paid", payment_account_id: null, payment_date: "2026-11-15" } }), true);
  assert.equal(half.payment_state, "payable");
  assert.ok(!("payment_account_id" in half));
  assert.equal(m.importPayload(args(), true).payment_state, "payable");
  assert.ok(!("payment_state" in m.importPayload(args(), false)));
  assert.equal(m.paymentMissing({ payment_state: "paid", payment_account_id: "a", payment_date: null }), true);
  assert.equal(m.paymentMissing({ payment_state: "paid", payment_account_id: "a", payment_date: "2026-11-15" }), false);
  assert.equal(m.paymentMissing({ payment_state: "payable" }), false);
});
t("ödeme seçenekleri: sunucu payment_options.states esas; yoksa yedek liste (çalışan cebinden kapalı + gerekçe)", () => {
  const s = m.paymentStates({ payment_options: { states: [{ id: "payable", label: "Ödenecek", available: true }, { id: "paid", label: "Ödendi", available: false, reason: "Kapalı." }] } });
  assert.deepEqual(s.map((x) => [x.id, x.available, x.reason || null]), [["payable", true, null], ["paid", false, "Kapalı."]]);
  const f = m.paymentStates(null);
  assert.deepEqual(f.map((x) => x.id), ["payable", "paid", "employee"]);
  assert.equal(f[2].available, false);
  assert.match(f[2].reason, /çalışan kartları eklenince/);
});
t("kalem iskontosu: '%25,00 · −227,27 ₺'; oran yoksa yalnız tutar; yoksa null", () => {
  assert.equal(m.discountText({ discount: "227.27", discount_rate: "25.00" }), "%25,00 · −227,27 ₺");
  assert.equal(m.discountText({ discount: "1227.5", discount_rate: null }), "−1.227,50 ₺");
  assert.equal(m.discountText({ discount: "0.00", discount_rate: "0" }), null);
  assert.equal(m.discountText({}), null);
});
t("KDV dahil fiyat notu", () => {
  assert.equal(m.vatIncludedNote({ price_includes_vat: true, document_unit_price: "1000.00" }), "Faturada KDV dahil 1.000,00 ₺");
  assert.equal(m.vatIncludedNote({ price_includes_vat: false, document_unit_price: "1000.00" }), null);
});
t("kabul kapısı kodları", () => {
  assert.equal(m.acceptGate("ACCEPT_REQUIRED").kind, "accept");
  assert.equal(m.acceptGate("ACCEPT_REQUIRED").title, "Önce faturayı kabul edin");
  assert.equal(m.acceptGate("ACCEPT_PENDING").kind, "pending");
  assert.equal(m.acceptGate("ACCEPT_PENDING").title, "Kabul işleniyor");
  assert.equal(m.acceptGate("DOCUMENT_REJECTED").kind, "rejected");
  assert.equal(m.acceptGate("LEGACY_RECORD_EXISTS"), null);
  assert.equal(m.acceptGate(undefined), null);
});
t("onay sonucu ödeme bölümü: recorded / pending / failed metinleri", () => {
  const o = m.confirmOutcome({ status: "APPLIED", detail: "Fatura giderlere işlendi.", payment: { status: "recorded", payment: { account_name: "Merkez Kasa", amount: "271.00" } } });
  assert.equal(o.payment.status, "recorded");
  assert.equal(m.paymentResultText(o.payment), "Fatura kaydedildi ve ödendi (Merkez Kasa).");
  assert.equal(m.paymentResultText({ status: "pending", detail: null }), "Ödeme, içeri alma tamamlanınca kaydedilecek.");
  assert.equal(m.paymentResultText({ status: "failed", detail: "Hesap silinmiş. Fatura kaydedildi; ödemeyi Gider Faturaları'ndan \"Ödeme ekle\" ile girebilirsiniz." }), "Hesap silinmiş. Fatura kaydedildi; ödemeyi Gider Faturaları'ndan \"Ödeme ekle\" ile girebilirsiniz.");
  assert.match(m.paymentResultText({ status: "failed", detail: null }), /Ödeme ekle/);
  assert.equal(m.confirmOutcome({ status: "APPLIED", payment: { status: "none" } }).payment, null);
  assert.equal(m.statusOutcome({ status: "applied", payment: { status: "recorded", payment: { account_name: "Banka" } } }).payment.accountName, "Banka");
});
t("hızlı gider notu (document.quick_expense + totals_basis=document)", () => {
  assert.equal(m.quickExpenseNotice({ quick_expense: true, totals_basis: "document" }), "Tutarlar ve KDV fatura toplamlarından alındı; kalemler yalnız bilgi içindir.");
  assert.equal(m.quickExpenseNotice({ quick_expense: true, totals_basis: "lines" }), null);
});
t("hatırlansın planı: yeni kart sayısı notu (kartlar kayıtta açılır)", () => {
  assert.equal(m.plannedNotice(2), "2 yeni ürün kartı faturayı kaydettiğinizde açılır.");
  assert.equal(m.plannedNotice(0), null);
});
t("elle alış: ödeme alanları yalnız Ödendi tamamsa gövdeye girer (taslağa saklanır)", () => {
  assert.deepEqual(m.manualPaymentFields({ payment_state: "paid", payment_account_id: "a1", payment_date: "2026-11-15" }), { payment_state: "paid", payment_account_id: "a1", payment_date: "2026-11-15" });
  assert.deepEqual(m.manualPaymentFields({ payment_state: "paid", payment_account_id: null, payment_date: "2026-11-15" }), {});
  assert.deepEqual(m.manualPaymentFields({ payment_state: "payable" }), {});
});

console.log(`\n${n} test geçti`);
