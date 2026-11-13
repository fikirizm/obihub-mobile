// Birim testi: src/hepsijet-ui.ts (HepsiJet Menü'de yalnız entegrasyonu kurulu ve etkin firmada; alıcı formu doğrulaması).
// Çalıştırma: node dev/test-hepsijet-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/hepsijet-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

// Düzeltme (PM 13 Kas 2026): HepsiJet bir entegrasyon kaydı değildir (ayar user_settings.hepsijet). Görünürlük
// GET /hepsijet/config → { configured: true } ile belirlenir; /integrations listesine bakılmaz.
t("GET /hepsijet/config configured:true → görünür", () => {
  assert.equal(m.hepsiJetVisible({ configured: true, username: "u", company_name: "Fikirizm" }), true);
  assert.equal(m.hepsiJetVisible({ configured: true }), true);
});
t("configured false, eksik, metin ya da okunamadı (null) → gizli", () => {
  assert.equal(m.hepsiJetVisible({ configured: false }), false);
  assert.equal(m.hepsiJetVisible({}), false);
  assert.equal(m.hepsiJetVisible({ configured: "true" }), false);
  assert.equal(m.hepsiJetVisible(null), false);
  assert.equal(m.hepsiJetVisible(undefined), false);
});
t("/integrations listesinde hepsijet olmaması sonucu etkilemez; eski liste kontrolü kaldırıldı", () => {
  assert.equal(m.hepsiJetVisible({ configured: true, integration_id: null }), true);
  assert.equal(m.hasHepsiJet, undefined);
});

const ok = { full_name: "Örnek Butik", phone: "0555 111 22 33", email: "", city: "İstanbul", town: "Kadıköy", district: "Moda", address_line: "Örnek Sk. 1" };
t("alıcı formu: zorunlu alanlar ve telefon", () => {
  assert.equal(m.recipientError(ok), null);
  assert.match(m.recipientError({ ...ok, full_name: " " }), /Ad soyad/);
  assert.match(m.recipientError({ ...ok, phone: "555 12" }), /10 haneli/);
  assert.match(m.recipientError({ ...ok, district: "" }), /İl, ilçe ve mahalle/);
  assert.match(m.recipientError({ ...ok, address_line: "" }), /Adres/);
});
t("alıcı listesi araması: isim, telefon, il/ilçe/mahalle, e-posta; Türkçe büyük-küçük harf", () => {
  const list = [{ id: "1", ...ok }, { id: "2", ...ok, full_name: "Demo Spor", phone: "0532 000 00 00", city: "İzmir", town: "Bornova", district: "Kazımdirik" }];
  assert.deepEqual(m.filterRecipients(list, "izmir").map((x) => x.id), ["2"]);
  assert.deepEqual(m.filterRecipients(list, "İSTANBUL").map((x) => x.id), ["1"]);
  assert.deepEqual(m.filterRecipients(list, "0532").map((x) => x.id), ["2"]);
  assert.deepEqual(m.filterRecipients(list, "  ").map((x) => x.id), ["1", "2"]);
});

console.log(`\n${n} test geçti`);
