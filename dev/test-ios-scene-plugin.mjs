// Birim testi: frontend/plugins/withUIScene.js — iOS 27 SDK'da UIScene yaşam döngüsü zorunlu (benimsemeyen uygulama açılışta assert'le
// kapanır; 1.1.15 build 72). Eklenti: Info.plist UIApplicationSceneManifest, AppDelegate'ten pencere kurulumunu kaldırma, SceneDelegate.
// Çalıştırma: node dev/test-ios-scene-plugin.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const p = require("../frontend/plugins/withUIScene.js");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const APP_DELEGATE = readFileSync(join(here, "fixtures/AppDelegate.expo54.swift"), "utf8");

t("sahne tanımı: tek sahne, varsayılan yapılandırma, SceneDelegate sınıfı", () => {
  const plist = p.withSceneManifest({ CFBundleName: "obihub" });
  assert.equal(plist.CFBundleName, "obihub");
  const m = plist.UIApplicationSceneManifest;
  assert.equal(m.UIApplicationSupportsMultipleScenes, false);
  const cfg = m.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(cfg.length, 1);
  assert.equal(cfg[0].UISceneConfigurationName, "Default Configuration");
  assert.equal(cfg[0].UISceneDelegateClassName, "$(PRODUCT_MODULE_NAME).SceneDelegate");
});
t("AppDelegate: pencere artık didFinishLaunching'de kurulmaz; açılış seçenekleri saklanır; fabrika ve Linking yerinde", () => {
  const out = p.transformAppDelegate(APP_DELEGATE);
  assert.ok(!/window = UIWindow\(frame: UIScreen\.main\.bounds\)/.test(out), "eski pencere kurulumu kalmamalı");
  assert.ok(!/factory\.startReactNative\(/.test(out), "React Native başlangıcı AppDelegate'te kalmamalı");
  assert.match(out, /var launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\?/);
  assert.match(out, /self\.launchOptions = launchOptions/);
  assert.match(out, /bindReactNativeFactory\(factory\)/);
  assert.match(out, /RCTLinkingManager\.application\(app, open: url, options: options\)/);
  assert.match(out, /return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/);
});
t("AppDelegate dönüşümü iki kez uygulanınca değişmez; beklenmeyen şablonda hata verir", () => {
  const once = p.transformAppDelegate(APP_DELEGATE);
  assert.equal(p.transformAppDelegate(once), once);
  assert.throws(() => p.transformAppDelegate("class AppDelegate {}"), /AppDelegate/);
});
t("SceneDelegate: pencere sahneden, React Native başlatılır, soğuk açılış bağlantısı launchOptions'a, sonraki bağlantılar Linking'e", () => {
  const s = p.SCENE_DELEGATE_SWIFT;
  assert.match(s, /class SceneDelegate: UIResponder, UIWindowSceneDelegate/);
  assert.match(s, /UIWindow\(windowScene: windowScene\)/);
  assert.match(s, /startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: options\)/);
  assert.match(s, /appDelegate\.window = window/);
  assert.match(s, /\.url\] = context\.url|\[\.url\] = /);
  // Soğuk açılış: Expo Router başlangıç bağlantısını expo-linking kaydından okur; kayıt AppDelegate.application(_:open:) ile dolar.
  // Bu çağrı React Native başlamadan ÖNCE yapılmalı (17 Kas: simülatörde soğuk bağlantı giriş ekranında kaldı).
  const willConnect = s.slice(s.indexOf("willConnectTo"), s.indexOf("openURLContexts"));
  const coldOpen = willConnect.indexOf("appDelegate.application(UIApplication.shared, open: context.url");
  assert.ok(coldOpen > 0, "soğuk açılış bağlantısı AppDelegate'e iletilmeli");
  assert.ok(coldOpen < willConnect.indexOf("startReactNative("), "React Native'den önce iletilmeli");
  assert.ok(willConnect.indexOf("appDelegate.application(UIApplication.shared, continue: activity") > 0, "evrensel bağlantı da iletilmeli");
  assert.match(s, /openURLContexts/);
  assert.match(s, /continue userActivity/);
});

console.log(`\n${n} test geçti`);
