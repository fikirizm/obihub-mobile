// Birim testi: dev/check-ios-build.mjs kuralı. Çalıştırma: node dev/test-check-ios-build.mjs
import assert from "node:assert/strict";
import { verdict } from "./check-ios-build.mjs";
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
t("iOS 27 SDK + UIScene yok → HATA (build 72 durumu)", () => { assert.equal(verdict({ sdk: "iphoneos27.2", sceneManifest: false }).ok, false); });
t("iOS 26 SDK (EAS bulut) + UIScene yok → uygun", () => { assert.equal(verdict({ sdk: "iphoneos26.2", sceneManifest: false }).ok, true); });
t("iOS 27 SDK + UIScene var → uygun", () => { assert.equal(verdict({ sdk: "iphoneos27.2", sceneManifest: true }).ok, true); });
console.log(`\n${n} test geçti`);
