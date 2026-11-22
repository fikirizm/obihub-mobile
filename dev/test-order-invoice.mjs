// Birim testi: src/order-invoice.ts (Faz C4 sipariş faturalandırma). Sözleşme: docs/pm/tasarim/siparis-faturalandirma-mobil-sozlesme.md.
// Fatura önce ObiHub'da kesilir (local_invoice_id, invoice_state); resmileştirme ayrı adım. Web orderModel.invoiceBadge ile aynı tablo.
// Çalıştırma: node dev/test-order-invoice.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/order-invoice.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const base = { status: "pending" };
t("local_invoice_id faturalı sayılır (eski hata: Fatura Oluştur görünüyordu)", () => {
  const s = m.orderInvoiceState({ ...base, local_invoice_id: "li9", invoice_state: "issued" }, "website");
  assert.equal(s.hasInvoice, true);
  assert.equal(s.invoiced, true);
  assert.equal(s.canCreate, false);
  assert.equal(s.canOpen, true);
});
t("rozet ve eylem tablosu", () => {
  const b = (o) => { const x = m.invoiceBadge({ ...base, ...o }); return [x.label, x.tone, x.action]; };
  assert.deepEqual(b({}), ["Fatura bekliyor", "warning", "create"]);
  assert.deepEqual(b({ invoice_error: { code: "X", message: "Müşteri adı yok." } }), ["Fatura hatası", "error", "retry"]);
  assert.equal(m.invoiceBadge({ ...base, invoice_error: { message: "Müşteri adı yok." } }).detail, "Müşteri adı yok.");
  assert.deepEqual(b({ local_invoice_id: "l", invoice_state: "issued" }), ["Kesildi · Resmileşmedi", "info", "officialize"]);
  assert.deepEqual(b({ local_invoice_id: "l", invoice_state: "officializing" }), ["Gönderiliyor", "info", null]);
  assert.deepEqual(b({ local_invoice_id: "l", invoice_state: "official" }), ["Resmileşti", "success", "open"]);
  assert.deepEqual(b({ local_invoice_id: "l", invoice_state: "aktarildi" }), ["BizimHesap'a aktarıldı", "success", "open"]);
  assert.deepEqual(b({ local_invoice_id: "l", invoice_state: "sent" }), ["Paraşüt'te kesildi · e-Belge yok", "info", "open"]);
  assert.deepEqual(b({ local_invoice_id: "l", invoice_state: "cancelled" }), ["Fatura iptal", "neutral", "open"]);
  assert.deepEqual(b({ parasut_invoice_id: "p1" }), ["Paraşüt'te kesildi", "success", "open"]);
  assert.deepEqual(b({ status: "cancelled" }), ["Fatura yok", "neutral", null]);
});
t("iptal edilen fatura + sipariş iptal değil → yeniden faturalandırılabilir", () => {
  const s = m.orderInvoiceState({ ...base, local_invoice_id: "l", invoice_state: "cancelled" }, "website");
  assert.equal(s.canCreate, true);
  assert.equal(m.orderInvoiceState({ status: "cancelled", local_invoice_id: "l", invoice_state: "cancelled" }, "website").canCreate, false);
  assert.equal(m.orderInvoiceState({ ...base, invoice_error: { message: "x" } }, "website").canCreate, true);
});
t("görünen numara: resmî > ObiHub > eski", () => {
  assert.equal(m.displayNumber({ official_number: "GIB1", obihub_invoice_number: "OBI1", invoice_number: "X" }), "GIB1");
  assert.equal(m.displayNumber({ obihub_invoice_number: "OBI1", invoice_number: "X" }), "OBI1");
  assert.equal(m.displayNumber({ invoice_number: "X" }), "X");
  assert.equal(m.displayNumber({}), "");
});
t("açılacak fatura: ObiHub önce, sonra Paraşüt, sonra bağlantı", () => {
  assert.deepEqual(m.openTarget({ local_invoice_id: "l1", parasut_invoice_id: "p1" }), { kind: "local", id: "l1" });
  assert.deepEqual(m.openTarget({ parasut_invoice_id: "p1" }), { kind: "parasut", id: "p1" });
  assert.deepEqual(m.openTarget({ parasut_invoice_url: "https://x" }), { kind: "url", url: "https://x" });
  assert.equal(m.openTarget({}), null);
});
t("mağazaya ilet: pazaryeri + (Paraşüt ya da ObiHub faturası)", () => {
  assert.equal(m.orderInvoiceState({ ...base, local_invoice_id: "l", invoice_state: "official" }, "trendyol").canShare, true);
  assert.equal(m.orderInvoiceState({ ...base, parasut_invoice_id: "p" }, "hepsiburada").canShare, true);
  assert.equal(m.orderInvoiceState({ ...base, local_invoice_id: "l" }, "website").canShare, false);
  assert.equal(m.orderInvoiceState({ ...base }, "trendyol").canShare, false);
});
t("dikkat notu", () => {
  assert.match(m.attentionText({ invoice_attention: "order_cancelled" }), /iptal/);
  assert.match(m.attentionText({ invoice_attention: "order_cancelled_official" }), /resmileşmiş/);
  assert.match(m.attentionText({ invoice_attention: "officialize_failed" }), /Resmileştirme başarısız/);
  assert.equal(m.attentionText({}), "");
});
t("kesim sonucu: başarı, resmileştirme sağlayıcısı yok, sürüyor, hata", () => {
  assert.deepEqual(m.createResult({ success: true, message: "Fatura kesildi.", state: "issued" }), { kind: "success", text: "Fatura kesildi.", connectHref: null });
  const no = m.createResult({ success: true, state: "issued", officialize: { status: "not_available", error: { code: "NO_OFFICIALIZER", message: "Fatura kesildi; resmileştirmek için bağlantı kurun.", action: { href: "/panel/entegrasyonlar" } } } });
  assert.equal(no.kind, "info");
  assert.equal(no.text, "Fatura kesildi; resmileştirmek için bağlantı kurun.");
  assert.equal(no.connectHref, "/panel/entegrasyonlar");
  assert.deepEqual(m.createResult({ success: false, in_progress: true, message: "Sürüyor." }), { kind: "info", text: "Sürüyor.", connectHref: null });
  assert.equal(m.createResult({ success: true, officialize: { status: "failed", error: { code: "E", message: "Paraşüt reddetti." } } }).text, "Fatura kesildi; resmileştirme başarısız: Paraşüt reddetti.");
  assert.equal(m.createResult({ success: false, message: "Olmadı" }).kind, "error");
});
t("hata kodları Türkçe", () => {
  assert.equal(m.invoiceErrorText({ code: "ORDER_CANCELLED" }), "İptal edilmiş sipariş faturalandırılamaz.");
  assert.equal(m.invoiceErrorText({ code: "ORDER_HAS_NO_LINES" }), "Siparişte faturalanacak satır yok.");
  assert.match(m.invoiceErrorText({ code: "ORDER_TOTAL_MISMATCH" }), /fatura kesilmedi/);
  assert.equal(m.invoiceErrorText({ code: "X", message: "Sunucu metni." }), "Sunucu metni.");
  assert.equal(m.shareErrorText({ code: "INVOICE_NOT_OFFICIAL" }), "Fatura henüz resmileşmedi. Önce resmileştirin, sonra mağazaya iletin.");
  assert.match(m.shareErrorText({ code: "PROVIDER_NO_PDF" }), /BizimHesap/);
  assert.match(m.shareErrorText({ code: "PROVIDER_SHARE_NOT_SUPPORTED" }), /Turkcell/);
});
t("kanal fatura ayarı: okuma, yük (auto_officialize yalnız dokunulduysa), etkin değer", () => {
  assert.deepEqual(m.readInvoiceSettings({ obihub_kasa_id: "a1" }), { obihub_kasa_id: "a1", auto_officialize: undefined });
  assert.deepEqual(m.readInvoiceSettings(null), { obihub_kasa_id: "", auto_officialize: undefined });
  assert.deepEqual(m.invoiceSettingsPayload({ obihub_kasa_id: "", auto_officialize: undefined }), { obihub_kasa_id: "" });
  assert.deepEqual(m.invoiceSettingsPayload({ obihub_kasa_id: "a1", auto_officialize: false }), { obihub_kasa_id: "a1", auto_officialize: false });
  assert.equal(m.effectiveAutoOfficialize({ auto_officialize: undefined }, null, {}), false);
  assert.equal(m.effectiveAutoOfficialize({ auto_officialize: undefined }, "parasut", { auto_create_e_document: true }), true);
  assert.equal(m.effectiveAutoOfficialize({ auto_officialize: undefined }, "bizimhesap", {}), true);
  assert.equal(m.effectiveAutoOfficialize({ auto_officialize: undefined }, "turkcell_efatura", {}), false);
  assert.equal(m.effectiveAutoOfficialize({ auto_officialize: false }, "bizimhesap", {}), false);
});
t("tahsilat kasası: yalnız TL, aktif, Paraşüt aynası değil; eski Paraşüt ödeme ayarında uyarı", () => {
  const acc = [{ id: "a", currency: "TRY" }, { id: "b", currency: "USD" }, { id: "c", currency: "TRY", is_active: false }, { id: "d", currency: "TRY", read_only: true }, { id: "e", currency: "TRY", archived: true }];
  assert.deepEqual(m.kasaAccounts(acc).map((a) => a.id), ["a"]);
  assert.equal(m.kasaWarning({ mark_as_paid: true, payment_account_id: "p1", obihub_kasa_id: "" }), "Eski ayarda faturalar Paraşüt hesabına ödendi işaretleniyordu. ObiHub'da tahsil edildi kesilmesi için bir kasa seçin.");
  assert.equal(m.kasaWarning({ mark_as_paid: true, payment_account_id: "p1", obihub_kasa_id: "a" }), "");
  assert.equal(m.kasaErrorText({ code: "CURRENCY_MISMATCH" }), "Tahsilat kasası TL olmalı.");
  assert.equal(m.kasaErrorText({ code: "MIRROR_ACCOUNT_READ_ONLY" }), "Paraşüt'ten gelen hesap seçilemez; ObiHub hesabı seçin.");
  assert.equal(m.kasaErrorText({ code: "ACCOUNT_INACTIVE" }), "Seçilen hesap pasif.");
  assert.equal(m.kasaErrorText({ code: "ACCOUNT_NOT_FOUND" }), "Hesap bulunamadı.");
});
t("Paraşüt tahsilatı: uyarı, düğme ve yeniden deneme sonucu", () => {
  assert.match(m.attentionText({ invoice_attention: "parasut_payment_failed" }), /Paraşüt'e işlenemedi/);
  assert.equal(m.canRetryParasutPayment({ invoice_attention: "parasut_payment_failed", local_invoice_id: "l1" }), true);
  assert.equal(m.canRetryParasutPayment({ invoice_attention: "parasut_payment_failed" }), false);
  assert.equal(m.canRetryParasutPayment({ invoice_attention: "officialize_failed", local_invoice_id: "l1" }), false);
  assert.equal(m.parasutPaymentPath("l 1"), "/local-invoices/l%201/order-parasut-payment");
  assert.deepEqual(m.parasutPaymentResult({ ok: true, state: "synced" }), { kind: "success", text: "Tahsilat Paraşüt'e işlendi." });
  assert.deepEqual(m.parasutPaymentResult({ ok: true, state: "not_applicable", message: "Bu faturada Paraşüt tahsilatı yok." }), { kind: "info", text: "Bu faturada Paraşüt tahsilatı yok." });
  assert.equal(m.parasutPaymentResult({ ok: false, state: "uncertain", message: "Yanıt alınamadı." }).kind, "info");
  assert.match(m.parasutPaymentResult({ ok: false, state: "uncertain" }).text, /Paraşüt'te kontrol/);
  assert.match(m.parasutPaymentResult({ ok: false, state: "busy", code: "BUSY" }).text, /sürüyor/);
  assert.match(m.parasutPaymentResult({ ok: false, state: "failed", code: "PARASUT_ALREADY_PAID" }).text, /zaten ödenmiş/);
  assert.equal(m.parasutPaymentResult({ ok: false, state: "failed", message: "Hesap kapalı." }).text, "Hesap kapalı.");
  assert.equal(m.parasutPaymentResult({ ok: false, state: "failed" }).kind, "error");
});
console.log(`${n} test geçti`);
