// Birim testi: src/pos-quick-customer.ts (geri bildirim 2 / G2b: POS'ta adla hızlı müşteri). Web: pages/POSPage.js
// createCustomerFromSearch. Sunucu: GET /customers?search=<regex>&per_page=100 (kesin ad sorgusu), POST /customers {name, contact_role}.
// Çalıştırma: node dev/test-pos-quick-customer.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
// Göreli içe aktarmalar (./pos-money) aynı yolla data: URL'sine çevrilir.
function url(rel) {
  const src = readFileSync(join(here, "../frontend/src", rel), "utf8");
  let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/from "\.\/([\w-]+)"/g, (_, f) => `from "${url(f + ".ts")}"`);
  return "data:text/javascript;base64," + Buffer.from(js).toString("base64");
}
const load = (rel) => import(url(rel));
const m = await load("pos-quick-customer.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const reg = (id, name, role = "customer") => ({ id, name, source: "registered", contact_role: role, balance: 0 });

t("ad temizliği: boşluklar tekleşir, 200 karakterle sınırlı", () => {
  assert.equal(m.cleanName("  Ayşe   Kara "), "Ayşe Kara");
  assert.equal(m.cleanName("x".repeat(250)).length, 200);
  assert.equal(m.sameName("AYŞE  kara", "ayşe kara"), true);
  assert.equal(m.sameName("Işık", "ışık"), true);
  assert.equal(m.sameName("Ayşe", "Ayşe Kara"), false);
});
t("kesin sorgu yolu: per_page=100, rol süzgeci yok, regex kaçışlı", () => {
  assert.equal(m.probePath("A.Ş. (Merkez)"), "/customers?search=A%5C.%C5%9E%5C.+%5C%28Merkez%5C%29&per_page=100");
});
t("seçici seçeneği: boş arama ve yüklenirken hiçbir şey", () => {
  assert.deepEqual(m.quickOption({ term: " ", loading: false, failed: false, results: [] }), { kind: "none" });
  assert.deepEqual(m.quickOption({ term: "Ali", loading: true, failed: false, results: [] }), { kind: "none" });
});
t("arama hata verdiyse yeni oluştur gizli, 'aranamadı' uyarısı", () => {
  const o = m.quickOption({ term: "Ali", loading: false, failed: true, results: [] });
  assert.equal(o.kind, "failed");
  assert.match(m.SEARCH_FAILED_TEXT, /aranamadı/);
});
t("sonuçlarda aynı adlı seçilebilir kart varsa öneri, yoksa oluştur", () => {
  const ali = reg("c1", "Ali Veli");
  assert.deepEqual(m.quickOption({ term: "ali  veli", loading: false, failed: false, results: [ali] }), { kind: "suggest", party: ali });
  assert.deepEqual(m.quickOption({ term: "Ali", loading: false, failed: false, results: [ali] }), { kind: "create", name: "Ali" });
  assert.equal(m.createLabel("Ali"), "“Ali” adıyla yeni müşteri oluştur");
});
t("kesin sorgu: seçilebilir kayıtlı kart varsa o seçilir, 'zaten kayıtlı'", () => {
  const r = m.resolveProbe([reg("s1", "Ali Veli", "supplier"), reg("c1", "Ali Veli")], "Ali Veli");
  assert.equal(r.kind, "existing");
  assert.equal(r.party.id, "c1");
  assert.match(m.existingText(r.party), /“Ali Veli” zaten kayıtlı; mevcut kart seçildi/);
});
t("kesin sorgu: yalnız tedarikçi kartı eşleşiyorsa ikinci kart açılmaz, açıklayıcı hata", () => {
  const r = m.resolveProbe([reg("s1", "Ali Veli", "supplier")], "ali veli");
  assert.equal(r.kind, "blocked");
  assert.match(r.text, /tedarikçi/);
  assert.match(r.text, /Cariler/);
});
t("kesin sorgu: 'both' rolü seçilebilir", () => {
  assert.equal(m.resolveProbe([reg("b1", "Ali", "both")], "Ali").kind, "existing");
});
t("kesin sorgu: yalnız siparişten gelen kişi ya da benzer ad eşleşiyorsa kart açılır", () => {
  assert.deepEqual(m.resolveProbe([{ id: "o:x", name: "Ali", source: "orders", balance: 0 }, reg("c2", "Ali Can")], "Ali"), { kind: "create" });
  assert.deepEqual(m.resolveProbe([], "Ali"), { kind: "create" });
});
t("oluşturma gövdesi yalnız ad ve müşteri rolü", () => {
  assert.deepEqual(m.createBody("  Yeni   Kişi "), { name: "Yeni Kişi", contact_role: "customer" });
});
t("oluşan kart: id yoksa hata, varsa seçilecek cari", () => {
  assert.equal(m.createdParty(null, "Ali"), null);
  assert.deepEqual(m.createdParty({ id: "n1" }, "Ali"), { id: "n1", name: "Ali" });
  assert.deepEqual(m.createdParty({ id: "n1", name: "Ali K" }, "Ali"), { id: "n1", name: "Ali K" });
  assert.match(m.createdText("Ali"), /“Ali” için cari kartı açıldı/);
});
t("hata metni: sunucu mesajı varsa o, yoksa genel", () => {
  assert.equal(m.createErrorText({ message: "Ad zorunlu." }), "Ad zorunlu.");
  assert.equal(m.createErrorText({}), "Müşteri kartı açılamadı. Yeniden deneyin.");
  assert.match(m.PROBE_FAILED_TEXT, /kart açılmadı/);
});
console.log(`${n} test geçti`);
