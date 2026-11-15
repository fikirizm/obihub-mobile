// Birim testi: src/api-iceri-al.ts — Paraşüt akışı (15 Kas 2026, docs/pm/tasarim/iceri-al-parasut-akisi.md; web iceriAl/IceriAlAkis.jsx).
// "Ürün kalemleri hatırlansın mı?" → depo → remember-products → dolu gider formu. KDV/tutar sorulmaz.
// Çalıştırma: node dev/test-iceri-al-parasut.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
let src = readFileSync(join(here, "../frontend/src/api-iceri-al.ts"), "utf8");
src = src.replace(/import \{ request \} from "\.\/api";/, "const request = async (...a) => { globalThis.__calls.push(a); return globalThis.__reply; };");
globalThis.__calls = [];
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }
const view = (over = {}) => ({
  lines: [{ index: 0 }, { index: 1 }, { index: 2 }],
  supplier: { name: "Örnek Toptan", tax_number: "1234567890", state: "unmatched", candidates: [] },
  decisions: { supplier: { create_new: { available: true } } },
  ...over,
});

await t("soru metinleri web ile aynı", () => {
  assert.equal(m.REMEMBER_TEXT.question, "Ürün kalemleri hatırlansın mı?");
  assert.match(m.REMEMBER_TEXT.yes, /ürün kartı olarak kaydedilir/);
  assert.match(m.REMEMBER_TEXT.no, /ürün kartı açılmaz, stok değişmez/);
});

await t("Evet: tüm kalemler ürün + stok, mod expense_and_stock; tedarikçi yoksa yeni cari", () => {
  const a = m.answerArgs(m.INITIAL_ARGS, view(), "yes");
  assert.equal(a.mode, "expense_and_stock");
  assert.equal(a.lineChoices.length, 3);
  assert.ok(a.lineChoices.every((c) => c.kind === "product" && c.stock === true && c.product_id === null));
  assert.equal(a.createSupplier, true);
  assert.equal(a.supplierId, null);
});

await t("Hayır: tüm kalemler gider (hizmet), stok yok, depo boş", () => {
  const a = m.answerArgs({ ...m.INITIAL_ARGS, warehouseId: "w1" }, view(), "no");
  assert.equal(a.mode, "expense_only");
  assert.ok(a.lineChoices.every((c) => c.kind === "service" && c.stock === null));
  assert.equal(a.warehouseId, null);
});

await t("D-18k: VKN ile tek kayıtlı cari eşleşirse ona bağlanır, yeni cari açılmaz", () => {
  const v = view({ supplier: { tax_number: "1234567890", state: "ambiguous", candidates: [{ id: "s1", label: "Örnek", tax_number: "1234567890" }] } });
  const a = m.answerArgs(m.INITIAL_ARGS, v, "yes");
  assert.equal(a.supplierId, "s1");
  assert.equal(a.createSupplier, false);
});

await t("D-18k: VKN ile birden çok eşleşme → kullanıcı seçer (yeni cari önerilmez)", () => {
  const v = view({ supplier: { tax_number: "1234567890", state: "ambiguous", candidates: [{ id: "s1", label: "A" }, { id: "s2", label: "B" }] } });
  const a = m.answerArgs(m.INITIAL_ARGS, v, "yes");
  assert.equal(a.supplierId, null);
  assert.equal(a.createSupplier, false);
  assert.equal(m.supplierVkn(v.supplier).length, 2);
  assert.equal(m.canCreateSupplier(v), false);
});

await t("kayıtlı (matched) tedarikçide seçim değişmez", () => {
  const v = view({ supplier: { state: "matched", candidates: [] } });
  const a = m.answerArgs({ ...m.INITIAL_ARGS, supplierId: null }, v, "yes");
  assert.equal(a.supplierId, null);
  assert.equal(a.createSupplier, false);
});

