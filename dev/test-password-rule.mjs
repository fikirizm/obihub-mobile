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

// 24 Kas 2026 (Amazon DPP, backend/password_policy.py + web lib/passwordPolicy.js): en az 12 karakter; büyük harf, küçük harf,
// rakam ve özel karakter; e-postanın yerel kısmı ya da adın (≥4 harf) bir parçası geçemez. Son 10 şifre yalnız sunucuda.
const WEAK = "Şifre en az 12 karakter olmalı; büyük harf, küçük harf, rakam ve özel karakter içermeli.";
const NAME = "Şifre e-posta adresinizin ya da adınızın bir bölümünü içeremez.";
t("ipucu metni web'le aynı", () => {
  assert.equal(m.PASSWORD_HINT, "En az 12 karakter; büyük harf, küçük harf, rakam ve özel karakter içermeli");
});
t("en az 12 karakter, dört karakter türü", () => {
  assert.equal(m.passwordProblem("Kısa1!abc", email), WEAK);
  assert.equal(m.passwordProblem("Uzunsifre123!", email), null);
  assert.equal(m.passwordProblem("uzunsifre123!", email), WEAK);     // büyük harf yok
  assert.equal(m.passwordProblem("UZUNSIFRE123!", email), WEAK);     // küçük harf yok
  assert.equal(m.passwordProblem("Uzunsifreabc!", email), WEAK);     // rakam yok
  assert.equal(m.passwordProblem("Uzunsifre1234", email), WEAK);     // özel karakter yok
  assert.equal(m.passwordProblem("Şğüıöçİabc12.", email), null);     // Türkçe harfler sayılır
});
t("e-postanın yerel kısmı ve ad parçaları geçemez (≥4 harf, Türkçe katlama)", () => {
  assert.equal(m.passwordProblem("Xayse.yilmaz9!", "ayse.yilmaz@example.test"), NAME);
  assert.equal(m.passwordProblem("YILMAZ2026!!x", "ayse.yilmaz@example.test"), NAME);
  assert.equal(m.passwordProblem("Gizli-Kapı2026", "ali@example.test"), null);        // "ali" 4 harften kısa
  assert.equal(m.passwordProblem("Mehmet.2026!x", "m@example.test", "Mehmet Kaya"), NAME);
  assert.equal(m.passwordProblem("İSTANBUL.2026x", "istanbul@example.test"), NAME);
});
t("sunucu PASSWORD_WEAK: sunucunun metni gösterilir, yoksa kural metni", () => {
  assert.equal(m.resetErrorText(Object.assign(new Error("Şifre çok zayıf."), { status: 400, code: "PASSWORD_WEAK" })), "Şifre çok zayıf.");
  assert.equal(m.resetErrorText({ status: 400, code: "PASSWORD_WEAK", message: "" }), WEAK);
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
