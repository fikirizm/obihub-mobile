// Birim testi: src/web-store.ts (Faz A M9: Menü → Web Mağaza). Sunucu: routers/website.py publication-status (GET settings.view|manage;
// PUT yalnız firma sahibi {expected_revision, is_published}), storefront_cart_reservations cart-reservations ({expected_revision, enabled};
// sahibe active_carts/reserved_units), storefront.payment-monitor (yalnız sahip, son 100), storefront_members members (yalnız sahip, okuma).
// 409 REVISION_CHANGED → yeniden oku. Web: WebsitePaymentsPanel.jsx durum metinleri. Çalıştırma: node dev/test-web-store.mjs
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
const m = await load("web-store.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
t("aç/kapa gövdeleri revizyonla", () => {
  assert.deepEqual(m.publicationBody({ revision: 3, is_published: false }, true), { expected_revision: 3, is_published: true });
  assert.deepEqual(m.reservationBody({ revision: 0, enabled: true }, false), { expected_revision: 0, enabled: false });
  assert.deepEqual(m.publicationBody(null, true), { expected_revision: 0, is_published: true });
});
t("hata: revizyon çakışması yeniden okutur; diğer 409'larda sunucu metni", () => {
  assert.deepEqual(m.storeError({ status: 409, code: "REVISION_CHANGED", message: "Bilgiler değişti. Yeniden yükleyip deneyin." }), { text: "Ayarlar başka bir yerde değişti; güncel hali yüklendi. Gerekirse yeniden deneyin.", reload: true });
  assert.deepEqual(m.storeError({ status: 409, code: "CART_SERVER_REQUIRED", message: "Önce mağaza sepet bağlantısını tamamlayın." }), { text: "Önce mağaza sepet bağlantısını tamamlayın.", reload: false });
  assert.equal(m.storeError({ status: 403 }).text, "Bu ayarı yalnız firma sahibi değiştirebilir.");
  assert.equal(m.storeError({ status: 503, message: "Sunucu hatası (503)" }).text, "İşlem doğrulanamadı. Yeniden yükleyip kontrol edin.");
});
t("ödeme izleme satırları (web WebsitePaymentsPanel durumları)", () => {
  const rows = m.monitorRows({ items: [
    { id: "abcdef1234", state: "awaiting_transfer", total: "1249.90", test_mode: false, created_at: "2026-11-21T10:00:00+00:00", needs_attention: false },
    { id: "x2", state: "payment_review", review_reason: "AMOUNT_MISMATCH", total: "10.00", test_mode: true, created_at: "2026-11-20T10:00:00+00:00", needs_attention: true },
    { id: "x3", state: "weird", total: "5", created_at: "" } ] });
  assert.equal(rows[0].state, "Havale bekleniyor"); assert.equal(rows[0].total, 1249.9); assert.equal(rows[0].tone, "warning"); assert.equal(rows[0].code, "abcdef12");
  assert.equal(rows[1].state, "İnceleme gerekli · Test"); assert.equal(rows[1].note, "Ödeme tutarı uyuşmuyor. Sipariş otomatik hazırlanmadı; ödeme mutabakatı gerekli.");
  assert.equal(rows[1].tone, "error");
  assert.equal(rows[2].state, "weird"); assert.equal(rows[2].tone, "neutral");
  assert.equal(m.monitorRows({ items: [{ id: "y", state: "paid", total: "1", needs_attention: true, created_at: "" }] })[0].note, "Sipariş işleme kontrol edilmeli; ödeme yeniden alınmamalı.");
});
t("özet metinleri", () => {
  assert.equal(m.publicationText({ is_published: true }), "Mağaza yayında; müşteriler ürünleri görüp sipariş verebilir.");
  assert.equal(m.publicationText({ is_published: false, message: "Yakında buradayız" }), "Mağaza kapalı; ziyaretçiler \"Yakında buradayız\" sayfasını görür.");
  assert.equal(m.reservationText({ enabled: true, reservation_minutes: 15, server_ready: true, active_carts: 2, reserved_units: 5 }), "Açık · sepetteki ürün 15 dakika ayrılır · 2 aktif sepet, 5 adet ayrılmış");
  assert.equal(m.reservationText({ enabled: false, reservation_minutes: 15, server_ready: false }), "Kapalı · mağaza sepet bağlantısı hazır değil");
});
console.log(`${n} test geçti`);
