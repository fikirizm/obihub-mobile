// Xcode 27+ iOS 15'ten eski hedefli Pod'ları hata sayar ("IPHONEOS_DEPLOYMENT_TARGET is set to 9.0/12.0/12.4"; ReachabilitySwift,
// RNSVG, SDWebImage). Üretilen Podfile'ın post_install'ına, uygulamanın hedefinden (15.1) eski Pod hedeflerini 15.1'e yükselten adım eklenir.
// Davranış değişmez: uygulama zaten iOS 15.1 ve üstünde çalışır. Eski Xcode'lu (EAS bulut) derlemede de zararsızdır.
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MIN = "15.1";
const MARK = "# obihub: pod deployment target";
const SNIPPET = `
    ${MARK}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        current = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < ${MIN}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end
`;

function patchPodfile(src) {
  if (src.includes(MARK)) return src;
  const m = /(post_install do \|installer\|\n[\s\S]*?react_native_post_install\([\s\S]*?\n\s*\)\n)/.exec(src);
  if (!m) throw new Error("withPodsDeploymentTarget: Podfile post_install bulunamadı");
  return src.replace(m[1], m[1] + SNIPPET);
}

module.exports = function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      fs.writeFileSync(file, patchPodfile(fs.readFileSync(file, "utf8")));
      return cfg;
    },
  ]);
};
module.exports.patchPodfile = patchPodfile;
