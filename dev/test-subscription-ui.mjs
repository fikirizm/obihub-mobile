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

// Sözleşme (13 Kas 2026, docs/mobil-oturum-icin-notlar.md): trial-status.renewal {kind, phase, can_renew, window_days, days_left, expires_at}.
const R = (renewal, extra = {}) => ({ subscription_status: "active", expires_at: new Date(NOW + 40 * day).toISOString(), renewal, ...extra });
t("renewal varsa phase'e göre: window → göster (days_left sunucudan), none → gizle, suspended → gösterme", () => {
  const w = m.renewalNotice(R({ kind: "subscription", phase: "window", days_left: 9, window_days: 14 }), NOW);
  assert.equal(w.title, "Yenileme dönemi açıldı");
  assert.equal(w.body, "Aboneliğinizin bitmesine 9 gün kaldı. Yenilemeyi app.obihub.app üzerinden yapabilirsiniz.");
  assert.equal(w.tone, "info");
  assert.equal(m.renewalNotice(R({ kind: "subscription", phase: "window", days_left: 2 }), NOW).tone, "warning");
  assert.match(m.renewalNotice(R({ kind: "subscription", phase: "window", days_left: 0 }), NOW).body, /bugün sona eriyor/);
  assert.equal(m.renewalNotice(R({ kind: "subscription", phase: "none", days_left: 3 }, { expires_at: new Date(NOW + 3 * day).toISOString() }), NOW), null);
  assert.equal(m.renewalNotice(R({ kind: "subscription", phase: "suspended", days_left: 0 }), NOW), null);
});
t("renewal expired → kırmızı; deneme hesabında metin denemeye göre", () => {
  const e = m.renewalNotice(R({ kind: "subscription", phase: "expired", days_left: 0 }), NOW);
  assert.deepEqual([e.title, e.body, e.tone], ["Aboneliğinizin süresi doldu", "Yenilemeyi app.obihub.app üzerinden yapabilirsiniz.", "error"]);
  const te = m.renewalNotice(R({ kind: "trial", phase: "expired", days_left: 0 }), NOW);
  assert.equal(te.title, "Deneme süreniz doldu");
  const tw = m.renewalNotice(R({ kind: "trial", phase: "window", days_left: 4 }), NOW);
  assert.equal(tw.title, "Deneme süreniz bitiyor");
  assert.match(tw.body, /^Deneme sürenizin bitmesine 4 gün kaldı\. Yenilemeyi app\.obihub\.app/);
});
t("renewal'da da ödeme bağlantısı / fiyat yok", () => {
  for (const r of [{ kind: "subscription", phase: "window", days_left: 5, can_renew: true }, { kind: "trial", phase: "expired", days_left: 0, can_renew: true }]) {
    const x = m.renewalNotice(R(r), NOW);
    assert.ok(!/https?:|₺|TL|öde|satın al/i.test(`${x.title} ${x.body}`));
    assert.equal(x.url, undefined);
  }
});

// Kullanım çubukları: trial-status usage/limits (yoksa /usage/summary; entegrasyonda billable_integrations).
t("kullanım çubukları: entegrasyon, ürün, aylık sipariş; oran ve renk", () => {
  const rows = m.usageBars({ usage: { integrations: 3, products: 4100, orders_monthly: 3000 }, limits: { integrations: 5, products: 5000, orders_monthly: 3000 } }, null);
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.used, r.limit, r.ratio, r.tone]), [
    ["integrations", "Entegrasyon", 3, 5, 0.6, "ok"],
    ["products", "Ürün", 4100, 5000, 0.82, "warning"],
    ["orders_monthly", "Aylık sipariş", 3000, 3000, 1, "error"],
  ]);
});
t("kullanım: trial-status'ta yoksa /usage/summary (billable_integrations); limitsiz satır yok; sınırsız (0/null) gösterilmez; oran 1'i aşmaz", () => {
  const rows = m.usageBars({}, { usage: { billable_integrations: 2, integrations: 9, products: 60 }, limits: { integrations: 1, products: 50 } });
  assert.deepEqual(rows.map((r) => [r.key, r.used, r.limit, r.ratio]), [["integrations", 2, 1, 1], ["products", 60, 50, 1]]);
  assert.deepEqual(m.usageBars({ usage: { products: 5 }, limits: { products: 0 } }, null), []);
  assert.deepEqual(m.usageBars(null, null), []);
});

// 25 Kas 2026 D2-C (web NextPlanCard / model.nextPlanCopy): trial-status.next_plan salt okunur; seçim web'de (App Store: fiyat/ödeme yok).
t("paket adı web'le aynı: growth → Pro, trial → Deneme", () => {
  assert.equal(m.planName("growth"), "Pro");
  assert.equal(m.planName("trial"), "Deneme");
  assert.equal(m.planName("starter"), "Starter");
  assert.equal(m.planName(""), "-");
});
t("sonraki dönem paketi: ödenmemiş / ödenmiş metni, limit fazlası satırları", () => {
  assert.equal(m.nextPlanView(null), null);
  const v = m.nextPlanView({ plan_key: "starter", billing_cycle: "monthly", paid: false, effective_at: "2026-12-20T09:00:00Z",
    overflow: [{ key: "products", label: "Ürün", used: 1200, limit: 1000, excess: 200 }], overflow_note: "Verileriniz silinmez." });
  assert.equal(v.status, "Starter · Aylık — 20 Ara 2026 tarihinden itibaren");
  assert.equal(v.detail, "Mevcut paketiniz dönem sonuna kadar aynen sürer. Yeni paket, yeni dönemi ödediğinizde 20 Ara 2026 tarihinde başlar.");
  assert.deepEqual(v.overflow, [{ key: "products", label: "Ürün", text: "1.200 / 1.000 (200 fazla)" }]);
  assert.equal(v.note, "Verileriniz silinmez.");
  const p = m.nextPlanView({ plan_key: "growth", billing_cycle: "yearly", paid: true, effective_at: "2026-12-20T09:00:00Z" });
  assert.equal(p.status, "Pro · Yıllık — 20 Ara 2026 tarihinden itibaren");
  assert.equal(p.detail, "Ödemesi alındı. Mevcut paketiniz 20 Ara 2026 tarihine kadar aynen sürer; sonra Pro başlar.");
  assert.deepEqual(p.overflow, []);
});

console.log(`\n${n} test geçti`);
