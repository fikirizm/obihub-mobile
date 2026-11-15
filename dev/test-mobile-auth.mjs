// Birim testi: src/mobile-auth.ts — yeni cihazda e-posta kodu ile giriş (docs/pm/tasarim/mobil-oturum-push.md §1).
// Çalıştırma: node dev/test-mobile-auth.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/mobile-auth.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("cihaz kimliği: UUID biçimi, sözleşmedeki karakter kümesi ve 8-128 uzunluk", () => {
  const id = m.newDeviceId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(m.deviceIdValid(id), true);
  assert.equal(m.deviceIdValid("kısa"), false);
  assert.equal(m.deviceIdValid("geçersiz karakter!"), false);
  assert.notEqual(m.newDeviceId(), m.newDeviceId());
});
t("kod isteme gövdesi: e-posta küçük harf; güvenilir cihaz belirteci varsa eklenir", () => {
  const ctx = { deviceId: "6f1c0000-aaaa-4bbb-8ccc-000000000001", deviceName: "iPhone", platform: "ios", appVersion: "1.1.14" };
  assert.deepEqual(m.requestCodeBody(" Ali@Ornek.Test ", "gizli", ctx, "trusted-1"), {
    email: "ali@ornek.test", password: "gizli", device_id: ctx.deviceId, device_name: "iPhone", platform: "ios", app_version: "1.1.14", device_token: "trusted-1" });
  assert.ok(!("device_token" in m.requestCodeBody("a@b.co", "x", ctx, null)));
  assert.deepEqual(m.verifyCodeBody("a@b.co", "123456", ctx), { email: "a@b.co", code: "123456", device_id: ctx.deviceId, device_name: "iPhone", platform: "ios", app_version: "1.1.14" });
});
t("kod isteme yanıtı: doğrulama gerekir (süre, yeniden gönderme) ya da güvenilir cihazda doğrudan oturum", () => {
  assert.deepEqual(m.loginStep({ success: true, verification_required: true, expires_in: 300, resend_after: 45, message: "Kod gönderildi." }),
    { kind: "verify", expiresIn: 300, resendAfter: 45, message: "Kod gönderildi." });
  assert.equal(m.loginStep({ access_token: "a", refresh_token: "r", skip_verification: true }).kind, "session");
  assert.equal(m.loginStep({ verification_required: true }).resendAfter, 45);
});
t("kod hataları: Türkçe metin; sunucu detail'i önce", () => {
  assert.equal(m.codeErrorText({ code: "CODE_INVALID" }), "Kod hatalı. Tekrar deneyin.");
  assert.equal(m.codeErrorText({ code: "CODE_EXPIRED" }), "Kodun süresi doldu. Yeni kod isteyin.");
  assert.equal(m.codeErrorText({ code: "CODE_LOCKED" }), "Çok fazla hatalı deneme. Yeni kod isteyin.");
  assert.equal(m.codeErrorText({ code: "CODE_INVALID", message: "Kod yanlış, 3 hakkınız kaldı." }), "Kod yanlış, 3 hakkınız kaldı.");
  assert.equal(m.codeNeedsNew({ code: "CODE_LOCKED" }), true);
  assert.equal(m.codeNeedsNew({ code: "CODE_INVALID" }), false);
});
t("yeni giriş uçları yoksa (eski sunucu, 404/405) eski girişe düşülür", () => {
  assert.equal(m.fallbackToLegacy({ status: 404 }), true);
  assert.equal(m.fallbackToLegacy({ status: 405 }), true);
  assert.equal(m.fallbackToLegacy({ status: 401, code: "INVALID_CREDENTIALS" }), false);
});
console.log(`\n${n} test geçti`);
