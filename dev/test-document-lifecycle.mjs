// Birim testi: src/document-lifecycle.ts — D-12 fatura yaşam döngüsü (web lib/documentLifecycle.js + InvoiceLifecycle.jsx).
// Çalıştırma: node dev/test-document-lifecycle.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/document-lifecycle.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("eylemler: sunucunun actions'ı esas; yoksa durumdan türetilir", () => {
  assert.deepEqual(m.lifecycleActions({ status: "gonderildi", actions: { cancel: false, copy: true } }).cancel, false);
  const issued = m.lifecycleActions({ status: "gonderildi", invoice_type: "satis" });
  assert.equal(issued.cancel, true); assert.equal(issued.return, true); assert.equal(issued.edit_amounts, true); assert.equal(issued.edit_meta, true);
  const draft = m.lifecycleActions({ status: "taslak" });
  assert.equal(draft.cancel, false); assert.equal(draft.return, false); assert.equal(draft.edit_amounts, true);
  const cancelled = m.lifecycleActions({ status: "iptal" });
  assert.equal(cancelled.cancel, false); assert.equal(cancelled.edit_meta, false); assert.equal(cancelled.copy, true);
  const mirror = m.lifecycleActions({ status: "gonderildi", read_only: true });
  assert.equal(mirror.cancel, false); assert.equal(mirror.copy, false); assert.equal(mirror.archive, false); assert.equal(mirror.open_in_parasut, true);
  assert.equal(m.lifecycleActions({ status: "gonderildi", source: "parasut_import" }).cancel, false);
  assert.equal(m.lifecycleActions({ status: "gonderildi", invoice_type: "iade" }).return, false);
});
t("hata metinleri: bilinen kod web metni; yoksa sunucu metni; o da yoksa yedek", () => {
  assert.equal(m.lifecycleErrorText({ code: "HAS_PAYMENTS" }), "Bu faturaya tahsilat bağlı. Önce tahsilatı iptal edin ya da faturadan ayırın, sonra faturayı iptal edin.");
  // 16 Kas: ISSUED_AMOUNTS_LOCKED → sunucunun detail'i; yoksa "Resmileşmiş" metni yalnız reason doluysa.
  assert.equal(m.lifecycleErrorText({ code: "ISSUED_AMOUNTS_LOCKED", message: "Fatura Paraşüt'e gönderilmiş." }), "Fatura Paraşüt'e gönderilmiş.");
  assert.equal(m.lifecycleErrorText({ code: "ISSUED_AMOUNTS_LOCKED", message: "Sunucu hatası (409)" }), "Kesilmiş belgede tutar alanları değiştirilemez; iptal ya da iade oluşturun.");
  assert.equal(m.lifecycleErrorText({ code: "ISSUED_AMOUNTS_LOCKED", reason: "officialized" }), "Resmileşmiş fatura değiştirilemez; iptal ya da iade oluşturun.");
  assert.equal(m.lifecycleErrorText({ code: "X", message: "Sunucu açıklaması." }), "Sunucu açıklaması.");
  assert.equal(m.lifecycleErrorText({}, "Olmadı."), "Olmadı.");
});
t("16 Kas: resmileşmemiş kesilmiş fatura Paraşüt gibi düzenlenir ve silinir (sunucu actions esas)", () => {
  const issued = m.lifecycleActions({ status: "gonderildi", invoice_type: "satis" });
  assert.equal(issued.edit_amounts, true); assert.equal(issued.delete, true);
  assert.equal(m.lifecycleActions({ status: "taslak" }).delete, true);
  const paid = m.lifecycleActions({ status: "gonderildi", paid_amount: 10 });
  assert.equal(paid.edit_amounts, false); assert.equal(paid.delete, true); // tahsilatlıyı sunucu INVOICE_HAS_PAYMENTS ile reddeder
  for (const inv of [{ status: "resmilesti" }, { status: "gonderildi", parasut_invoice_id: "9" }, { status: "gonderildi", edoc_state: "done" }, { status: "gonderildi", edoc_state: "pending" },
    { status: "gonderildi", officialize_lock: { at: "x" } }, { status: "gonderildi", source: "parasut_import" }, { status: "gonderildi", read_only: true }, { status: "iptal" }]) {
    const a = m.lifecycleActions(inv);
    assert.equal(a.delete, false, JSON.stringify(inv)); assert.equal(a.edit_amounts, false, JSON.stringify(inv));
  }
  assert.equal(m.lifecycleActions({ status: "gonderildi", invoice_type: "iade" }).delete, false);
  assert.equal(m.lifecycleActions({ status: "taslak", invoice_type: "iade" }).delete, true);
  const srv = m.lifecycleActions({ status: "gonderildi", actions: { delete: false, edit_amounts: false }, has_returns: true });
  assert.equal(srv.delete, false); assert.equal(srv.edit_amounts, false);
});
t("16 Kas: yeni silme/düzenleme hata kodlarının metinleri", () => {
  assert.equal(m.lifecycleErrorText({ code: "INVOICE_HAS_PAYMENTS" }), "Faturaya tahsilat bağlı. Önce faturanın tahsilatlarını silin.");
  assert.match(m.lifecycleErrorText({ code: "INVOICE_OFFICIALIZED" }), /Resmileşmiş fatura silinemez/);
  assert.match(m.lifecycleErrorText({ code: "INVOICE_SENT_TO_PARASUT" }), /Paraşüt'e gönderilmiş/);
  assert.match(m.lifecycleErrorText({ code: "INVOICE_OFFICIALIZING" }), /resmileştiriliyor/);
  assert.match(m.lifecycleErrorText({ code: "INVOICE_OFFICIALIZE_UNCERTAIN" }), /belirsiz/);
  assert.equal(m.lifecycleErrorText({ code: "QUOTE_CONVERTED_LOCKED" }), "Faturaya çevrilmiş teklif değiştirilemez.");
  assert.equal(m.lifecycleErrorText({ code: "INVOICE_NOT_EDITABLE" }), "Bu fatura artık düzenlenemez.");
  assert.match(m.lifecycleErrorText({ code: "HAS_RETURNS" }), /iadesi var/);
});
t("16 Kas: silme onayı taslakta ve kesilmiş faturada farklı", () => {
  assert.match(m.deleteConfirmText({ status: "taslak" }), /Taslak/);
  assert.equal(m.deleteConfirmText({ status: "gonderildi" }), "Fatura silinecek; stok ve cari bakiyesi geri alınır.");
});
t("16 Kas: tutar kilidi notu gerçek nedeni söyler", () => {
  assert.match(m.amountsLockNote({ status: "gonderildi", paid_amount: 5 }), /önce faturanın tahsilatlarını silin/);
  assert.match(m.amountsLockNote({ status: "resmilesti" }), /^Resmileşmiş faturada/);
  assert.match(m.amountsLockNote({ status: "gonderildi", parasut_invoice_id: "1" }), /^Paraşüt'e gönderilmiş/);
  assert.match(m.amountsLockNote({ status: "gonderildi", has_returns: true }), /^İadesi olan/);
  assert.match(m.amountsLockNote({ status: "gonderildi" }), /^Kesilmiş faturada/);
});
t("iptal gerekçesi en az 3 karakter", () => {
  assert.equal(m.cancelReasonProblem(" ab "), "İptal gerekçesi zorunlu (en az 3 karakter).");
  assert.equal(m.cancelReasonProblem("Yanlış müşteri"), null);
});
t("olay etiketleri", () => {
  assert.equal(m.EVENT_LABEL.cancelled, "İptal edildi");
  assert.equal(m.eventLabel({ type: "returned" }), "İade oluşturuldu");
  assert.equal(m.eventLabel({ type: "bilinmeyen", summary: "Özet" }), "Özet");
});
t("iade satırları: yalnız line_key'li kalem; kalan = miktar − iade edilen", () => {
  const rows = m.returnRows([{ line_key: "ln_1", product_name: "A", quantity: 3 }, { line_key: "ln_2", description: "B", quantity: "2" }, { product_name: "Eski", quantity: 1 }], { ln_1: "1", ln_2: "2" });
  assert.deepEqual(rows.rows.map((r) => [r.key, r.total, r.done, r.left]), [["ln_1", 3, 1, 2], ["ln_2", 2, 2, 0]]);
  assert.equal(rows.unkeyed, 1);
});
t("iade gövdesi: virgüllü miktar, kalanı aşamaz, en az bir kalem", () => {
  const rows = m.returnRows([{ line_key: "ln_1", quantity: 3 }, { line_key: "ln_2", quantity: 2 }], {}).rows;
  assert.deepEqual(m.returnLines(rows, { ln_1: "1,5", ln_2: "" }), { lines: [{ source_line_key: "ln_1", quantity: "1.5" }], errors: {}, error: null });
  assert.equal(m.returnLines(rows, { ln_1: "4" }).errors.ln_1, "Kalan miktarı (3) aşıyor.");
  assert.equal(m.returnLines(rows, { ln_1: "abc" }).errors.ln_1, "Geçerli bir miktar girin.");
  assert.equal(m.returnLines(rows, {}).error, "En az bir kalem için iade miktarı girin.");
});
t("kesilmiş faturada bilgi düzenleme: yalnız izinli alanlar (S-4), kırpılmış; vade boşsa null", () => {
  assert.deepEqual(m.metaBody({ document_name: " Kasım ", notes: "Not", order_no: " S-1 ", due_date: "2026-12-14" }), { document_name: "Kasım", notes: "Not", order_no: "S-1", due_date: "2026-12-14" });
  assert.deepEqual(m.metaBody({ document_name: "", notes: "", order_no: "", due_date: "" }), { document_name: "", notes: "", order_no: "", due_date: null });
  assert.equal(m.metaProblem({ due_date: "2026-11-01" }, "2026-11-10"), "Vade, fatura tarihinden önce olamaz.");
  assert.equal(m.metaProblem({ due_date: "" }, "2026-11-10"), null);
});

t("teklif paylaşımı alıcıları: virgül/boşlukla ayrılır; geçersiz adres söylenir", () => {
  assert.deepEqual(m.shareRecipients("a@x.com, b@y.com;c@z.com"), { list: ["a@x.com", "b@y.com", "c@z.com"], error: null });
  assert.equal(m.shareRecipients("").error, "En az bir alıcı e-posta adresi girin.");
  assert.equal(m.shareRecipients("a@x.com yanlis").error, "Geçersiz e-posta adresi: yanlis");
});

t("Dalga 1: e-belge iptali, paylaşım ve resmi PDF metinleri; satış faturası paylaşılır", () => {
  assert.match(m.lifecycleErrorText({ code: "EDOC_CANCEL_NOT_SUPPORTED" }), /iade faturası/);
  assert.match(m.lifecycleErrorText({ code: "EDOC_CANCEL_WINDOW_CLOSED" }), /süresi dolmuş/);
  assert.match(m.lifecycleErrorText({ code: "EDOC_CANCEL_FAILED" }), /hiçbir değişiklik yapılmadı/);
  assert.match(m.lifecycleErrorText({ code: "EDOC_REMOTE_MISSING" }), /bulunamadı/);
  assert.match(m.lifecycleErrorText({ code: "EDOC_NOT_FINAL" }), /kesinleşmedi/);
  assert.match(m.lifecycleErrorText({ code: "PARASUT_NOT_CONNECTED" }), /bağlantı/);
  assert.match(m.lifecycleErrorText({ code: "OFFICIAL_PDF_UNAVAILABLE" }), /Resmi fatura PDF/);
  assert.match(m.lifecycleErrorText({ code: "NOT_ISSUED_FOR_SHARE" }), /Yalnız kesilmiş fatura/);
  assert.match(m.lifecycleErrorText({ code: "EMAIL_NOT_CONFIGURED" }), /PDF olarak/);
  assert.match(m.lifecycleErrorText({ code: "RATE_LIMITED" }), /Saatte en fazla/);
  assert.match(m.lifecycleErrorText({ status: 429, code: "" }), /Saatte en fazla/);
  assert.equal(m.lifecycleActions({ status: "gonderildi", invoice_type: "satis" }).share, true);
  assert.equal(m.lifecycleActions({ status: "taslak", invoice_type: "satis" }).share, false);
  assert.equal(m.lifecycleActions({ status: "iptal", invoice_type: "satis" }).share, false);
  assert.equal(m.lifecycleActions({ status: "gonderildi", actions: { cancel_edoc: true } }).cancel_edoc, true);
  assert.equal(m.lifecycleActions({ status: "gonderildi" }).cancel_edoc, false);
  assert.equal(m.eventLabel({ type: "edoc_cancelled" }), "e-Belge iptal edildi");
  assert.equal(m.edocCancelUncertain({ code: "EDOC_CANCEL_FAILED" }), true);
});
t("Dalga 1: paylaşım önizlemesi formu doldurur; gönderilemiyorsa söylenir", () => {
  assert.deepEqual(m.sharePrefill({ kind: "invoice", to: ["a@example.test"], subject: "Firma · Fatura OBI1", can_send: true, attachment: { official: true } }),
    { to: "a@example.test", subject: "Firma · Fatura OBI1", canSend: true, official: true, kind: "invoice" });
  assert.deepEqual(m.sharePrefill({ kind: "quote", to: [], subject: "", can_send: false }), { to: "", subject: "", canSend: false, official: false, kind: "quote" });
  assert.equal(m.sharePrefill(null).canSend, true);
});
// 24 Kas 2026 (web lib/documentLifecycle.js canSendInvoice / canRetryEdoc): mükerrer e-belge koruması ve e-belge yeniden deneme kapısı.
t("Resmileştir yalnız Paraşüt'e hiç gitmemiş, e-belge süreci başlamamış, kilitsiz faturada", () => {
  assert.equal(m.canSendInvoice({ status: "kesildi" }), true);
  assert.equal(m.canSendInvoice({ status: "kesildi", parasut_invoice_id: "9" }), false);
  assert.equal(m.canSendInvoice({ status: "kesildi", officialize_lock: { at: "x" } }), false);
  assert.equal(m.canSendInvoice({ status: "kesildi", edoc_state: "failed" }), false);
  assert.equal(m.canSendInvoice({ status: "kesildi", edoc_requested: true }), false);
  assert.equal(m.canSendInvoice({ status: "kesildi", edoc_job_id: "j1" }), false);
  assert.equal(m.canSendInvoice({ status: "resmilesti" }), false);
  assert.equal(m.canSendInvoice({ status: "iptal" }), false);
  assert.equal(m.canSendInvoice({ status: "kesildi", source: "parasut_import" }), false);
  assert.equal(m.canSendInvoice({ status: "kesildi", read_only: true }), false);
});
t("E-belgeyi yeniden dene: Paraşüt'te faturası olan, e-belgesi düşmüş, kilitsiz, kesilmiş fatura", () => {
  const ok = { status: "kesildi", parasut_invoice_id: "9", edoc_state: "failed" };
  assert.equal(m.canRetryEdoc(ok), true);
  assert.equal(m.canRetryEdoc({ ...ok, edoc_state: "pending" }), false);
  assert.equal(m.canRetryEdoc({ ...ok, parasut_invoice_id: "" }), false);
  assert.equal(m.canRetryEdoc({ ...ok, officialize_lock: { at: "x" } }), false);
  assert.equal(m.canRetryEdoc({ ...ok, edoc_cancelled_at: "2026-11-20" }), false);
  assert.equal(m.canRetryEdoc({ ...ok, status: "iptal" }), false);
  assert.equal(m.canRetryEdoc({ ...ok, status: "resmilesti" }), false);
  assert.equal(m.canRetryEdoc({ ...ok, source: "parasut_import" }), false);
});

console.log(`\n${n} test geçti`);
