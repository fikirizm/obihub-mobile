// Birim testi: src/collection-actions.ts (Aşama 4 / P11: tahsilat sil / düzenle; cari siparişlerinde fatura durumu).
// Çalıştırma: node dev/test-collection-actions.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/collection-actions.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const err = (status, code, message) => Object.assign(new Error(message || code || "e"), { status, code });

t("yol: cari tahsilatı /customers/{cari}/payments/{id}, fatura tahsilatı /local-invoices/{fatura}/payments/{id}", () => {
  assert.equal(m.collectionPath({ type: "customer", id: "p 1", customer_id: "c1" }), "/customers/c1/payments/p%201");
  assert.equal(m.collectionPath({ type: "invoice", id: "x9", invoice_id: "inv/1", customer_id: "c1" }), "/local-invoices/inv%2F1/payments/x9");
});

t("ekstre satırı: düğmeler yalnız sunucunun actions'ına göre ve collection varsa", () => {
  const c = { type: "customer", id: "p1", amount: "100.00" };
  assert.deepEqual(m.ledgerRowActions({ collection: c, actions: { edit: true, void: true } }), { edit: true, void: true });
  assert.deepEqual(m.ledgerRowActions({ collection: c, actions: { edit: false, void: true } }), { edit: false, void: true });
  assert.equal(m.ledgerRowActions({ collection: c, actions: { edit: false, void: false } }), null);
  assert.equal(m.ledgerRowActions({ collection: null, actions: { edit: true, void: true } }), null);
  assert.equal(m.ledgerRowActions({ collection: c }), null);
  assert.equal(m.ledgerRowActions({ collection: c, actions: { edit: "yes", void: 1 } }), null);
});

t("ekstre tahsilatına cari kimliği eklenir (sunucu göndermezse)", () => {
  const c = m.ledgerCollection({ collection: { type: "customer", id: "p1", amount: "50.00" } }, "c7");
  assert.equal(c.customer_id, "c7");
  const keep = m.ledgerCollection({ collection: { type: "invoice", id: "x", invoice_id: "i1", customer_id: "c2" } }, "c7");
  assert.equal(keep.customer_id, "c2");
});

const inv = { id: "i1", invoice_number: "SF-1", status: "gonderildi", invoice_type: "satis" };
t("fatura tahsilatı: normal satırda düzenle + sil", () => {
  assert.deepEqual(m.invoicePaymentActions(inv, { id: "p1", amount: 10 }), { edit: true, void: true, customerPayment: false });
});
t("fatura tahsilatı: iptal / taslak / teklif / iade / e-belge uyuşmazlığında yalnız sil", () => {
  for (const x of [{ status: "iptal" }, { status: "taslak" }, { invoice_type: "teklif" }, { parasut_item_type: "refund" }, { money_state: "refund" }, { edoc_state: "blocked_mismatch" }]) {
    assert.deepEqual(m.invoicePaymentActions({ ...inv, ...x }, { id: "p1" }), { edit: false, void: true, customerPayment: false }, JSON.stringify(x));
  }
});
t("fatura tahsilatı: cari tahsilatından dağıtılan satır burada silinmez (cariden), kimliksiz ve iptal sürecindeki satıra düğme yok", () => {
  assert.deepEqual(m.invoicePaymentActions(inv, { id: "p1", source: "customer_payment" }), { edit: false, void: false, customerPayment: true });
  assert.equal(m.invoicePaymentActions(inv, { amount: 5 }), null);
  assert.equal(m.invoicePaymentActions(inv, { id: "p1", void_op: "op1" }), null);
});
t("fatura tahsilatından collection: tür, fatura, not, hesap, Paraşüt", () => {
  const c = m.invoicePaymentCollection(inv, { id: "p1", amount: 25.5, date: "2026-11-10", method: "havale", notes: "n", account_id: "a1", parasut_synced: true });
  assert.deepEqual(c, { type: "invoice", id: "p1", invoice_id: "i1", invoice_number: "SF-1", amount: 25.5, date: "2026-11-10", method: "havale", note: "n", account_id: "a1", parasut: true });
  assert.equal(m.invoicePaymentCollection(inv, { id: "p2", parasut_sync_state: "none" }).parasut, false);
  assert.equal(m.invoicePaymentCollection(inv, { id: "p3", parasut_synced: false }).parasut, true);
  assert.equal(m.invoicePaymentCollection(inv, { id: "p4" }).parasut, false);
});

