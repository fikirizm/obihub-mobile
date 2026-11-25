// Birim testi: src/login-errors.ts (POST /auth/login makine okunur hata kodları; 13 Kas 2026 sözleşmesi).
// Çalıştırma: node dev/test-login-errors.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/login-errors.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const err = (status, code, message, retryAfter) => ({ status, code, message, retryAfter });

t("yanlış e-posta / şifre: tek ortak metin (hesap keşfi yok)", () => {
  assert.equal(m.loginErrorText(err(401, "INVALID_CREDENTIALS", "E-posta veya şifre hatalı")).text, "E-posta veya şifre hatalı.");
});
t("pasif hesap", () => {
  assert.match(m.loginErrorText(err(401, "ACCOUNT_INACTIVE", "x")).text, /aktif değil/);
});
t("abonelik duraklatılmış / süresi dolmuş: web'den yenileme yönlendirmesi", () => {
  const a = m.loginErrorText(err(403, "ACCOUNT_SUSPENDED", "Abonelik erişimi duraklatıldı."));
  assert.match(a.text, /duraklatıldı/); assert.equal(a.subscription, true);
  const b = m.loginErrorText(err(403, "SUBSCRIPTION_EXPIRED", "Aboneliğinizin süresi doldu."));
  assert.match(b.text, /süresi doldu/); assert.match(b.text, /web panelinden/); assert.equal(b.subscription, true);
});
t("çok fazla deneme: Retry-After'dan dakika, yoksa 15 dk; şifre sıfırlama önerisi", () => {
  assert.match(m.loginErrorText(err(429, "LOGIN_LOCKED", "x", 125)).text, /3 dakika/);
  assert.match(m.loginErrorText(err(429, "LOGIN_LOCKED", "x", 30)).text, /1 dakika/);
  assert.match(m.loginErrorText(err(429, "LOGIN_LOCKED", "x")).text, /15 dakika/);
  assert.match(m.loginErrorText(err(429, "LOGIN_LOCKED", "x")).text, /Şifremi unuttum/);
  assert.match(m.loginErrorText(err(429, "LOGIN_LOCKED", "x")).text, /destek/);
});
t("kodsuz hata: sunucu metni; o da yoksa genel metin; eski 403 davranışı korunur", () => {
  assert.equal(m.loginErrorText(err(500, undefined, "Sunucuda bir hata oluştu.")).text, "Sunucuda bir hata oluştu.");
  assert.equal(m.loginErrorText(err(0, undefined, "")).text, "Giriş başarısız oldu.");
  assert.equal(m.loginErrorText(err(403, undefined, "Engellendi.")).subscription, true);
});

t("24 Kas DPP: şifre süresi doldu (403 PASSWORD_EXPIRED) abonelik değil; şifre sıfırlamaya yönlendirir", () => {
  const v = m.loginErrorText({ status: 403, code: "PASSWORD_EXPIRED", message: "Şifrenizin süresi doldu (365 gün)." });
  assert.equal(v.subscription, false);
  assert.equal(v.reset, true);
  // PM sözleşmesi 25 Kas: sunucunun detail metni gösterilir; yoksa yedek metin.
  assert.equal(v.text, "Şifrenizin süresi doldu (365 gün).");
  assert.equal(m.loginErrorText({ status: 403, code: "PASSWORD_EXPIRED", message: "Sunucu hatası (403)" }).text,
    "Şifrenizin süresi doldu (365 gün). Lütfen 'Şifremi unuttum' ile yeni şifre belirleyin.");
  assert.equal(m.loginErrorText({ status: 429, code: "LOGIN_LOCKED", retryAfter: 60 }).reset, true);
  assert.equal(m.loginErrorText({ status: 401, code: "INVALID_CREDENTIALS" }).reset, false);
});
console.log(`\n${n} test geçti`);
