// Birim testi: src/otp.ts — ilk girişte e-posta doğrulama kodu (6 hane). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md.
// Çalıştırma: node dev/test-otp.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/otp.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("kod: yalnız rakam, en çok 6; yapıştırılan metinden ayıklanır", () => {
  assert.equal(m.normalizeOtp("12 34-56"), "123456");
  assert.equal(m.normalizeOtp("Kodunuz: 482913. Paylaşmayın."), "482913");
  assert.equal(m.normalizeOtp("1234567"), "123456");
  assert.equal(m.normalizeOtp("ab"), "");
  assert.equal(m.OTP_LENGTH, 6);
});
t("tamam mı: tam 6 rakam", () => {
  assert.equal(m.otpComplete("123456"), true);
  assert.equal(m.otpComplete("12345"), false);
});
t("kutular: her hane ayrı; etkin kutu ilk boş (doluysa son)", () => {
  assert.deepEqual(m.otpBoxes("12"), ["1", "2", "", "", "", ""]);
  assert.equal(m.activeBox("12"), 2);
  assert.equal(m.activeBox("123456"), 5);
});
t("yeniden gönderme geri sayımı", () => {
  assert.equal(m.resendLabel(45), "Yeniden gönder (0:45)");
  assert.equal(m.resendLabel(65), "Yeniden gönder (1:05)");
  assert.equal(m.resendLabel(0), "Kodu yeniden gönder");
  assert.equal(m.secondsLeft(10_000, 1_000), 9);
  assert.equal(m.secondsLeft(10_000, 20_000), 0);
});
t("e-posta maskeleme (ekranda)", () => {
  assert.equal(m.maskEmail("ayse.kaya@example.test"), "ay•••••••@example.test");
  assert.equal(m.maskEmail("ab@x.co"), "a•@x.co");
  assert.equal(m.maskEmail(""), "");
});
console.log(`\n${n} test geçti`);