t("düzenleme gövdesi: cari alan adları payment_date / payment_method / note", () => {
  const b = m.collectionEditBody({ type: "customer" }, { amount: "120.50", date: "2026-11-11", method: "kart", note: "x", accountId: "a2" });
  assert.deepEqual(b, { amount: "120.50", payment_date: "2026-11-11", payment_method: "kart", note: "x", account_id: "a2" });
});
t("düzenleme gövdesi: fatura alan adları date / method / notes; hesap boşsa gönderilmez", () => {
  const b = m.collectionEditBody({ type: "invoice" }, { amount: "1.00", date: "2026-11-11", method: "nakit", note: "", accountId: "" });
  assert.deepEqual(b, { amount: "1.00", date: "2026-11-11", method: "nakit", notes: "" });
});
t("yöntem listesi: cari nakit/kart/havale/çek, fatura web'in beşli listesi", () => {
  assert.deepEqual(m.collectionMethods("customer").map((x) => x.value), ["nakit", "kart", "havale", "çek"]);
  assert.deepEqual(m.collectionMethods("invoice").map((x) => x.value), ["nakit", "havale", "kredi_karti", "cek", "diger"]);
});
t("yerinde mi yeniden mi: tutar, tarih ya da hesap değişirse yeniden yazılır", () => {
  const c = { amount: "100.00", date: "2026-11-10T00:00:00", account_id: "a1" };
  assert.equal(m.collectionEditInPlace(c, { amount: "100", date: "2026-11-10", accountId: "a1" }), true);
  assert.equal(m.collectionEditInPlace(c, { amount: "100.01", date: "2026-11-10", accountId: "a1" }), false);
  assert.equal(m.collectionEditInPlace(c, { amount: "100.00", date: "2026-11-09", accountId: "a1" }), false);
  assert.equal(m.collectionEditInPlace(c, { amount: "100.00", date: "2026-11-10", accountId: "a2" }), false);
  assert.equal(m.collectionEditInPlace({ amount: 5, date: "2026-11-10" }, { amount: "5.00", date: "2026-11-10", accountId: "" }), true);
});

t("hata metinleri: P11 kodları kendi metnimizle", () => {
  assert.match(m.collectionErrorText(err(404, "COLLECTION_NOT_FOUND")), /bulunamadı/);
  assert.match(m.collectionErrorText(err(409, "COLLECTION_VOIDED")), /zaten silinmiş/);
  assert.match(m.collectionErrorText(err(409, "COLLECTION_IS_CUSTOMER_PAYMENT")), /cari/i);
  assert.match(m.collectionErrorText(err(409, "PAYMENT_EXCEEDS_REMAINING")), /kalan/);
  assert.match(m.collectionErrorText(err(422, "CURRENCY_MISMATCH")), /para birimi/);
  assert.match(m.collectionErrorText(err(409, "COLLECTION_EDIT_NOT_ALLOWED")), /yalnız silinebilir/);
  for (const code of ["OPERATION_PENDING", "INVOICE_BUSY", "INVOICE_BLOCKED", "COLLECTION_AMOUNT_INCONSISTENT", "COLLECTION_REPLACE_FAILED", "METHOD_INVALID", "ACCOUNT_INACTIVE"]) {
    assert.ok(m.collectionErrorText(err(409, code)).length > 10, code);
  }
});
t("hata metinleri: bilinmeyen kodda sunucunun Türkçe metni, belirsiz sonuçta kilit metni", () => {
  assert.equal(m.collectionErrorText(err(400, "X", "Sunucu metni")), "Sunucu metni");
  assert.match(m.collectionErrorText(err(0)), /kaydedilmiş olabilir/);
  assert.match(m.collectionErrorText(err(500, "MONEY_INCOMPLETE")), /yeniden gönder/i);
});
t("yazım türü: belirsiz (aynı anahtar), bekleyen, yarım, çakışma, ret (yeni anahtar)", () => {
  assert.equal(m.collectionWriteKind(err(0)), "uncertain");
  assert.equal(m.collectionWriteKind(err(502)), "uncertain");
  assert.equal(m.collectionWriteKind(err(500, "MONEY_INCOMPLETE")), "uncertain");
  assert.equal(m.collectionWriteKind(err(500, "MONEY_PENDING")), "pending");
  assert.equal(m.collectionWriteKind(err(409, "OPERATION_PENDING")), "pending");
  assert.equal(m.collectionWriteKind(err(500, "MONEY_PARTIAL")), "partial");
  assert.equal(m.collectionWriteKind(err(409, "IDEMPOTENCY_CONFLICT")), "conflict");
  assert.equal(m.collectionWriteKind(err(409, "COLLECTION_VOIDED")), "rejected");
  assert.equal(m.collectionWriteKind(err(422, "CURRENCY_MISMATCH")), "rejected");
});

