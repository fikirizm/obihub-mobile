// Birim testi: src/marketplace-returns.ts (ENT-1/S3: Trendyol ve Hepsiburada iade talepleri). Sunucu: routers/marketplace_returns.py
// GET /marketplace-returns?provider&state&limit, POST /marketplace-returns/sync, POST /{id}/dismiss-stock-advice.
// Web: components/orders/MarketplaceReturnsModal.jsx. Çalıştırma: node dev/test-marketplace-returns.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/marketplace-returns.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("liste yolu: limit 100, durum süzgeci yalnız bilinen değerle", () => {
  assert.equal(m.returnsPath(""), "/marketplace-returns?limit=100");
  assert.equal(m.returnsPath("requested"), "/marketplace-returns?limit=100&state=requested");
  assert.equal(m.returnsPath("garip"), "/marketplace-returns?limit=100");
  assert.deepEqual(m.FILTERS.map((f) => f.label), ["Tümü", "İade talebi", "Onaylandı", "Reddedildi"]);
});
t("satır görünümü: kanal + sipariş, tarih ve neden, kalemler, durum tonu", () => {
  const v = m.rowView({ id: "r1", provider: "trendyol", order_number: "TY-9", state: "requested", state_label: "İade talebi", claimed_at: "2026-11-20T10:00:00Z", reason: "Beden uymadı",
    lines: [{ name: "Tişört", quantity: 2 }, { sku: "SKU-1", quantity: 1 }, { quantity: 1 }], stock_advice: { state: "suggested", message: "2 ürünü stoğa geri alın." } });
  assert.equal(v.title, "Sipariş TY-9");
  assert.equal(v.sub, "Trendyol · 20.11.2026 · Beden uymadı");
  assert.deepEqual(v.lines, ["Tişört × 2", "SKU-1 × 1", "Ürün × 1"]);
  assert.equal(v.tone, "warning");
  assert.equal(v.stateLabel, "İade talebi");
  assert.deepEqual(v.advice, { message: "2 ürünü stoğa geri alın.", dismissable: true });
});
t("öneri: yalnız suggested yok sayılabilir; already_restored / order_not_found bilgi; none ve dismissed gizli", () => {
  const base = { id: "r", provider: "hepsiburada", state: "approved" };
  assert.deepEqual(m.rowView({ ...base, stock_advice: { state: "already_restored", message: "Zaten geri alındı." } }).advice, { message: "Zaten geri alındı.", dismissable: false });
  assert.deepEqual(m.rowView({ ...base, stock_advice: { state: "order_not_found", message: "Sipariş yok." } }).advice, { message: "Sipariş yok.", dismissable: false });
  assert.equal(m.rowView({ ...base, stock_advice: { state: "none", message: "" } }).advice, null);
  assert.equal(m.rowView({ ...base, stock_advice: { state: "dismissed", message: "x" } }).advice, null);
  const v = m.rowView({ ...base, state: "approved" });
  assert.equal(v.title, "Sipariş —");
  assert.equal(v.sub, "Hepsiburada");
  assert.equal(v.tone, "info");
  assert.equal(m.rowView({ ...base, state: "rejected" }).tone, "neutral");
});
t("yok say sonrası satır yerelde kapanır, bekleyen sayısı düşer", () => {
  const data = { items: [{ id: "a", stock_advice: { state: "suggested", message: "m" } }, { id: "b", stock_advice: { state: "suggested" } }], summary: { stock_action_needed: 2 } };
  const d = m.afterDismiss(data, "a");
  assert.equal(d.items[0].stock_advice.state, "dismissed");
  assert.equal(d.items[1].stock_advice.state, "suggested");
  assert.equal(d.summary.stock_action_needed, 1);
  assert.equal(m.afterDismiss(null, "a"), null);
});
t("okuma sonucu metni ve uyarı", () => {
  assert.deepEqual(m.syncResult({ new: 3, errors: [] }), { text: "3 yeni iade talebi okundu.", kind: "success" });
  assert.deepEqual(m.syncResult({ new: 0, errors: [] }), { text: "Yeni iade talebi yok.", kind: "info" });
  assert.equal(m.syncResult({ new: 1, errors: [{ provider: "trendyol" }] }).kind, "error");
  assert.match(m.syncResult({ errors: [{}] }).text, /iade \(claims\) izni/);
  assert.equal(m.alertText(0), "");
  assert.equal(m.alertText(2), "2 iade için stoğa geri alma kararı bekliyor.");
});
console.log(`${n} test geçti`);
