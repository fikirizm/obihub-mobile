// Birim testi: src/pos-receipts.ts (Satış Fişleri: GET /pos/receipts?page&per_page&q ve /pos/receipts/{id}). Web: pages/POSReceiptsPage.jsx.
// Çalıştırma: node dev/test-pos-receipts.mjs
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
const r = await load("pos-receipts.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("liste yolu: sayfa, 25'lik, arama kodlanır", () => {
  assert.equal(r.receiptsPath(1, ""), "/pos/receipts?page=1&per_page=25");
  assert.equal(r.receiptsPath(3, " SF-00 12 "), "/pos/receipts?page=3&per_page=25&q=SF-00+12");
  assert.equal(r.receiptPath("a/b"), "/pos/receipts/a%2Fb");
});
t("sayfa sayısı ve sonraki sayfa", () => {
  assert.equal(r.pageCount(0), 1); assert.equal(r.pageCount(25), 1); assert.equal(r.pageCount(26), 2);
  assert.equal(r.hasNext(1, 26), true); assert.equal(r.hasNext(2, 26), false);
});
t("durum metni (web status())", () => {
  assert.equal(r.statusText({ deleted: true, status: "completed" }), "Silindi");
  assert.equal(r.statusText({ status: "cancelled" }), "İptal edildi");
  assert.equal(r.statusText({ status: "completed" }), "Tamamlandı");
  assert.equal(r.statusText({ status: "stock_error" }), "Stok işlemi bekliyor");
  assert.equal(r.statusText({ status: "processing" }), "İşlem tamamlanıyor");
});
t("rozetler: siliniyor / stok hatası / cari bekliyor / faturalı", () => {
  assert.deepEqual(r.badges({ status: "completed" }), []);
  assert.deepEqual(r.badges({ status: "completed", invoice_id: "i1", invoice_number: "OBI2026001" }).map((b) => b.label), ["Fatura OBI2026001"]);
  assert.deepEqual(r.badges({ status: "completed", invoice_id: "i1" }).map((b) => b.label), ["Faturaya bağlı"]);
  assert.deepEqual(r.badges({ status: "cancelled", receipt_delete_started: true, stock_restore_error: "x", ledger_pending: true }).map((b) => [b.label, b.tone]),
    [["Siliniyor", "warning"], ["Stok iadesi bekliyor", "error"], ["Cari kaydı bekliyor", "warning"]]);
});
t("ödeme yöntemi metni", () => {
  assert.equal(r.methodText("nakit"), "Nakit"); assert.equal(r.methodText("karma"), "Nakit + kart");
  assert.equal(r.methodText("acik_hesap"), "Açık hesap"); assert.equal(r.methodText("x"), "—");
});
t("liste satırı: müşteri yoksa Genel Müşteri; adet ve tutar sayıya", () => {
  const row = r.receiptRow({ id: "s1", sale_number: "SF-1", created_at: "2026-11-21T10:00:00Z", total: "150.5", item_count: 3, payment_type: "kart", status: "completed" });
  assert.equal(row.customer, "Genel Müşteri"); assert.equal(row.total, 150.5); assert.equal(row.itemCount, 3); assert.equal(row.method, "Kart");
});
t("detay kalemleri: satır tutarı yoksa birim × adet × (1 − iskonto)", () => {
  const d = r.receiptDetail({ id: "s1", sale_number: "SF-1", total: 200, subtotal: 210, discount_amount: 10, vat_amount: 33.33,
    items: [{ product_name: "Kupa", sku: "K1", quantity: 2, unit_price: 100, discount_percent: 0, vat_rate: 20, line_total: 200 },
            { product_name: "Tabak", quantity: 1, unit_price: 10, discount_percent: 10, vat_rate: 20 }] });
  assert.equal(d.lines.length, 2); assert.equal(d.lines[1].total, 9); assert.equal(d.lines[0].name, "Kupa");
  assert.equal(d.subtotal, 210); assert.equal(d.discount, 10); assert.equal(d.vat, 33.33);
});
t("okuma hatası metinleri", () => {
  assert.equal(r.readError({ status: 403 }), "Satış fişlerini görme yetkiniz yok. Yöneticinizden Satışlar modülü için izin isteyin.");
  assert.equal(r.readError({ status: 404, message: "Satış fişi bulunamadı." }), "Satış fişi bulunamadı.");
  assert.equal(r.readError({ status: 500 }), "Satış fişleri yüklenemedi. Kayıtlarınız korunuyor; yeniden deneyebilirsiniz.");
});
t("özet: kuruş metinleri sayıya, sıfır olmayan ödeme yolları, iptal notu", () => {
  const s = r.receiptSummary({ count: 3, total: "150.50", by_method: { nakit: "100.00", kart: "50.50", acik_hesap: "0.00", diger: "0.00" }, uninvoiced_count: 2, uninvoiced_amount: "90.00", excluded_count: 2 });
  assert.equal(s.total, 150.5);
  assert.equal(s.count, 3);
  assert.deepEqual(s.methods, [{ key: "nakit", label: "Nakit", amount: 100 }, { key: "kart", label: "Kart", amount: 50.5 }]);
  assert.equal(s.uninvoicedCount, 2);
  assert.equal(s.uninvoicedAmount, 90);
  assert.equal(s.note, "3 fiş · 2 iptal edilen fiş hariç");
});
t("özet: Diğer payı görünür; excluded_count yoksa (eski sunucu) not yalnız fiş sayısı", () => {
  const s = r.receiptSummary({ count: 1, total: "10.00", by_method: { nakit: "0", kart: "0", acik_hesap: "4.00", diger: "6.00" } });
  assert.deepEqual(s.methods.map((x) => x.label), ["Açık hesap", "Diğer"]);
  assert.equal(s.note, "1 fiş");
});
t("özet: sunucu göndermezse (eski sürüm) null", () => {
  assert.equal(r.receiptSummary(undefined), null);
  assert.equal(r.receiptSummary(null), null);
});
console.log(`${n} test geçti`);