t("sonuç uyarıları: warning_texts gösterilir; yalnız kod gelirse Paraşüt metni", () => {
  assert.deepEqual(m.collectionWarnings({ warnings: ["PARASUT_NOT_UPDATED"], warning_texts: ["Sunucu uyarısı"] }), ["Sunucu uyarısı"]);
  assert.match(m.collectionWarnings({ warnings: ["PARASUT_NOT_UPDATED"] })[0], /Paraşüt/);
  assert.deepEqual(m.collectionWarnings({}), []);
  assert.deepEqual(m.collectionWarnings(null), []);
});
t("başarı metni: silme, yerinde düzenleme, yeniden yazma, tekrar", () => {
  assert.match(m.collectionDoneText("void", {}), /silindi/);
  assert.match(m.collectionDoneText("edit", { mode: "in_place" }), /^Tahsilat güncellendi\.$/);
  assert.match(m.collectionDoneText("edit", { mode: "replaced" }), /yenisi yazıldı/);
  assert.match(m.collectionDoneText("void", { replayed: true }), /zaten/);
});
t("silme onay metni web ile aynı", () => {
  assert.equal(m.VOID_TEXT, "Bu tahsilat geri alınır: kasadan düşer, carinin bakiyesi ve faturalar eski hâline döner.");
});

t("cari siparişleri: fatura no, yoksa Paraşüt no, yoksa Faturalanmadı", () => {
  assert.equal(m.orderInvoiceLabel({ invoice_number: "F-100", parasut_invoice_id: "9" }), "F-100");
  assert.equal(m.orderInvoiceLabel({ parasut_invoice_id: 98765 }), "98765");
  assert.equal(m.orderInvoiceLabel({ invoice_number: " ", parasut_invoice_id: null }), null);
  assert.equal(m.orderInvoiceLabel({}), null);
});

t("Ödeme silme (15 Kas): borç ödemesi yolu; sunucunun path'i önceliklidir (/api öneksiz)", () => {
  assert.equal(m.collectionPath({ type: "payable", id: "9f3c", payable_ref: "obihub:inv-123" }), "/accounting/payables/obihub%3Ainv-123/payments/9f3c");
  assert.equal(m.collectionPath({ type: "payable", id: "9f3c", payable_ref: "x", path: "/accounting/payables/obihub:inv-123/payments/9f3c" }), "/accounting/payables/obihub:inv-123/payments/9f3c");
  assert.equal(m.collectionPath({ type: "invoice", id: "op1", invoice_id: "inv1", path: "/api/local-invoices/inv1/payments/op1" }), "/local-invoices/inv1/payments/op1");
});
t("silme onay metni: sunucunun confirm_text'i; yoksa türe göre (borç ödemesi / faturalı / faturasız tahsilat)", () => {
  assert.equal(m.voidConfirmText({ type: "payable", id: "1", confirm_text: "Sunucu metni." }), "Sunucu metni.");
  assert.equal(m.voidConfirmText({ type: "payable", id: "1" }), "Bu ödeme silinecek; fatura tekrar ödenecek duruma geçer.");
  assert.equal(m.voidConfirmText({ type: "invoice", id: "1" }), "Bu tahsilat silinecek; fatura tekrar tahsil edilecek duruma geçer.");
  assert.equal(m.voidConfirmText({ type: "customer", id: "1", invoices: [{ invoice_id: "i1" }] }), "Bu tahsilat silinecek; fatura tekrar tahsil edilecek duruma geçer.");
  assert.equal(m.voidConfirmText({ type: "customer", id: "1", invoices: [] }), "Bu tahsilat silinecek; tutar carinin bakiyesinden düşer.");
  assert.equal(m.voidTitle({ type: "payable" }), "Ödeme silinsin mi?");
  assert.equal(m.voidTitle({ type: "invoice" }), "Tahsilat silinsin mi?");
});
t("ekstre satırı: borç ödemesinde düzenle yok, sil var (sunucu actions)", () => {
  assert.deepEqual(m.ledgerRowActions({ collection: { type: "payable", id: "p" }, actions: { edit: false, void: true } }), { edit: false, void: true });
});
console.log(`\n${n} test geçti`);
