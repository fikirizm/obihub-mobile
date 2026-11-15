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
  assert.equal(issued.cancel, true); assert.equal(issued.return, true); assert.equal(issued.edit_amounts, false); assert.equal(issued.edit_meta, true);
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
  assert.equal(m.lifecycleErrorText({ code: "ISSUED_AMOUNTS_LOCKED" }), "Kesilmiş faturada tutar alanları değiştirilemez. Düzeltme için faturayı iptal edip yenisini oluşturun.");
  assert.equal(m.lifecycleErrorText({ code: "X", message: "Sunucu açıklaması." }), "Sunucu açıklaması.");
  assert.equal(m.lifecycleErrorText({}, "Olmadı."), "Olmadı.");
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

console.log(`\n${n} test geçti`);
