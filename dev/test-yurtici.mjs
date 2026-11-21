// Birim testi: src/yurtici.ts (Dalga 5b Yurtiçi Kargo: gönderi oluştur / iptal / etiket). Sunucu: backend/yurtici_shipping.py
// POST /yurtici/shipments|shipments/cancel {order_ids ≤20} → {results:[{order_id, success, status, message, barcode}]},
// POST /yurtici/labels {order_ids ≤100, format} → {success, format, filename, data|text, skipped}. Web: components/orders/yurticiShipping.js.
// Çalıştırma: node dev/test-yurtici.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/yurtici.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("etkin gönderi: sağlayıcı yurtici, durum created ve takip no", () => {
  assert.equal(m.hasActiveShipment({ cargo_provider: "Yurtici", cargo_status: "created", cargo_tracking: "YK1" }), true);
  assert.equal(m.hasActiveShipment({ cargo_provider: "yurtici", cargo_status: "cancelled", cargo_tracking: "YK1" }), false);
  assert.equal(m.hasActiveShipment({ cargo_provider: "aras", cargo_status: "created", cargo_tracking: "A1" }), false);
});
t("oluşturma engeli: iptal/silinmiş, pazaryeri kargosu, başka takip", () => {
  assert.match(m.createBlockReason({ status: "cancelled" }), /iptal/);
  assert.match(m.createBlockReason({ channel: "trendyol" }), /pazaryerinin kendi kargosu/);
  assert.match(m.createBlockReason({ channel: "website", n11_cargo_tracking: "N1" }), /N11/);
  assert.match(m.createBlockReason({ channel: "woocommerce", cargo_tracking: "A1", cargo_provider: "aras" }), /başka bir kargo/);
  assert.equal(m.createBlockReason({ channel: "website", status: "pending" }), "");
  assert.equal(m.createBlockReason({ channel: "website", cargo_tracking: "YK1", cargo_provider: "yurtici" }), "");
});
t("iptal istendi (doğrulanamadı) durumu: yeniden denenebilir", () => {
  assert.equal(m.cancelRequested({ yurtici_cancel_status: "requested" }), true);
  assert.equal(m.cancelRequested({}), false);
});
t("eylemler: bağlı değilse yok; yetki ve durum", () => {
  const o = { channel: "website", status: "pending" };
  assert.deepEqual(m.actions(o, { connected: false, canEdit: true, canView: true }), { create: false, cancel: false, label: false, blockReason: "" });
  assert.deepEqual(m.actions(o, { connected: true, canEdit: true, canView: true }), { create: true, cancel: false, label: false, blockReason: "" });
  const act = { ...o, cargo_provider: "yurtici", cargo_status: "created", cargo_tracking: "YK1" };
  assert.deepEqual(m.actions(act, { connected: true, canEdit: true, canView: true }), { create: false, cancel: true, label: true, blockReason: "" });
  assert.deepEqual(m.actions(act, { connected: true, canEdit: false, canView: true }), { create: false, cancel: false, label: true, blockReason: "" });
  assert.equal(m.actions({ ...o, yurtici_cancel_status: "requested" }, { connected: true, canEdit: true, canView: true }).cancel, true);
  assert.equal(m.actions({ channel: "trendyol" }, { connected: true, canEdit: true, canView: true }).blockReason, "pazaryerinin kendi kargosuyla gider");
});
t("tek sipariş sonucu: sunucu mesajı; iptal istendi uyarı", () => {
  assert.deepEqual(m.resultText({ results: [{ order_id: "o1", success: true, status: "created", message: "Gönderi oluşturuldu.", barcode: "YK1" }] }, "Gönderi oluşturuldu."), { kind: "success", text: "Gönderi oluşturuldu." });
  assert.deepEqual(m.resultText({ results: [{ order_id: "o1", success: false, status: "error", message: "Pazaryeri siparişi." }] }, "x"), { kind: "error", text: "Pazaryeri siparişi." });
  assert.equal(m.resultText({ results: [{ order_id: "o1", success: false, status: "cancel_requested", message: "İptal istendi ancak doğrulanamadı." }] }, "x").kind, "info");
  assert.deepEqual(m.resultText({ results: [] }, "Tamam"), { kind: "error", text: "Yurtiçi Kargo yanıt vermedi. Biraz sonra yeniden deneyin." });
});
t("etiket: PDF base64 dosyaya; ZPL metin; başarısızda mesaj", () => {
  assert.deepEqual(m.labelFile({ success: true, format: "pdf", filename: "yurtici-1.pdf", data: "JVBE" }), { ok: true, kind: "pdf", name: "yurtici-1.pdf", base64: "JVBE" });
  assert.deepEqual(m.labelFile({ success: true, format: "zpl", text: "^XA^XZ" }), { ok: true, kind: "zpl", name: "yurtici-etiket.zpl", text: "^XA^XZ" });
  assert.deepEqual(m.labelFile({ success: false, message: "Etiketi basılacak Yurtiçi gönderisi yok." }), { ok: false, text: "Etiketi basılacak Yurtiçi gönderisi yok." });
  assert.deepEqual(m.labelBody("o1", "pdf"), { order_ids: ["o1"], format: "pdf" });
});
console.log(`${n} test geçti`);
