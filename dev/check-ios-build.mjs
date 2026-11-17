// iOS derleme denetimi (17 Kas 2026, 1.1.15 build 72 açılış çökmesi). iOS 27 SDK ile derlenen ve UIScene yaşam döngüsünü benimsemeyen
// (Info.plist'te UIApplicationSceneManifest yok) uygulama iOS 27'de açılışta UIKit assert'iyle kapanır. iOS 26'da bu yalnız uyarıdır:
// "`UIScene` lifecycle will soon be required. Failure to adopt will result in an assert in the future."
// Kullanım: node dev/check-ios-build.mjs <.app | .xcarchive | .ipa> — TestFlight'a göndermeden önce çalıştırılır; hata varsa çıkış kodu 1.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function verdict({ sdk, sceneManifest }) {
  const m = /^iphone(?:os|simulator)(\d+)/.exec(String(sdk || ""));
  const major = m ? Number(m[1]) : 0;
  if (major >= 27 && !sceneManifest)
    return { ok: false, text: `iOS ${major} SDK ile derlenmiş ama UIScene yok (UIApplicationSceneManifest eksik): iOS 27'de açılışta çöker. Eski Xcode (≤26) ile derleyin ya da UIScene'e geçin.` };
  return { ok: true, text: `SDK ${sdk || "?"}, UIScene ${sceneManifest ? "var" : "yok"}: uygun.` };
}

function appPathOf(input) {
  if (input.endsWith(".app")) return input;
  if (input.endsWith(".xcarchive")) {
    const dir = join(input, "Products/Applications");
    return join(dir, readdirSync(dir).find((n) => n.endsWith(".app")));
  }
  if (input.endsWith(".ipa")) {
    const tmp = mkdtempSync(join(tmpdir(), "ipa-"));
    execFileSync("unzip", ["-q", input, "Payload/*", "-d", tmp]);
    const dir = join(tmp, "Payload");
    return join(dir, readdirSync(dir).find((n) => n.endsWith(".app")));
  }
  throw new Error("Desteklenmeyen yol: .app, .xcarchive ya da .ipa verin");
}

function readPlist(app, key) {
  try {
    return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(app, "Info.plist")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

if (process.argv[2]) {
  const app = appPathOf(process.argv[2]);
  if (!existsSync(join(app, "Info.plist"))) throw new Error("Info.plist bulunamadı: " + app);
  const v = verdict({ sdk: readPlist(app, "DTSDKName"), sceneManifest: readPlist(app, "UIApplicationSceneManifest") !== null });
  console.log((v.ok ? "UYGUN — " : "HATA — ") + v.text);
  process.exit(v.ok ? 0 : 1);
}
