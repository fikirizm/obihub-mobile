// Birim testi: src/edoc-recipient.ts (e-belge yeniden deneme alıcı formu; web lib/edocRecipient.js + EdocRetryDialog.jsx,
// sunucu POST /local-invoices/{id}/edoc-retry → 422 RECIPIENT_INCOMPLETE {missing, suggested, individual_allowed}).
// Çalıştırma: node dev/test-edoc-recipient.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/edoc-recipient.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("VKN 10 hane, TCKN sağlama toplamıyla", () => {
  assert.equal(m.isValidVkn("1234567890"), true);
  assert.equal(m.isValidVkn("123456789"), false);
  assert.equal(m.isValidTckn("10000000146"), true);
  assert.equal(m.isValidTckn("10000000147"), false);
  assert.equal(m.isValidTckn("01234567890"), false);
});
t("422 RECIPIENT_INCOMPLETE → form; eksikler kanonik sırada, öneriler dolu", () => {
  const err = { status: 422, code: "RECIPIENT_INCOMPLETE", message: "Alıcı bilgisi eksik: VKN/TCKN, il.",
    data: { code: "RECIPIENT_INCOMPLETE", missing: ["tax_number", "city"], suggested: { city: "İzmir", district: "Bornova", tax_number: "11111111111" }, individual_allowed: true } };
  const f = m.retryForm(err);
  assert.deepEqual(f.missing, ["city", "tax_number"]);
  assert.equal(f.individualAllowed, true);
  assert.deepEqual(f.value, { city: "İzmir", district: "Bornova", tax_number: "11111111111", individual: false });
  assert.equal(m.retryForm({ status: 409, message: "x" }), null);
  assert.equal(m.retryForm({ status: 422, code: "RECIPIENT_INCOMPLETE", data: { missing: [] } }), null);
});
t("şirket carisi: bireysel standart numara önerilmez, kutu çıkmaz", () => {
  const f = m.retryForm({ status: 422, code: "RECIPIENT_INCOMPLETE", data: { missing: ["tax_number"], suggested: { city: "Ankara", district: "Çankaya", tax_number: "11111111111" }, individual_allowed: false } });
  assert.equal(f.individualAllowed, false);
  assert.equal(f.value.tax_number, "");
  assert.equal(f.value.individual, false);
});
t("bireysel izinli ve numara önerisi yoksa bireysel kutusu işaretli başlar", () => {
  const f = m.retryForm({ status: 422, code: "RECIPIENT_INCOMPLETE", data: { missing: ["tax_number"], suggested: { city: "Ankara", district: "Çankaya", tax_number: "" }, individual_allowed: true } });
  assert.equal(f.value.individual, true);
});
t("doğrulama: il/ilçe boş olamaz, VKN/TCKN geçerli olmalı (bireyselde gerekmez)", () => {
  assert.deepEqual(m.validateRecipient({ city: "", district: " ", tax_number: "", individual: false }, ["city", "district", "tax_number"], true),
    { city: "İl yazın", district: "İlçe yazın", tax_number: "10 haneli VKN ya da geçerli 11 haneli TCKN girin" });
  assert.deepEqual(m.validateRecipient({ city: "Ankara", district: "Çankaya", tax_number: "", individual: true }, ["tax_number"], true), {});
  assert.deepEqual(m.validateRecipient({ city: "Ankara", district: "Çankaya", tax_number: "", individual: true }, ["tax_number"], false),
    { tax_number: "10 haneli VKN ya da geçerli 11 haneli TCKN girin" });
  assert.deepEqual(m.validateRecipient({ city: "Ankara", district: "Çankaya", tax_number: "x" }, ["city"], true), {});
});
t("gövde: il/ilçe her zaman, numara yalnız eksikse (bireyselde 11111111111)", () => {
  assert.deepEqual(m.recipientBody({ city: " Ankara ", district: "Çankaya", tax_number: "1234567890", individual: false }, ["city"], true), { city: "Ankara", district: "Çankaya" });
  assert.deepEqual(m.recipientBody({ city: "Ankara", district: "Çankaya", tax_number: "1234567890", individual: false }, ["tax_number"], true), { city: "Ankara", district: "Çankaya", tax_number: "1234567890" });
  assert.deepEqual(m.recipientBody({ city: "Ankara", district: "Çankaya", tax_number: "", individual: true }, ["tax_number"], true), { city: "Ankara", district: "Çankaya", tax_number: "11111111111" });
});
t("sonuç metni: resmileşti / yeniden gönderildi / zaten var / yine düştü", () => {
  assert.deepEqual(m.retryResult({ edoc_state: "done", status: "resmilesti" }), { tone: "success", text: "E-belge düzenlendi; fatura resmileşti." });
  assert.deepEqual(m.retryResult({ edoc_state: "pending" }), { tone: "info", text: "E-belge yeniden gönderildi; sonuç bekleniyor. Birkaç dakika sonra durumu sorgulayabilirsiniz." });
  assert.deepEqual(m.retryResult({ synced: true, resent: false, edoc_state: "done", message: "Paraşüt'te e-belge zaten var; durum güncellendi, yeniden gönderilmedi." }),
    { tone: "success", text: "Paraşüt'te e-belge zaten var; durum güncellendi, yeniden gönderilmedi." });
  assert.deepEqual(m.retryResult({ edoc_state: "failed", edoc_error: "Alıcı VKN geçersiz" }), { tone: "error", text: "E-belge yine düzenlenemedi: Alıcı VKN geçersiz" });
});
t("cümle web'le aynı", () => {
  assert.equal(m.RETRY_SENTENCE, "Paraşüt'teki fatura korunur, yalnız e-belge yeniden denenir.");
});

console.log(`\n${n} test geçti`);
