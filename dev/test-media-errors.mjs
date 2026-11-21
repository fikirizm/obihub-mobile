// Birim testi: src/media-errors.ts (Faz A M5: yönetilen R2 görseli tüm firmalarda varsayılan). Sözleşme: yanıttaki image_url / images esas;
// 409 → ürün değişti, yeniden oku; 413/415/422 → görsel geçersiz ya da büyük; 503 → geçici. Çalıştırma: node dev/test-media-errors.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
async function load(rel) {
  const src = readFileSync(join(here, "../frontend/src", rel), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const m = await load("media-errors.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
t("hata metinleri", () => {
  assert.deepEqual(m.mediaError({ status: 409 }), { text: "Ürün başka bir işlemde değişti; görseller yeniden okundu. Gerekirse işlemi tekrarlayın.", reload: true });
  assert.equal(m.mediaError({ status: 413 }).text, "Görsel 10 MB'tan büyük; daha küçük bir görsel seçin.");
  assert.equal(m.mediaError({ status: 415 }).text, "Yalnız JPEG, PNG ya da WebP görsel yüklenebilir.");
  assert.equal(m.mediaError({ status: 422 }).text, "Görsel okunamadı ya da adresi geçersiz. Başka bir görsel deneyin.");
  assert.equal(m.mediaError({ status: 503 }).text, "Görsel depolama şu an kullanılamıyor. Biraz sonra yeniden deneyin.");
  assert.deepEqual(m.mediaError({ status: 400, message: "Ürün bulunamadı" }), { text: "Ürün bulunamadı", reload: false });
  assert.equal(m.mediaError({ status: 500, message: "Sunucu hatası (500)" }).text, "Görsel güncellenemedi.");
});
t("yanıttaki ana görsel esas: yoksa istenen", () => {
  assert.equal(m.mainFromResponse({ image_url: "https://r2/x.webp" }, "https://dis/x.jpg"), "https://r2/x.webp");
  assert.equal(m.mainFromResponse({ image_url: null }, "https://dis/x.jpg"), null);
  assert.equal(m.mainFromResponse({}, "https://dis/x.jpg"), "https://dis/x.jpg");
  assert.equal(m.mainFromResponse(null, null), null);
});
console.log(`${n} test geçti`);
