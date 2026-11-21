// Birim testi: src/dispatch-form.ts (P5.1 elle / gelen irsaliye formu). Sunucu: routers/dispatch_notes.py POST /dispatch-notes
// (Idempotency-Key). Web: pages/stock/DispatchNoteFormPage.jsx (gövde ve doğrulama aynı). Çalıştırma: node dev/test-dispatch-form.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/dispatch-form.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const filled = () => ({
  ...m.blankDispatch("in", "2026-11-22"),
  party_name: " Usta Market ", party_tax_no: "1234567890", address: "Atatürk Cad. 5", city: "İzmir", number: " A-77 ", carrier: "Aras", tracking_no: "AR1",
});

t("boş form: yön, tarih bugün, kargo yöntemi", () => {
  const f = m.blankDispatch("out", "2026-11-22");
  assert.equal(f.direction, "out");
  assert.equal(f.issue_date, "2026-11-22");
  assert.equal(f.shipment_date, "2026-11-22");
  assert.equal(f.shipment_method, "cargo");
  assert.equal(m.partyLabel("in"), "Tedarikçi");
  assert.equal(m.partyLabel("out"), "Alıcı");
});
t("ürün satırı: varsayılan depo, birim küçük harf; açıklama satırı depo almaz", () => {
  assert.deepEqual(m.itemLine({ id: "p1", name: "Kupa", sku: "K1", unit: "ADET" }, "w1"), { product_id: "p1", name: "Kupa", sku: "K1", unit: "adet", qty: "1", warehouse_id: "w1" });
  assert.deepEqual(m.textLine(), { product_id: null, name: "", sku: "", unit: "adet", qty: "1", warehouse_id: "" });
  assert.equal(m.defaultWarehouse([{ id: "a", name: "B" }, { id: "b", name: "A", is_default: true }, { id: "c", archived: true, is_default: true }]), "b");
  assert.equal(m.defaultWarehouse([]), "");
});
t("doğrulama: karşı taraf adı, tarih, satır, miktar (4 ondalık), açıklama, şoför TCKN", () => {
  const f = filled();
  assert.deepEqual(m.validateDispatch({ ...f, party_name: " " }, [m.textLine()]).party_name, "Tedarikçi adı zorunlu.");
  assert.equal(m.validateDispatch({ ...f, issue_date: "" }, [{ ...m.textLine(), name: "x" }]).issue_date, "Düzenleme tarihi zorunlu.");
  assert.equal(m.validateDispatch(f, []).lines, "En az bir satır ekleyin.");
  assert.equal(m.validateDispatch(f, [{ ...m.textLine(), name: "x", qty: "0" }]).lines, "Miktarlar sıfırdan büyük olmalı (en çok 4 ondalık).");
  assert.equal(m.validateDispatch(f, [{ ...m.textLine(), name: "x", qty: "1,23456" }]).lines, "Miktarlar sıfırdan büyük olmalı (en çok 4 ondalık).");
  assert.equal(m.validateDispatch(f, [m.textLine()]).lines, "Açıklama satırlarına metin yazın.");
  assert.equal(m.validateDispatch({ ...f, shipment_method: "carrier", driver_tckn: "123" }, [{ ...m.textLine(), name: "x" }]).driver_tckn, "T.C. kimlik no 11 haneli olmalı.");
  assert.deepEqual(m.validateDispatch(f, [{ ...m.textLine(), name: "x", qty: "2,5" }]), {});
  assert.equal(m.validateDispatch({ ...f, issue_date: "22.11.2026" }, [{ ...m.textLine(), name: "x" }]).issue_date, "Tarihi YYYY-AA-GG biçiminde yazın.");
  assert.equal(m.validateDispatch({ ...f, shipment_date: "dün" }, [{ ...m.textLine(), name: "x" }]).shipment_date, "Tarihi YYYY-AA-GG biçiminde yazın.");
});
t("gövde (kargo): kırpma, numara yalnız doluysa, depo yalnız ürün satırında, miktar noktalı", () => {
  const b = m.dispatchBody(filled(), [m.itemLine({ id: "p1", name: "Kupa", unit: "adet" }, "w1"), { ...m.textLine(), name: " Ambalaj ", qty: "2,5" }]);
  assert.equal(b.direction, "in");
  assert.equal(b.party_name, "Usta Market");
  assert.equal(b.number, "A-77");
  assert.equal(b.customer_id, null);
  assert.deepEqual(b.shipment_address, { address: "Atatürk Cad. 5", district: "", city: "İzmir", postal_code: "" });
  assert.deepEqual(b.cargo, { carrier: "Aras", tracking_no: "AR1" });
  assert.deepEqual(b.drivers, []);
  assert.equal(b.vehicle_plate, "");
  assert.deepEqual(b.lines, [{ quantity: "1", unit: "adet", product_id: "p1", product_name: "Kupa", warehouse_id: "w1" }, { quantity: "2.5", unit: "adet", description: "Ambalaj" }]);
  assert.equal("number" in m.dispatchBody({ ...filled(), number: " " }, []), false);
});
t("gövde (taşıyıcı): şoför, plaka büyük harf, dorse; kargo null", () => {
  const b = m.dispatchBody({ ...filled(), shipment_method: "carrier", driver_name: "Ali Kaya", driver_tckn: "12345678901", plate: "34 abc 123", trailer: "34 d 1" }, []);
  assert.equal(b.cargo, null);
  assert.deepEqual(b.drivers, [{ name: "Ali Kaya", tckn: "12345678901" }]);
  assert.equal(b.vehicle_plate, "34 ABC 123");
  assert.deepEqual(b.trailer_plates, ["34 D 1"]);
  assert.equal(m.dispatchBody({ ...filled(), shipment_method: "carrier" }, []).drivers.length, 0);
});
t("kayıt sonrası metin yöne göre", () => {
  assert.equal(m.savedText("out"), "İrsaliye kaydedildi; stok düşüldü.");
  assert.equal(m.savedText("in"), "İrsaliye kaydedildi; stok girildi.");
});
console.log(`${n} test geçti`);
