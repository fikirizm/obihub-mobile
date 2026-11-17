// UIScene yaşam döngüsü (17 Kas 2026). iOS 27 SDK ile derlenen ve UIScene'i benimsemeyen uygulama iOS 27'de açılışta UIKit assert'iyle
// kapanır (1.1.15 build 72: "`UIScene` lifecycle will soon be required. Failure to adopt will result in an assert in the future.").
// Expo SDK 54 şablonu pencereyi AppDelegate.didFinishLaunching'de kurar; bu eklenti:
//   1) Info.plist'e UIApplicationSceneManifest (tek sahne, SceneDelegate) ekler,
//   2) AppDelegate'ten pencere kurulumunu kaldırır, açılış seçeneklerini saklar (React Native fabrikası ve bağlantı işleyicileri yerinde),
//   3) SceneDelegate.swift üretip Xcode projesine ekler: pencere sahneden kurulur, React Native orada başlar; soğuk açılış bağlantısı
//      launchOptions'a (Linking.getInitialURL), sonraki bağlantılar ve evrensel bağlantılar AppDelegate/RCTLinkingManager'a gider.
// Eski SDK'lı (iOS 26, EAS bulut) derlemede de çalışır; iOS 13+ sahne yaşam döngüsüdür.
const { withAppDelegate, withDangerousMod, withInfoPlist, withXcodeProject, IOSConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARK = "// obihub: UIScene — pencere SceneDelegate'te kurulur";

function withSceneManifest(plist) {
  return {
    ...plist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" },
        ],
      },
    },
  };
}

function transformAppDelegate(src) {
  if (src.includes(MARK)) return src;
  const windowBlock = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;
  const decl = /(public class AppDelegate: ExpoAppDelegate \{\n\s*var window: UIWindow\?\n)/;
  if (!windowBlock.test(src) || !decl.test(src)) throw new Error("withUIScene: beklenen Expo 54 AppDelegate şablonu bulunamadı");
  return src
    .replace(decl, `$1  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`)
    .replace(windowBlock, `\n    ${MARK}\n    self.launchOptions = launchOptions\n`);
}

const SCENE_DELEGATE_SWIFT = `// obihub: UIScene yaşam döngüsü (plugins/withUIScene.js tarafından üretilir; elle düzenlemeyin).
import UIKit
import React

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // Soğuk açılışta gelen bağlantı. Sahnesiz yapıda iOS bunu AppDelegate.application(_:open:) ile verirdi; Expo Router başlangıç
    // bağlantısını expo-linking kaydından okur ve kayıt yalnız o çağrıyla dolar. Bu yüzden React Native başlamadan ÖNCE iletilir.
    // React Native Linking.getInitialURL ise launchOptions'tan okur; o da doldurulur.
    var options = appDelegate.launchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      options[.url] = context.url
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
    if let activity = connectionOptions.userActivities.first {
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
      options[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: options)
  }

  // Uygulama açıkken gelen bağlantılar (özel şema).
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  // Evrensel bağlantılar.
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function withUIScene(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = withSceneManifest(cfg.modResults);
    return cfg;
  });
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") throw new Error("withUIScene: Swift AppDelegate bekleniyor");
    cfg.modResults.contents = transformAppDelegate(cfg.modResults.contents);
    return cfg;
  });
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      fs.writeFileSync(path.join(cfg.modRequest.platformProjectRoot, name, "SceneDelegate.swift"), SCENE_DELEGATE_SWIFT);
      return cfg;
    },
  ]);
  config = withXcodeProject(config, (cfg) => {
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${name}/SceneDelegate.swift`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: cfg.modResults });
    }
    return cfg;
  });
  return config;
}

module.exports = withUIScene;
module.exports.withSceneManifest = withSceneManifest;
module.exports.transformAppDelegate = transformAppDelegate;
module.exports.SCENE_DELEGATE_SWIFT = SCENE_DELEGATE_SWIFT;
