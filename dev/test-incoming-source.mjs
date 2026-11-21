// Birim testi: src/incoming-source.ts (Faz A M7). Sunucu incoming_inbox_runtime.benimpos artık hep boş döner (alış kaydı e-fatura
// alındı kanıtı değildir). Web IncomingEInvoicesPage: BenimPOS kaynakta "providerUnsupported" + yönlendirici metin.
// Çalıştırma: node dev/test-incoming-source.mjs
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
const m = await load("incoming-source.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
t("BenimPOS kaynak sayılmaz; yalnız BenimPOS bağlıysa yönlendirme", () => {
  assert.deepEqual(m.incomingSources({ benimpos: { connected: true }, provider: "benimpos" }, null, { source: "benimpos" }), { source: null, connected: [], benimposOnly: true });
  assert.deepEqual(m.incomingSources({ benimpos: { connected: true }, parasut: { connected: true } }, null, null), { source: "parasut", connected: ["parasut"], benimposOnly: false });
});
t("kayıtlı kaynak, muhasebe programı, ilk bağlı sırası", () => {
  assert.equal(m.incomingSources({ parasut: { connected: true }, provider: "parasut" }, { connected: true }, { source: "turkcell-efatura" }).source, "turkcell-efatura");
  assert.equal(m.incomingSources({ parasut: { connected: true }, provider: "parasut" }, { connected: true }, null).source, "parasut");
  assert.deepEqual(m.incomingSources(null, null, null), { source: null, connected: [], benimposOnly: false });
});
t("metinler", () => {
  assert.equal(m.BENIMPOS_TEXT, "BenimPOS alış kayıtları gelen e-fatura kaynağı değildir. Gelen e-faturalar için Turkcell veya Paraşüt e-fatura bağlantısını kullanın.");
  assert.equal(m.NO_SOURCE_TEXT, "Gelen e-faturalar Paraşüt veya Turkcell e-Fatura bağlantısıyla çalışır. Bağlantı web panelinden yapılır.");
});
console.log(`${n} test geçti`);
