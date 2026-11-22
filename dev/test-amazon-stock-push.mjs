// Birim testi: src/amazon-stock-push.ts (Amazon FBM stok gönderimi mobil eşdeğerliği; web: ProductStockListPage.js,
// AmazonStockPushCard.jsx; sunucu: backend/amazon_stock_push.py, GET /parasut/product-stock integration_stocks[].push).
// Çalıştırma: node dev/test-amazon-stock-push.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/amazon-stock-push.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("failed → Gönderilemedi (kırmızı), ayrıntı eklenir", () => {
  assert.deepEqual(m.stockPushBadge({ state: "failed", code: "AMAZON_LISTING_NOT_FOUND", detail: "Bu SKU Amazon'da bulunamadı" }),
    { label: "Gönderilemedi: Bu SKU Amazon'da bulunamadı", tone: "bad" });
  assert.deepEqual(m.stockPushBadge({ state: "failed" }), { label: "Gönderilemedi", tone: "bad" });
});
t("Amazon pending hata değil: ayrıntı sakin bilgi; ayrıntı yoksa sipariş senkronu metni", () => {
  assert.deepEqual(m.stockPushBadge({ state: "pending", code: "AMAZON_STOCK_CHANGED_ON_AMAZON", detail: "Amazon'da stok değişmiş; erteleniyor." }),
    { label: "Amazon'da stok değişmiş; erteleniyor.", tone: "wait" });
  assert.deepEqual(m.stockPushBadge({ state: "pending", code: "AMAZON_QUANTITY_UNKNOWN", detail: "" }),
    { label: "Amazon sipariş senkronu bekleniyor", tone: "wait" });
});
t("diğer durumlar ortak kanal rozetine bırakılır (Trendyol pending, ok, kodlu ret)", () => {
  const base = (p) => ({ label: `ortak:${p.state}`, tone: "good" });
  assert.deepEqual(m.stockPushBadge({ state: "pending" }, base), { label: "ortak:pending", tone: "good" });
  assert.deepEqual(m.stockPushBadge({ state: "ok" }, base), { label: "ortak:ok", tone: "good" });
  assert.deepEqual(m.stockPushBadge({ state: "failed", code: "CHANNEL_REJECTED" }, base), { label: "ortak:failed", tone: "good" });
  assert.equal(m.stockPushBadge({ state: "ok" }), null);
  assert.equal(m.stockPushBadge(null), null);
  assert.equal(m.stockPushBadge(undefined), null);
});
t("skip kodları bilgi: FBA, gönderim türü belli değil, ilk eşitleme onayı", () => {
  assert.deepEqual(m.stockPushBadge({ state: "skipped", code: "AMAZON_FBA_SKIPPED", detail: "x" }),
    { label: "FBA: stok Amazon deposunda yönetilir", tone: "wait" });
  assert.deepEqual(m.stockPushBadge({ state: "skipped", code: "AMAZON_FULFILLMENT_UNKNOWN", detail: "Gönderim türü bildirilmedi." }),
    { label: "Gönderilmedi: Gönderim türü bildirilmedi.", tone: "wait" });
  assert.deepEqual(m.stockPushBadge({ state: "skipped", code: "AMAZON_FIRST_SYNC_REVIEW" }),
    { label: "İlk eşitleme onayı bekliyor", tone: "wait" });
});
t("FBA ürününde stok girişi kapalı; Amazon'da fiyat girişi kapalı", () => {
  assert.equal(m.isFbaStock({ state: "skipped", code: "AMAZON_FBA_SKIPPED" }), true);
  assert.equal(m.isFbaStock({ state: "failed", code: "AMAZON_FBA_SKIPPED" }), false);
  assert.equal(m.isFbaStock(undefined), false);
  assert.equal(m.channelPriceEditable("amazon"), false);
  assert.equal(m.channelPriceEditable("Amazon"), false);
  assert.equal(m.channelPriceEditable("trendyol"), true);
  assert.equal(m.AMAZON_PRICE_NOTE, "Fiyat Amazon'a gönderilmez");
});
t("fiyat satırında yalnız fiyat içeren (ya da türü bilinmeyen eski) gönderim sonucu", () => {
  assert.equal(m.pushForPrice({ state: "failed", kinds: ["stock"] }), undefined);
  assert.deepEqual(m.pushForPrice({ state: "ok", kinds: ["price", "stock"] }), { state: "ok", kinds: ["price", "stock"] });
  assert.deepEqual(m.pushForPrice({ state: "ok" }), { state: "ok" });
  assert.equal(m.pushForStock({ state: "ok" }), undefined);
  assert.deepEqual(m.pushForStock({ state: "ok", kinds: ["stock"] }), { state: "ok", kinds: ["stock"] });
});
t("mağaza uyarısı: stock_push_warning olan mağazalar adıyla", () => {
  assert.deepEqual(m.storeStockWarnings([
    { id: "1", name: "Amazon TR", stockPushWarning: "SP-API Listings yetkisi gerekiyor." },
    { id: "2", name: "Trendyol", stockPushWarning: null },
  ]), [{ id: "1", text: "Amazon TR: stok gönderimi durdu. SP-API Listings yetkisi gerekiyor." }]);
});
t("mağaza durumu: blok (24 saat sonra yeniden deneme), onay bekleyen ve gönderilen sayıları", () => {
  const v = m.storePushView({ block: { code: "AMAZON_LISTINGS_ACCESS_DENIED", message: "SP-API Listings yetkisi gerekiyor.", retry_at: "2026-11-23T09:30:00Z" },
    first_sync_review_count: 3, first_sync_sending_count: 2 });
  assert.equal(v.block.message, "SP-API Listings yetkisi gerekiyor.");
  assert.equal(v.block.retry, "Otomatik yeniden deneme: 23.11 12:30. Yeniden bağlandığınızda hemen denenir.");
  assert.equal(v.review, 3);
  assert.equal(v.reviewTitle, "İlk eşitleme onay bekliyor: 3 ürün");
  assert.equal(v.confirmText, "3 ürünün Amazon stoğu ObiHub'daki satılabilir stokla (0) değiştirilecek. Bu ürünlerde Amazon'da stok var ya da miktar okunamadı.");
  assert.equal(v.sendingText, "Onaylanan 2 ürünün ObiHub stoğu Amazon'a gönderiliyor.");
  const empty = m.storePushView(null, { code: "X", message: "Yedek blok" });
  assert.equal(empty.block.message, "Yedek blok");
  assert.equal(empty.review, 0);
  assert.equal(empty.sendingText, "");
  assert.equal(m.storePushView({ block: null }).block, null);
});
t("onay sonucu: sunucunun pending sayısı, yoksa listelenen sayı", () => {
  assert.equal(m.approveText({ pending: 4 }, 3), "4 ürünün ObiHub stoğu Amazon'a gönderiliyor.");
  assert.equal(m.approveText(null, 3), "3 ürünün ObiHub stoğu Amazon'a gönderiliyor.");
  assert.equal(m.approveText({ pending: 0 }, 3), "Onay bekleyen ürün kalmadı.");
});

console.log(`\n${n} test geçti`);
