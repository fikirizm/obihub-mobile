// Birim testi: src/delete-guard.ts — gider faturası silme/arşiv ("Kayıt silinemiyor ve arşivlenemiyor"; backend document_delete_guard.py).
// Çalıştırma: node dev/test-delete-guard.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/delete-guard.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("uç yolları", () => {
  assert.equal(m.checkPath("obihub:e 1", "delete"), "/accounting/expense-invoices/obihub%3Ae%201/delete-check?action=delete");
  assert.equal(m.checkPath("x", "archive"), "/accounting/expense-invoices/x/delete-check?action=archive");
  assert.equal(m.actionPath("x", "archive"), "/accounting/expense-invoices/x/archive");
  assert.equal(m.actionPath("x", "unarchive"), "/accounting/expense-invoices/x/unarchive");
  assert.equal(m.actionPath("x", "delete"), "/accounting/expense-invoices/x");
});

const blocked = {
  allowed: false, action: "delete", code: "DELETE_BLOCKED", title: "Kayıt silinemiyor ve arşivlenemiyor", detail: "Aşağıdaki nedenler giderilmeli.",
  reasons: [
    { code: "PAYMENTS_EXIST", message: "Faturaya ödeme bağlı.", action: { label: "Ödemeleri gör", kind: "payments", ref: "pay:1" } },
    { code: "RELATED_DOCUMENTS", message: "e-Fatura eşleşmesi var.", action: { label: "Gelen e-Faturalar", kind: "incoming_inbox", href: "/gelen-efatura?x=1" } },
    { code: "PARASUT_RECORD", message: "Paraşüt'te kayıtlı.", action: null },
    { code: "ODD", message: "Bilinmeyen eylem", action: { label: "Aç", kind: "weird", href: "https://kotu.example" } },
  ],
  warnings: [], confirm: null,
};
t("doğrulama: allowed boolean değilse geçersiz", () => {
  assert.equal(m.verdictOf({ allowed: "yes" }), null);
  assert.equal(m.verdictOf(null), null);
  assert.equal(m.verdictOf(blocked).allowed, false);
});
t("engel: başlık, açıklama, tüm sebepler; eylemler mobil rotaya çevrilir, bilinmeyen eylem düğmesiz", () => {
  const v = m.dialogModel(blocked, "delete");
  assert.equal(v.mode, "blocked");
  assert.equal(v.title, "Kayıt silinemiyor ve arşivlenemiyor");
  assert.equal(v.detail, "Aşağıdaki nedenler giderilmeli.");
  assert.deepEqual(v.reasons.map((r) => r.code), ["PAYMENTS_EXIST", "RELATED_DOCUMENTS", "PARASUT_RECORD", "ODD"]);
  assert.deepEqual(v.reasons[0].target, { label: "Ödemeleri gör", pathname: "/expenses/pay", params: { ref: "pay:1" } });
  assert.deepEqual(v.reasons[1].target, { label: "Gelen e-Faturalar", pathname: "/incoming", params: {} });
  assert.equal(v.reasons[2].target, null);
  assert.equal(v.reasons[3].target, null);
});
t("pay eylemi ref yoksa faturanın borç ref'i", () => {
  const v = m.dialogModel({ allowed: false, reasons: [{ code: "OPEN_BALANCE", message: "Açık bakiye var.", action: { label: "Öde", kind: "pay" } }] }, "archive", "payable:9");
  assert.deepEqual(v.reasons[0].target, { label: "Öde", pathname: "/expenses/pay", params: { ref: "payable:9" } });
  assert.equal(v.title, "Kayıt silinemiyor ve arşivlenemiyor");
});
t("onay: sunucu metni ya da yedek; silmede kırmızı düğme; uyarılar madde", () => {
  const v = m.dialogModel({ allowed: true, reasons: [], warnings: [{ code: "E_INVOICE_LINKED", message: "Gelen e-Faturalar'a döner." }], confirm: { title: "Fatura silinsin mi?", message: "Stok ve borç geri alınır.", button: "Sil" } }, "delete");
  assert.deepEqual([v.mode, v.title, v.message, v.button, v.destructive], ["confirm", "Fatura silinsin mi?", "Stok ve borç geri alınır.", "Sil", true]);
  assert.deepEqual(v.warnings, ["Gelen e-Faturalar'a döner."]);
  const a = m.dialogModel({ allowed: true, confirm: null }, "archive");
  assert.deepEqual([a.title, a.button, a.destructive], ["Fatura arşivlensin mi?", "Faturayı arşivle", false]);
});
t("409 sonrası kontrol yine izin verirse onay döngüsü yok, 'hâlâ işleniyor'", () => {
  assert.equal(m.STILL_PROCESSING, "Fatura kaydı hâlâ işleniyor. Kayıt değişmedi; birkaç dakika sonra yeniden deneyin.");
  assert.equal(m.after409({ allowed: true }), "processing");
  assert.equal(m.after409({ allowed: false }), "blocked");
  assert.equal(m.after409(null), "error");
});
t("metinler: kontrol hatası, bitti, işlem hatası", () => {
  assert.equal(m.checkErrorText({ status: 404 }), "Bu kayıt bulunamadı; zaten silinmiş olabilir.");
  assert.equal(m.checkErrorText({ status: 500, message: "Sunucu hatası (500)" }), "Şu anda kontrol edilemedi. Kayıt değişmedi; biraz sonra yeniden deneyin.");
  assert.equal(m.doneText("archive"), "Fatura arşivlendi.");
  assert.equal(m.doneText("delete"), "Fatura silindi; stok ve tedarikçi bakiyesi geri alındı.");
  assert.equal(m.runErrorText({ status: 500, message: "" }, "delete"), "Fatura silinemedi. Kayıt değişmedi.");
  assert.equal(m.runErrorText({ status: 422, message: "Özel." }, "archive"), "Özel.");
});

console.log(`\n${n} test geçti`);
