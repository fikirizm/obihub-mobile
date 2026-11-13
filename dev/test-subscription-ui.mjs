// Birim testi: src/subscription-ui.ts (abonelik yenileme bilgisi; PM 13 Kas 2026: bitişe ≤14 gün kalınca
// "Web'den yenileyin" bilgisi; ödeme bağlantısı ya da fiyat YOK — App Store dış ödeme yönlendirme kuralı).
// Çalıştırma: node dev/test-subscription-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/subscription-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const NOW = Date.parse("2026-11-13T12:00:00Z");
const day = 86400000;

t("bitişe 14 günden fazla varsa bilgi yok", () => {
  assert.equal(m.renewalNotice({ expires_at: new Date(NOW + 15 * day).toISOString(), subscription_status: "active" }, NOW), null);
  assert.equal(m.renewalNotice({ subscription_status: "active" }, NOW), null);
  assert.equal(m.renewalNotice({ expires_at: "bozuk", subscription_status: "active" }, NOW), null);
});
t("14 gün ve altı: kalan gün + web'den yenileme bilgisi", () => {
  const r = m.renewalNotice({ expires_at: new Date(NOW + 14 * day).toISOString(), subscription_status: "active" }, NOW);
  assert.equal(r.title, "Yenileme dönemi açıldı");
  assert.equal(r.body, "Aboneliğinizin bitmesine 14 gün kaldı. Yenilemeyi app.obihub.app üzerinden yapabilirsiniz.");
  assert.equal(r.tone, "info");
  const r2 = m.renewalNotice({ expires_at: new Date(NOW + 2 * day + 3600000).toISOString(), subscription_status: "trial" }, NOW);
  assert.match(r2.body, /3 gün kaldı/);
  assert.equal(r2.tone, "warning");
  const today = m.renewalNotice({ expires_at: new Date(NOW + 3600000).toISOString(), subscription_status: "active" }, NOW);
  assert.match(today.body, /bugün sona eriyor/);
});
t("süresi dolmuş: uyarı, yine yalnız bilgi", () => {
  const r = m.renewalNotice({ expires_at: new Date(NOW - day).toISOString(), subscription_status: "expired" }, NOW);
  assert.equal(r.title, "Aboneliğinizin süresi doldu");
  assert.equal(r.body, "Yenilemeyi app.obihub.app üzerinden yapabilirsiniz.");
  assert.equal(r.tone, "error");
});
t("metinde ödeme bağlantısı, fiyat ya da satın alma çağrısı yok", () => {
  for (const d of [-1, 0.2, 5, 14]) {
    const r = m.renewalNotice({ expires_at: new Date(NOW + d * day).toISOString(), subscription_status: "active" }, NOW);
    const all = `${r.title} ${r.body}`;
    assert.ok(!/https?:|₺|TL|öde|satın al/i.test(all), all);
    assert.equal(r.url, undefined);
  }
});
t("iptal edilmiş ya da duraklatılmış abonelikte yenileme bilgisi yok", () => {
  assert.equal(m.renewalNotice({ expires_at: new Date(NOW + 3 * day).toISOString(), subscription_status: "cancelled" }, NOW), null);
  assert.equal(m.renewalNotice({ expires_at: new Date(NOW + 3 * day).toISOString(), subscription_status: "suspended" }, NOW), null);
});

console.log(`\n${n} test geçti`);
