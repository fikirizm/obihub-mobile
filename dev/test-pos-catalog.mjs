// Birim testi: src/pos-catalog.ts (POS ürünleri GET /catalog/items?for=sale'den; mevcut / rezerve / satılabilir gösterimi;
// 409 POS_STOCK_RESERVED / POS_SALE_DELETED kesin ret metni) ve src/pos-money.ts posErrorAction yedeği (kodsuz eski 409).
// Web: lib/posCatalog.js, lib/posPayment.js posSaleErrorText. Çalıştırma: node dev/test-pos-catalog.mjs
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
const pc = await load("pos-catalog.ts");
const pm = await load("pos-money.ts");

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const item = (o = {}) => ({ id: "p1", kind: "goods", name: "Kupa", sku: "K1", barcode: "869", ean: null, image_url: "https://x/a.webp",
  vat_rate: 20, unit_price_gross: "120.50", tracks_stock: true, available: 2, physical_quantity: 5, reserved_quantity: 3, ...o });

t("katalog satırı → POS ürünü: brüt fiyat, satılabilir stok, mevcut, rezerve", () => {
  const p = pc.posProductFromItem(item());
  assert.equal(p.id, "p1"); assert.equal(p.price, 120.5); assert.equal(p.vatRate, 20);
  assert.equal(p.stock, 2); assert.equal(p.physical, 5); assert.equal(p.reserved, 3); assert.equal(p.tracked, true);
  assert.equal(p.imageUrl, "https://x/a.webp");
});
t("KDV yok → %18 (web POS varsayılanı); fiyat yok → 0", () => {
  const p = pc.posProductFromItem(item({ vat_rate: null, unit_price_gross: null }));
  assert.equal(p.vatRate, 18); assert.equal(p.price, 0);
});
t("stok izlenmeyen ve hizmet: stok yok sayılır, gösterim boş", () => {
  for (const o of [{ tracks_stock: false }, { kind: "service" }]) {
    const p = pc.posProductFromItem(item(o));
    assert.equal(p.tracked, false); assert.equal(p.reserved, 0); assert.equal(pc.stockText(p), "");
  }
});
t("gösterim: rezerve varsa üçlü, yoksa 'Stok N'", () => {
  assert.equal(pc.stockText(pc.posProductFromItem(item())), "Mevcut 5 · Rezerve 3 · Satılabilir 2");
  assert.equal(pc.stockText(pc.posProductFromItem(item({ available: 4, physical_quantity: 4, reserved_quantity: 0 }))), "Stok 4");
});
t("satılamaz: izlenen ve satılabilir ≤ 0", () => {
  assert.equal(pc.soldOut(pc.posProductFromItem(item({ available: 0 }))), true);
  assert.equal(pc.soldOut(pc.posProductFromItem(item())), false);
  assert.equal(pc.soldOut(pc.posProductFromItem(item({ available: 0, tracks_stock: false }))), false);
});
t("katalog sorgusu: q, for=sale, limit (en çok 50)", () => {
  assert.equal(pc.catalogPath("kupa a", 20), "/catalog/items?q=kupa+a&for=sale&limit=20");
  assert.equal(pc.catalogPath("", 500), "/catalog/items?for=sale&limit=50");
});
t("barkod tam eşleşme: barkod / EAN / SKU, büyük-küçük harf duyarsız", () => {
  const list = [pc.posProductFromItem(item()), pc.posProductFromItem(item({ id: "p2", barcode: "", ean: "4006", sku: "ab-1" }))];
  assert.equal(pc.exactPosMatch(list, " 869 ")?.id, "p1");
  assert.equal(pc.exactPosMatch(list, "4006")?.id, "p2");
  assert.equal(pc.exactPosMatch(list, "AB-1")?.id, "p2");
  assert.equal(pc.exactPosMatch(list, "zzz"), null);
});
t("POS_STOCK_RESERVED: metin + sepetteki rezerve ürün adları; satır kimlikleri", () => {
  const e = { status: 409, code: "POS_STOCK_RESERVED", message: "Ürün web sepetlerinde rezerve edilmiş. Satılabilir stok yetersiz; sepeti yenileyin.",
    data: { code: "POS_STOCK_RESERVED", product_ids: ["p2", "zz"], reserved_quantity: 2 } };
  const cart = [{ product: { id: "p1", name: "Kupa" } }, { product: { id: "p2", name: "Tabak" } }];
  assert.deepEqual(pc.reservedProductIds(e), ["p2", "zz"]);
  assert.equal(pc.posSaleErrorText(e, cart), "Satış kaydedilemedi: Ürün web sepetlerinde rezerve edilmiş. Satılabilir stok yetersiz; sepeti yenileyin. Rezerve ürün: Tabak. Ürünü sepetten çıkarın ya da adedini azaltın.");
  assert.deepEqual(pc.reservedProductIds({ status: 409, code: "X", data: { product_ids: ["p1"] } }), []);
});
t("POS_SALE_DELETED: yeni satış metni", () => {
  assert.equal(pc.posSaleErrorText({ status: 409, code: "POS_SALE_DELETED", message: "Bu satış fişi silinmiş, iptal edilmiş veya siliniyor. Yeni bir satış başlatın." }, []),
    "Satış kaydedilemedi: Bu satış fişi silinmiş, iptal edilmiş veya siliniyor. Yeni bir satış başlatın.");
});
t("posErrorAction: kodlu 409'lar kesin ret; kodsuz eski 409 'rezerve'/'silinmiş' metniyle de kesin ret", () => {
  assert.equal(pm.posErrorAction({ status: 409, code: "POS_STOCK_RESERVED" }), "new-key");
  assert.equal(pm.posErrorAction({ status: 409, code: "POS_SALE_DELETED" }), "new-key");
  assert.equal(pm.posErrorAction({ status: 409, message: "Ürün web sepetlerinde rezerve edilmiş" }), "new-key");
  assert.equal(pm.posErrorAction({ status: 409, message: "Bu satış fişi silinmiş" }), "new-key");
  assert.equal(pm.posErrorAction({ status: 409, message: "Stok işlemi sürüyor" }), "retry-same");
});

console.log(`${n} test geçti`);
