// Birim testi: src/parasut-pay.ts (fatura tahsilatının Paraşüt durumu ve eylemleri; web SalesInvoiceFormOS.ParasutPayState).
// Çalıştırma: node dev/test-parasut-pay.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/parasut-pay.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("durum: parasut_sync_state önce, sonra parasut_synced (false = belirsiz), yoksa none", () => {
  assert.equal(m.parasutPayState({ parasut_sync_state: "failed", parasut_synced: true }), "failed");
  assert.equal(m.parasutPayState({ parasut_synced: true }), "synced");
  assert.equal(m.parasutPayState({ parasut_synced: false }), "uncertain");
  assert.equal(m.parasutPayState({}), "none");
});

const opts = { linked: true, locked: false, canSend: true };
t("Paraşüt'e bağlı olmayan faturada hiçbir şey gösterilmez", () => {
  assert.equal(m.parasutPayView({ parasut_synced: true }, { ...opts, linked: false }), null);
  assert.equal(m.parasutPayView({}, opts), null);
});
t("işlendi ve gönderiliyor: yalnız etiket, eylem yok", () => {
  assert.deepEqual(m.parasutPayView({ parasut_sync_state: "synced" }, opts), { state: "synced", label: "Paraşüt'e işlendi", tone: "good", actions: [] });
  assert.deepEqual(m.parasutPayView({ parasut_sync_state: "syncing" }, opts).actions, []);
});
t("işlenmedi (resmileşmeden önceki tahsilat): yetenek açıksa ve kilit yoksa 'Paraşüt'e gönder'", () => {
  const v = m.parasutPayView({ parasut_sync_state: "not_sent" }, opts);
  assert.equal(v.tone, "warn"); assert.deepEqual(v.actions, ["send"]);
  assert.deepEqual(m.parasutPayView({ parasut_sync_state: "not_sent" }, { ...opts, canSend: false }).actions, []);
  assert.deepEqual(m.parasutPayView({ parasut_sync_state: "not_sent" }, { ...opts, locked: true }).actions, []);
});
t("belirsiz: asla yeniden gönderilmez; yalnız 'işlenmiş' / 'yok' işaretleme", () => {
  const v = m.parasutPayView({ parasut_synced: false }, opts);
  assert.equal(v.state, "uncertain"); assert.deepEqual(v.actions, ["resolve-synced", "resolve-not-synced"]);
  assert.deepEqual(m.parasutPayView({ parasut_synced: false }, { ...opts, canSend: false }).actions, ["resolve-synced", "resolve-not-synced"]);
  assert.deepEqual(m.parasutPayView({ parasut_synced: false }, { ...opts, locked: true }).actions, []);
});
t("kesin hata: 'Yeniden dene' (kilit yoksa); hata metni taşınır", () => {
  const v = m.parasutPayView({ parasut_sync_state: "failed", parasut_sync_error: "Hesap kapalı" }, opts);
  assert.equal(v.tone, "bad"); assert.deepEqual(v.actions, ["retry"]); assert.equal(v.detail, "Hesap kapalı");
  assert.deepEqual(m.parasutPayView({ parasut_sync_state: "failed" }, { ...opts, locked: true }).actions, []);
});
t("düzenlemeden sonra Paraşüt güncellenmedi notu", () => {
  assert.equal(m.parasutPayView({ parasut_sync_state: "synced", parasut_out_of_sync: true }, opts).note, "Paraşüt'teki kayıt güncellenmedi");
});

t("eylem istekleri: yol ve gövde", () => {
  assert.deepEqual(m.parasutActionRequest("i 1", "p1", "send", "77"), { path: "/local-invoices/i%201/payments/p1/parasut-sync", body: { parasut_account_id: "77" } });
  assert.deepEqual(m.parasutActionRequest("i1", "p1", "retry"), { path: "/local-invoices/i1/payments/p1/parasut-sync", body: {} });
  assert.deepEqual(m.parasutActionRequest("i1", "p1", "resolve-synced"), { path: "/local-invoices/i1/payments/p1/parasut-resolve", body: { outcome: "synced" } });
  assert.deepEqual(m.parasutActionRequest("i1", "p1", "resolve-not-synced"), { path: "/local-invoices/i1/payments/p1/parasut-resolve", body: { outcome: "not_synced" } });
});
t("eylem sonucu metni: ok → başarı; ok değilse sunucu hatası ya da varsayılan", () => {
  assert.deepEqual(m.parasutActionResult("send", { ok: true }), { ok: true, text: "Tahsilat Paraşüt'e işlendi" });
  assert.deepEqual(m.parasutActionResult("retry", { ok: false, error: "Paraşüt kapalı" }), { ok: false, text: "Paraşüt kapalı" });
  assert.deepEqual(m.parasutActionResult("resolve-not-synced", { ok: true }), { ok: true, text: "Paraşüt'te yok olarak işaretlendi; yeniden gönderebilirsiniz" });
  assert.deepEqual(m.parasutActionResult("resolve-synced", null), { ok: false, text: "İşaretlenemedi" });
});

t("tahsilat alırken Paraşüt seçeneği: fatura Paraşüt'e bağlı ve yetenek açıksa", () => {
  assert.equal(m.canOfferParasutSync({ parasut_invoice_id: "ps1" }, { payment_sync: true }), true);
  assert.equal(m.canOfferParasutSync({ parasut_invoice_id: "ps1" }, { payment_sync: false }), false);
  assert.equal(m.canOfferParasutSync({}, { payment_sync: true }), false);
});
t("tahsilat gövdesine Paraşüt alanları", () => {
  assert.deepEqual(m.parasutCollectFields("12"), { parasut_sync: true, parasut_account_id: "12" });
  assert.deepEqual(m.parasutCollectFields(null), { parasut_sync: false, parasut_account_id: null });
});
t("tahsilat yanıtı: Paraşüt'e yazılamadıysa uyarı, yazıldıysa birleşik başarı", () => {
  assert.deepEqual(m.collectResultText({ parasut: { ok: false, error: "x" } }), { kind: "info", text: "Tahsilat ObiHub'a kaydedildi, Paraşüt'e yazılamadı: x" });
  assert.deepEqual(m.collectResultText({ parasut: { ok: true } }), { kind: "success", text: "Tahsilat kaydedildi ve Paraşüt'e işlendi" });
  assert.deepEqual(m.collectResultText({ replayed: true }), { kind: "success", text: "Tahsilat zaten kaydedilmişti." });
  assert.deepEqual(m.collectResultText({}), { kind: "success", text: "Tahsilat kaydedildi" });
});

t("Dalga 2: mahsup satırı Paraşüt'e gönderilmez — 'ObiHub'da mahsup · Paraşüt'te yapın'", () => {
  const v = m.parasutPayView({ source: "offset", parasut_sync_state: "local_only" }, { linked: true, locked: false, canSend: true });
  assert.equal(v.label, "ObiHub'da mahsup · Paraşüt'te yapın"); assert.deepEqual(v.actions, []);
});
console.log(`\n${n} test geçti`);