await t("remember-products: doğru uç, boş gövde; yanıt satır haritasına dönüşür", async () => {
  globalThis.__reply = { lines: [
    { index: 0, status: "created", product_id: "p1", is_new: true },
    { index: 1, status: "existing", product_id: "p2", is_new: false },
    { index: 2, status: "ambiguous", product_id: null, is_new: false, suggested_product_id: "p9", suggested_product_name: "Ekmek 1 kg" },
    { index: "x" }] };
  const map = await m.rememberProducts("tok", "e/1");
  const [path, opts, token] = globalThis.__calls.at(-1);
  assert.equal(path, "/incoming-invoices/e%2F1/quick-import/remember-products");
  assert.equal(opts.method, "POST");
  assert.equal(opts.body, "{}");
  assert.equal(token, "tok");
  assert.deepEqual(Object.keys(map), ["0", "1", "2"]);
  assert.equal(map[0].isNew, true);
  assert.equal(map[1].isNew, false);
  assert.equal(map[2].status, "ambiguous");
  assert.equal(map[2].suggestedName, "Ekmek 1 kg");
  assert.equal(m.newCardCount(map), 1);
});

await t("remember hatası: 409 INVENTORY_OWNER_ACCOUNTING → yalnız gider; diğerleri Türkçe metin", () => {
  assert.deepEqual(m.rememberErrorAction({ status: 409, code: "INVENTORY_OWNER_ACCOUNTING", message: "x" }), { expenseOnly: true });
  assert.deepEqual(m.rememberErrorAction({ status: 403, code: "PRODUCT_LIMIT_REACHED", message: "Paketinizin ürün sınırına ulaştınız." }), { message: "Paketinizin ürün sınırına ulaştınız." });
  assert.deepEqual(m.rememberErrorAction({ status: 500, message: "Sunucu hatası (500)" }), { message: "Ürünler şu an hatırlanamadı. Biraz sonra yeniden deneyin." });
  assert.deepEqual(m.rememberErrorAction({ status: 0, message: "Network request failed" }), { message: "Ürünler şu an hatırlanamadı. Biraz sonra yeniden deneyin." });
});

await t("kuruş farkı (reconciliation_level=warning): sarı uyarı metni web ile aynı; aksi hâlde yok", () => {
  assert.equal(m.kurusNotice({ reconciliation_level: "warning", lines_difference: "-0.01" }), "Satırlardan hesaplanan tutar ile fatura toplamı arasında 0,01 TL yuvarlama farkı var. Kayıt faturadaki toplamla yapılır.");
  assert.match(m.kurusNotice({ reconciliation_level: "warning" }), /0,01 TL/);
  assert.equal(m.kurusNotice({ reconciliation_level: "ok" }), null);
  assert.equal(m.kurusNotice(null), null);
});

await t("yeni ret kodları: sunucu detail'i gösterilir (rejectionOf)", () => {
  for (const code of ["PREVIEW_PARASUT_UBL_INVALID", "PREVIEW_PARASUT_UBL_TOTAL_MISMATCH", "ALREADY_IMPORTED_IN_PARASUT", "INVENTORY_OWNER_ACCOUNTING"])
    assert.deepEqual(m.rejectionOf({ status: 409, code, message: "Türkçe açıklama." }), { code, detail: "Türkçe açıklama." });
});

await t("stok yapılamıyor metni (muhasebe stok sahibi / daha önce stoğa girdi)", () => {
  assert.match(m.stockUnavailableText({ reason: "INVENTORY_OWNED_BY_ACCOUNTING" }), /Stok sahibi muhasebe programınız.*gider olarak işlenir/);
  assert.match(m.stockUnavailableText({ reason: "STOCK_ALREADY_RECEIVED" }), /gider olarak işlenir/);
  assert.equal(m.stockUnavailableText({ reason: null }), null);
});

await t("son çare satırları (MANUAL_LINE_REQUIRED): sunucu metni + web'e yönlendirme; diğer kodlarda yalnız metin", () => {
  assert.equal(m.rejectionText({ code: "PREVIEW_PARASUT_MANUAL_LINE_REQUIRED", detail: "Fatura kalemleri alınamadı." }), "Fatura kalemleri alınamadı. Bu faturayı web'den (app.obihub.app) içeri alın.");
  assert.equal(m.rejectionText({ code: "PREVIEW_PARASUT_UBL_INVALID", detail: "Fatura okunamadı." }), "Fatura okunamadı.");
  assert.equal(m.rejectionText(null), null);
});

console.log(`\n${n} test geçti`);
