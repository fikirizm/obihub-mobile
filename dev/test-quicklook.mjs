// Birim testi: src/quicklook.ts (KABUK-2 cari/ürün hızlı bakışı; web components/quicklook/useCariOzet.js + useUrunOzet.js).
// Çalıştırma: node dev/test-quicklook.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/quicklook.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("bakiye: para birimi başına, sıfırlar atılır, toplanmaz; tek alanlı eski biçim", () => {
  assert.deepEqual(m.balanceRows({ balances: [{ currency: "TRY", balance: "1250.5" }, { currency: "USD", balance: "-40" }, { currency: "EUR", balance: "0" }] }),
    [{ currency: "TRY", balance: 1250.5 }, { currency: "USD", balance: -40 }]);
  assert.deepEqual(m.balanceRows({ balance: 300, currency: "TRY" }), [{ currency: "TRY", balance: 300 }]);
  assert.deepEqual(m.balanceRows({ balance: null }), []);
});
t("hareket satırı: okuma modeli (side/amount) ve eski uç (debit/credit) aynı biçime", () => {
  assert.deepEqual(m.ledgerRow({ id: "l1", kind: "invoice", occurred_on: "2026-11-20", document_number: "OBI1", side: "debit", amount: "100", balance_after: "100", currency: "TRY" }, 0),
    { id: "l1", date: "2026-11-20", reference: "OBI1", label: "Fatura", debit: "100", credit: null, balance: "100", currency: "TRY" });
  assert.deepEqual(m.ledgerRow({ date: "2026-11-21", description: "Kasa tahsilatı", credit: 50, balance: 50 }, 3),
    { id: 3, date: "2026-11-21", reference: "", label: "Kasa tahsilatı", debit: undefined, credit: 50, balance: 50, currency: "TRY" });
});
t("stok: takip yoksa bilgi; depolara bölünmüşse depo satırları; toplam satılabilir", () => {
  assert.deepEqual(m.stockView({ tracks_stock: false }), { tracks: false, rows: [], total: null });
  assert.deepEqual(m.stockView({ split: true, warehouses: [{ warehouse_id: "w1", name: "Ana depo", quantity: 12 }, { name: "Mağaza", quantity: 3 }], total: { sellable: 15, on_hand: 17 } }),
    { tracks: true, rows: [{ key: "w1", name: "Ana depo", qty: "12" }, { key: "Mağaza", name: "Mağaza", qty: "3" }], total: "15" });
  assert.deepEqual(m.stockView({ split: false, warehouses: [{ name: "Ana", quantity: 1 }], total: { on_hand: 1234.5 } }), { tracks: true, rows: [], total: "1.234,5" });
});
t("son alış ve son satışlar", () => {
  assert.deepEqual(m.purchaseView({ items: [{ date: "2026-11-01", unit_price_net: "80.00", currency: "TRY", party: { name: "Tedarik A.Ş." }, document: { number: "AL-9" } }] }),
    { date: "2026-11-01", price: "80.00", currency: "TRY", party: "Tedarik A.Ş.", number: "AL-9" });
  assert.equal(m.purchaseView({ items: [] }), null);
  const s = m.saleRows({ items: [{ date: "2026-11-20", party: { name: "Elif" }, invoice: { id: "i1", number: "OBI5" }, quantity: 2, unit: "ADET", unit_price_net: "120" }] });
  assert.deepEqual(s, [{ key: "i1-0", party: "Elif", date: "2026-11-20", number: "OBI5", qty: "2 ADET", price: "120", currency: "TRY" }]);
});
t("miktar ve gün metni", () => {
  assert.equal(m.qtyText(1234.5678), "1.234,568");
  assert.equal(m.qtyText("x"), "—");
  assert.equal(m.dayText("2026-11-20"), "20 Kas 2026");
  assert.equal(m.dayText("2026-11-20T22:30:00Z"), "21 Kas 2026");
  assert.equal(m.dayText(""), "");
});

t("sipariş kanalı adı web'le aynı", () => {
  assert.equal(m.channelText("woocommerce"), "Web sitesi");
  assert.equal(m.channelText("website"), "Web mağaza");
  assert.equal(m.channelText("trendyol"), "Trendyol");
  assert.equal(m.channelText("koton"), "Koton");
  assert.equal(m.channelText(""), "");
});
console.log(`\n${n} test geçti`);
