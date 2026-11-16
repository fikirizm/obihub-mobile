// Birim testi: src/password-rule.ts (şifre sıfırlama kuralı: en az 8, harf + rakam, e-postayla aynı değil; sunucu 400 PASSWORD_WEAK).
// Çalıştırma: node dev/test-password-rule.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/password-rule.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const email = "ayse@example.test";

t("ipucu metni kuralı söyler", () => {
  assert.equal(m.PASSWORD_HINT, "En az 8 karakter, harf ve rakam");
});
t("kısa şifre: en az 8 karakter", () => {
  assert.match(m.passwordProblem("abc123", email), /en az 8/);
  assert.match(m.passwordProblem("abcde12", email), /en az 8/);
  assert.equal(m.passwordProblem("abcdef12", email), null);
});
t("harf ve rakam zorunlu (Türkçe harfler harf sayılır)", () => {
  assert.match(m.passwordProblem("12345678", email), /harf/);
  assert.match(m.passwordProblem("abcdefgh", email), /rakam/);
  assert.equal(m.passwordProblem("şğüıöç12", email), null);
});
t("e-postayla aynı olamaz (büyük/küçük harf ve boşluk fark etmez)", () => {
  assert.match(m.passwordProblem("ayse1@example.test", "ayse1@example.test"), /e-posta/);
  assert.match(m.passwordProblem("AYSE1@EXAMPLE.TEST", " ayse1@example.test "), /e-posta/);
  assert.equal(m.passwordProblem("ayse1@example.test2", "ayse1@example.test"), null);
});
t("sunucu PASSWORD_WEAK: sunucunun metni gösterilir, yoksa kural metni", () => {
  assert.equal(m.resetErrorText(Object.assign(new Error("Şifre çok zayıf."), { status: 400, code: "PASSWORD_WEAK" })), "Şifre çok zayıf.");
  assert.match(m.resetErrorText({ status: 400, code: "PASSWORD_WEAK", message: "" }), /en az 8/);
  assert.equal(m.resetErrorText({ status: 400, message: "Kod geçersiz" }), "Kod geçersiz");
  assert.match(m.resetErrorText({}), /Kodu kontrol/);
});

t("17 Kas: mobil şifre sıfırlama kodu yeni uçtan (Turnstile yok)", () => {
  assert.equal(m.RESET_REQUEST_PATH, "/auth/mobile/password-reset/request-code");
});
t("17 Kas: kod isteme hataları — 429 bekleme süresiyle, 422 biçim, MAIL_UNAVAILABLE", () => {
  assert.equal(m.requestCodeErrorText({ status: 429, code: "RATE_LIMITED", retryAfter: 45, message: "Çok sık." }), "Çok sık istek gönderildi. 45 saniye sonra yeniden deneyin.");
  assert.equal(m.requestCodeErrorText({ status: 429, retryAfter: 600, message: "" }), "Çok sık istek gönderildi. 10 dakika sonra yeniden deneyin.");
  assert.equal(m.requestCodeErrorText({ status: 429, message: "Sunucu metni." }), "Sunucu metni.");
  assert.equal(m.requestCodeErrorText({ status: 422, message: "Sunucu hatası (422)" }), "Geçerli bir e-posta adresi girin.");
  assert.match(m.requestCodeErrorText({ status: 400, code: "MAIL_UNAVAILABLE", message: "" }), /e-posta gönderimi/i);
  assert.equal(m.requestCodeErrorText({ status: 500, message: "" }), "Kod gönderilemedi. Lütfen tekrar deneyin.");
});
t("17 Kas: onay hata kodları", () => {
  assert.match(m.resetErrorText({ code: "CODE_INVALID", message: "" }), /hatalı/);
  assert.match(m.resetErrorText({ code: "CODE_LOCKED", message: "" }), /5 yanlış deneme/);
  assert.match(m.resetErrorText({ code: "CODE_EXPIRED", message: "" }), /süresi doldu/);
  assert.match(m.resetErrorText({ code: "CODE_NOT_FOUND", message: "" }), /yeni kod/i);
  assert.equal(m.resetErrorText({ code: "CODE_INVALID", message: "Kod hatalı, 3 deneme kaldı." }), "Kod hatalı, 3 deneme kaldı.");
});
console.log(`\n${n} test geçti`);
