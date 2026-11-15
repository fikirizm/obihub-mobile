// Birim testi: src/push-ui.ts — yeni sipariş bildirimi (kilit ekranı metni, dokununca rota, izin ekranı zamanlaması).
// Çalıştırma: node dev/test-push-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/push-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("tek sipariş: başlık 'Yeni sipariş · Kanal', gövde tutar + ürün sayısı; müşteri adı YOK", () => {
  const x = m.orderNotificationText([{ channel: "Trendyol", amount: 1234.5, itemCount: 3, currency: "TRY", customer: "Ayşe Kaya" }]);
  assert.equal(x.title, "Yeni sipariş · Trendyol");
  assert.equal(x.body, "₺1.234,50 · 3 ürün");
  assert.ok(!JSON.stringify(x).includes("Ayşe"));
});
t("tutarı gizle tercihi: yalnız ürün sayısı", () => {
  assert.equal(m.orderNotificationText([{ channel: "WooCommerce", amount: 99, itemCount: 1 }], { showAmount: false }).body, "1 ürün");
});
t("birden çok sipariş: '3 yeni sipariş', kanal dağılımı ve toplam", () => {
  const x = m.orderNotificationText([{ channel: "Trendyol", amount: 100, itemCount: 1 }, { channel: "Trendyol", amount: 50, itemCount: 2 }, { channel: "Hepsiburada", amount: 25.25, itemCount: 1 }]);
  assert.equal(x.title, "3 yeni sipariş");
  assert.equal(x.body, "Trendyol 2 · Hepsiburada 1 · Toplam ₺175,25");
  assert.equal(m.orderNotificationText([{ channel: "Trendyol", amount: 100, itemCount: 1 }, { channel: "n11", amount: 1, itemCount: 1 }], { showAmount: false }).body, "Trendyol 1 · n11 1");
});
t("dokununca rota: sipariş kimliği ya da uygulama içi yol; bilinmeyen veride null", () => {
  assert.deepEqual(m.notificationRoute({ order_id: "o 1" }), { pathname: "/orders/[id]", params: { id: "o 1" } });
  assert.deepEqual(m.notificationRoute({ url: "obihub://orders/abc" }), { pathname: "/orders/[id]", params: { id: "abc" } });
  assert.deepEqual(m.notificationRoute({ path: "/orders/xyz" }), { pathname: "/orders/[id]", params: { id: "xyz" } });
  assert.equal(m.notificationRoute({ url: "https://evil.example/orders/1" }), null);
  assert.equal(m.notificationRoute({}), null);
});
t("izin açıklama ekranı: yalnız izin sorulmamışsa; 'Şimdi değil'den sonra 7 gün sormaz", () => {
  const now = 1_700_000_000_000;
  assert.equal(m.shouldShowPushPrompt("undetermined", null, now), true);
  assert.equal(m.shouldShowPushPrompt("granted", null, now), false);
  assert.equal(m.shouldShowPushPrompt("denied", null, now), false);
  assert.equal(m.shouldShowPushPrompt("undetermined", now - 2 * 86400000, now), false);
  assert.equal(m.shouldShowPushPrompt("undetermined", now - 8 * 86400000, now), true);
});
console.log(`\n${n} test geçti`);
