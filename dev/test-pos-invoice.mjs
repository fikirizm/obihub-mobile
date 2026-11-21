// Birim testi: src/pos-invoice.ts (Faz A M3: fişten oluşturulan taslak fatura). Sunucu orchestration/pos_invoice.py ensure_unchanged:
// kalem/miktar/fiyat/vergi/indirim imzası değişirse, stock_mode none dışıysa, tahsilat varsa ya da açık hesapta cari değişirse 409.
// Mobil formu kalemleri net fiyatla yeniden kurar; fişten gelen taslak brüt (price_basis gross) taşır. Bu yüzden kilitli taslakta
// kalemler kayıttaki haliyle (imza alanları) gönderilir. Silme ve faturaya dönüştürme: DELETE /pos/receipts/{id}, POST .../invoice.
// Çalıştırma: node dev/test-pos-invoice.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
async function load(rel) {
  const src = readFileSync(join(here, "../frontend/src", rel), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const m = await load("pos-invoice.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const record = {
  id: "inv1", pos_sale_id: "s1", pos_sale_number: "POS-1", pos_payment_type: "nakit", customer_id: "c1", stock_mode: "none",
  invoice_discount_type: "amount", invoice_discount_value: "8.33", currency: "TRY",
  items: [{ line_key: "i0", kind: "product", product_id: "p1", product_name: "Kupa", quantity: "2", unit: "ADET", unit_price: "83.3333", price_basis: "gross",
    gross_unit_price: "100", vat_rate: 20, discount: null, line_total: 200, vat_amount: 33.33, warehouse_id: "w1" }],
};

t("fişe bağlı satış faturası kilitli; teklif ve fişsiz değil", () => {
  assert.equal(m.isPosLocked(record), true);
  assert.equal(m.isPosLocked({ ...record, pos_sale_id: "" }), false);
  assert.equal(m.isPosLocked(null), false);
});
t("kilitli gövde: kalemler kayıttaki imza alanlarıyla, stok none, belge indirimi kayıttan, tahsilat yok", () => {
  const built = { customer_id: "c2", customer_name: "Yeni", notes: "not", issue_date: "2026-11-21", items: [{ line_key: "i0", unit_price: "83.33", price_basis: "net" }],
    stock_mode: "with_document", invoice_discount_type: "percentage", invoice_discount_value: "5.00", collection: { amount: "1" }, action: "save_draft" };
  const b = m.posLockedBody(built, record);
  assert.deepEqual(b.items, [{ line_key: "i0", kind: "product", product_id: "p1", product_name: "Kupa", quantity: "2", unit: "ADET", unit_price: "83.3333",
    price_basis: "gross", gross_unit_price: "100", vat_rate: 20, discount: null }]);
  assert.equal(b.stock_mode, "none");
  assert.equal(b.invoice_discount_type, "amount"); assert.equal(b.invoice_discount_value, "8.33");
  assert.equal("collection" in b, false);
  assert.equal(b.customer_id, "c2"); assert.equal(b.notes, "not");
});
t("indirimsiz kayıtta belge indirimi gönderilmez", () => {
  const b = m.posLockedBody({ items: [], invoice_discount_type: "amount", invoice_discount_value: "1.00" }, { ...record, invoice_discount_type: null, invoice_discount_value: null });
  assert.equal("invoice_discount_type" in b, false); assert.equal("invoice_discount_value" in b, false);
});
t("açık hesapta cari değiştirilemez: kayıttaki cari korunur", () => {
  const r = { ...record, pos_payment_type: "acik_hesap", customer_id: "c1", customer_name: "Ali" };
  assert.equal(m.canChangeCustomer(r), false);
  assert.equal(m.canChangeCustomer(record), true);
  const b = m.posLockedBody({ customer_id: "c9", customer_name: "Veli", items: [] }, r);
  assert.equal(b.customer_id, "c1"); assert.equal(b.customer_name, "Ali");
});
t("kilit notu", () => {
  assert.equal(m.posLockNote(record), "Bu fatura POS-1 numaralı satış fişinden oluşturuldu. Ürünler, tutarlar ve stok fişten korunur. Tahsilat tekrar işlenmez.");
});
t("fiş eylemleri: dönüştür / bağlı faturayı aç / sil", () => {
  assert.deepEqual(m.receiptActions({ status: "completed" }), { convert: "Faturaya dönüştür", remove: true, removeNote: null });
  assert.deepEqual(m.receiptActions({ status: "completed", invoice_id: "i1" }),
    { convert: "Bağlı faturayı aç", remove: false, removeNote: "Bu satış bir faturaya bağlıdır. Fişi silmeden önce bağlı faturanın işlemlerini tamamlayın." });
  assert.deepEqual(m.receiptActions({ status: "completed", receipt_delete_started: true }), { convert: null, remove: true, removeNote: null });
  assert.deepEqual(m.receiptActions({ status: "cancelled" }), { convert: null, remove: true, removeNote: null });
  assert.deepEqual(m.receiptActions({ status: "completed", deleted: true }), { convert: null, remove: false, removeNote: null });
});
t("silme onay metni", () => {
  assert.equal(m.deleteConfirmText({ sale_number: "POS-1", total: 150 }, "₺150,00"),
    "POS-1 numaralı ₺150,00 tutarındaki satış aktif listeden kaldırılacak. Bağlı kasa/kart tahsilatı geri alınacak, varsa açık hesap borcu kapatılacak ve satılan ürünler stoğa iade edilecek. İşlem geçmişi korunur.");
});
t("silme sonucu: tamam / uyarılı / yarım (pending)", () => {
  assert.deepEqual(m.deleteResult({ deleted: true, warnings: [] }), { done: true, text: "Satış fişi silindi. Kasa tahsilatı geri alındı ve stok iadesi tamamlandı." });
  assert.deepEqual(m.deleteResult({ deleted: true, warnings: ["p9"] }), { done: true, text: "Satış fişi silindi ve kasa tahsilatı geri alındı. Katalogda artık bulunmayan ürünlerin stok iadesi atlandı." });
  assert.deepEqual(m.deleteResult({ deleted: false, pending: true }), { done: false, text: "Silme işlemi kaydedildi. Kasa veya cari işlemi tamamlanıyor; aynı fişten yeniden deneyebilirsiniz." });
  assert.deepEqual(m.deleteResult({ deleted: true, replayed: true, already_cancelled: true }), { done: true, text: "Satış fişi silindi. Kasa tahsilatı geri alındı ve stok iadesi tamamlandı." });
});
t("dönüştürme/silme hata metni: sunucu metni, yoksa genel", () => {
  assert.equal(m.receiptErrorText({ status: 409, message: "Kasa kaydı tamamlanıyor. Biraz sonra yeniden deneyin." }, "convert"), "Kasa kaydı tamamlanıyor. Biraz sonra yeniden deneyin.");
  assert.equal(m.receiptErrorText({ status: 500, message: "Sunucu hatası (500)" }, "convert"), "Fatura taslağı oluşturulamadı. Yeniden deneyin.");
  assert.equal(m.receiptErrorText({ status: 0 }, "delete"), "Satış fişi silinemedi. Yeniden deneyin.");
});
t("ödemesi fişte alınmış (nakit/kart/karma) fişe bağlı faturada yeniden tahsilat yok; açık hesapta var", () => {
  assert.equal(m.posPrepaid({ pos_sale_id: "s1", pos_payment_type: "nakit" }), true);
  assert.equal(m.posPrepaid({ pos_sale_id: "s1", pos_payment_type: "acik_hesap" }), false);
  assert.equal(m.posPrepaid({ pos_payment_type: "nakit" }), false);
  assert.equal(m.POS_PREPAID_NOTE, "Bu satışın tahsilatı satış fişinde kayıtlı; fatura üzerinden yeniden tahsilat alınmaz.");
});
console.log(`${n} test geçti`);
