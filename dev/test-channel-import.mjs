// Birim testi: src/channel-import.ts (Faz C5 "Ürünleri kanaldan çek" + eşleştirme onay kuyruğu). Sunucu: /products/channel-import/*
// (scan 202 {job_id, run_id}, ikinci istek 409 + X-Job-Id; runs/{id}, runs/{id}/rows?decision, runs/{id}/apply 202, latest, queue,
// queue/{row}/resolve {action: link|new|skip, product_id?}). Web: lib/channelImport.js, components/channelImport/*.
// Çalıştırma: node dev/test-channel-import.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/channel-import.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("çekilebilen mağazalar: desteklenen kanallar, silinmemiş", () => {
  const list = [{ id: "a", provider: "Trendyol", name: "TY" }, { id: "b", provider: "website" }, { id: "c", provider: "n11", status: "deleted" }, { id: "d", provider: "woocommerce" }];
  assert.deepEqual(m.importableIntegrations(list), [{ id: "a", provider: "trendyol", name: "TY" }, { id: "d", provider: "woocommerce", name: "WooCommerce" }]);
  assert.equal(m.channelLabel("hepsiburada"), "Hepsiburada");
});
t("yollar", () => {
  assert.equal(m.scanPath("i 1"), "/products/channel-import/i%201/scan");
  assert.equal(m.rowsPath("r1", "new", 2), "/products/channel-import/runs/r1/rows?page=2&per_page=50&decision=new");
  assert.equal(m.latestPath("i1"), "/products/channel-import/latest?integration_id=i1");
  assert.equal(m.queuePath("", 1), "/products/channel-import/queue?page=1&per_page=25");
  assert.equal(m.queuePath("i1", 2), "/products/channel-import/queue?page=2&per_page=25&integration_id=i1");
  assert.deepEqual(m.resolveBody("link", "p1"), { action: "link", product_id: "p1" });
  assert.deepEqual(m.resolveBody("skip"), { action: "skip" });
});
t("çalışmanın adımı ve varsayılan süzgeç", () => {
  assert.equal(m.stepForRun(null), "start");
  assert.equal(m.stepForRun({ state: "ready" }), "review");
  assert.equal(m.stepForRun({ state: "applied" }), "done");
  assert.equal(m.stepForRun({ state: "partial" }), "done");
  assert.equal(m.stepForRun({ state: "failed" }), "start");
  assert.equal(m.defaultFilter({ new: 0, match: 0, ambiguous: 2 }), "ambiguous");
  assert.equal(m.defaultFilter({ new: 3 }), "new");
});
t("iş ilerlemesi ve sonucu", () => {
  assert.equal(m.progressText({ progress: { done: 1200, total: 3000, label: "Ürünler alınıyor" } }, "x"), "Ürünler alınıyor (1.200/3.000)");
  assert.equal(m.progressText({}, "Ürünler alınıyor"), "Ürünler alınıyor…");
  assert.deepEqual(m.jobOutcome({ state: "running" }), { phase: "running", message: "" });
  assert.deepEqual(m.jobOutcome({ state: "done" }), { phase: "done", message: "" });
  assert.deepEqual(m.jobOutcome({ state: "failed", error_tr: "Kanal yanıt vermedi." }), { phase: "failed", message: "Kanal yanıt vermedi." });
});
t("önizleme özeti: eşleşen = match + linked; aktarılabilir; stok notu", () => {
  const r = { counts: { total: 10, new: 3, match: 2, linked: 1, ambiguous: 2, skip: 2 }, stock_mode: "none", inventory_owner_label: "Paraşüt", warnings: ["Bazı ürünlerde stok yok."], no_stock_info: true };
  const v = m.reviewView(r);
  assert.deepEqual(v.stats.map((s) => [s.label, s.value]), [["Yeni ürün", 3], ["Eşleşen", 3], ["Onay bekleyen", 2], ["Atlanan", 2]]);
  assert.equal(v.writable, 8);
  assert.match(v.stockNote, /Stok sahibi muhasebe programınız \(Paraşüt\)/);
  assert.deepEqual(v.warnings, ["Bazı ürünlerde stok yok."]);
  assert.match(m.reviewView({ counts: {}, stock_mode: "with_stock" }).stockNote, /Ana depoya açılış stoğu/);
  assert.equal(m.reviewView({ counts: { skip: 3 } }).writable, 0);
});
t("sonuç özeti", () => {
  const v = m.doneView({ state: "partial", applied: { created: 3, linked: 2, queued: 1, failed: 1, limit_skipped: 2 }, message: "Kısmen." });
  assert.equal(v.title, "Aktarım kısmen tamamlandı");
  assert.deepEqual(v.stats.map((s) => s.value), [3, 2, 1, 3]);
  assert.equal(v.retry, true);
  assert.equal(v.queued, 1);
  assert.equal(m.doneView({ state: "applied", applied: {} }).title, "Aktarım tamamlandı");
});
t("satır metni ve kodları", () => {
  assert.equal(m.rowDecisionText({ decision: "match", match_by: "barcode" }), "Mevcut ürüne bağlanacak (barkod eşleşti)");
  assert.equal(m.rowDecisionText({ decision: "ambiguous", reason_text: "Aynı barkod iki kartta." }), "Aynı barkod iki kartta.");
  assert.equal(m.rowDecisionText({ decision: "new" }), "Yeni ürün açılacak");
  assert.equal(m.rowCodes({ barcode: "869", sku: "S1", stock: 1200 }), "Barkod 869 · SKU S1 · Stok 1.200");
  assert.equal(m.rowCodes({ model_code: "M1" }), "Model M1");
  assert.equal(m.rowCodes({}), "Kod yok");
});
t("onay kuyruğu satırı: OTHER_STORE yalnız yoksay; aday metni", () => {
  const q = m.queueRowView({ id: "q1", provider: "trendyol", name: "Kupa", variant: "Mavi", barcode: "869", reason: "OTHER_STORE", reason_text: "Kart başka mağazada bağlı." , candidates: [{ product_id: "p1", name: "Kupa", sku: "K1", by: "barcode" }] });
  assert.equal(q.onlySkip, true);
  assert.equal(q.title, "Kupa · Mavi");
  assert.equal(q.channel, "Trendyol");
  assert.deepEqual(m.candidateText({ sku: "K1", barcode: "869", by: "name" }), "SKU K1 · Barkod 869 · ad benzer");
  assert.equal(m.queueRowView({ id: "q2", name: "X" }).onlySkip, false);
});
t("karar sonucu ve hata metni", () => {
  assert.equal(m.resolveText({ result: "created" }), "Yeni ürün açıldı ve kanala bağlandı.");
  assert.equal(m.resolveText({ result: "linked" }), "Ürün kanala bağlandı.");
  assert.equal(m.resolveText({ result: "skipped" }), "Ürün yoksayıldı.");
  assert.equal(m.resolveError({ code: "ROW_ALREADY_RESOLVED", message: "x" }).reload, true);
  assert.match(m.resolveError({ code: "CHANNEL_LINK_OTHER_STORE" }).text, /başka mağaza/);
  assert.equal(m.resolveError({ code: "Z", message: "Sunucu dedi." }).text, "Sunucu dedi.");
});
t("ürün kartında kanal ayrıntıları", () => {
  assert.deepEqual(m.channelDetails({ trendyol: { barcode: "869", channel_sku: "TY-1", model_code: "M", variant: "Kırmızı" }, woocommerce: {} }),
    [{ channel: "Trendyol", text: "Barkod 869 · Kanal SKU TY-1 · Model M · Kırmızı" }]);
  assert.deepEqual(m.channelDetails(null), []);
});
console.log(`${n} test geçti`);
