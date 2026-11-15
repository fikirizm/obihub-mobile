// Birim testi: src/inbox-ui.ts — gelen kutusu (D-17; web incomingSync.js + IncomingWorkflow.jsx + IncomingInvoicesOS.jsx).
// Çalıştırma: node dev/test-inbox-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/inbox-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("görünümler web ile aynı; varsayılan işlenmemiş; sayılar etikette", () => {
  assert.deepEqual(m.VIEW_OPTIONS.map((v) => v[0]), ["unprocessed", "archived", "rejected", "all"]);
  assert.deepEqual(m.VIEW_OPTIONS.map((v) => v[1]), ["İşlenmemiş", "Arşivlenmiş", "Reddedilen", "Tümü"]);
  assert.equal(m.DEFAULT_VIEW, "unprocessed");
  assert.equal(m.viewLabel("unprocessed", { unprocessed: 12 }), "İşlenmemiş · 12");
  assert.equal(m.viewLabel("all", null), "Tümü");
});
t("sorgu: sağlayıcı, sayfa, arama (boşsa yok), görünüm, sıralama (yalnız sunucu değerleri)", () => {
  assert.equal(m.inboxQuery({ provider: "parasut", page: 2, pageSize: 30, q: "  acme ", view: "archived", sort: "-amount" }),
    "provider=parasut&page=2&page_size=30&q=acme&view=archived&sort=-amount");
  assert.equal(m.inboxQuery({ provider: "parasut", page: 1, pageSize: 30, q: "", view: "bogus", sort: "foo" }), "provider=parasut&page=1&page_size=30");
});
t("satır: KDV dahil tutar payable_amount, durum etiketi + kalan gün, tür etiketi, içeri alma durumu, yanıt isteği", () => {
  const r = m.inboxRow({ document_key: "123", invoice_no: "ABC1", supplier: { name: "Acme", tax_no: "111" }, issue_date: "2026-11-10", payable_amount: 1180, currency: "TRY",
    status: "awaiting_response", status_label: "Onay bekliyor", response_days_left: 3, type_label: "e-Fatura · Ticari", import_state: "not_imported", import_state_label: "İçeri alınmadı",
    import_status: "none", archived: false, can_respond: true, response_request: null, native_id: "n9" }, "parasut");
  assert.equal(r.id, "123");
  assert.equal(r.gross_total, 1180);
  assert.equal(r.statusText, "Onay bekliyor · 3 gün");
  assert.equal(r.statusKind, "warning");
  assert.equal(r.type_label, "e-Fatura · Ticari");
  assert.equal(r.importLabel, "İçeri alınmadı");
  assert.equal(r.can_respond, true);
  assert.equal(r.pdf_id, "n9");
  assert.equal(m.inboxRow({ document_key: "1", status: "awaiting_response", status_label: "Onay bekliyor", response_days_left: 0 }, "parasut").statusText, "Onay bekliyor · son gün");
  assert.equal(m.inboxRow({ document_key: "1", status: "rejected", status_label: "Reddedildi" }, "parasut").statusKind, "error");
  assert.equal(m.inboxRow({ document_key: "1", status: "accepted", status_label: "Kabul edildi" }, "parasut").statusKind, "success");
  assert.equal(m.inboxRow({ document_key: "1", import_state: "imported_elsewhere", import_state_label: "Paraşüt'te içeri alındı" }, "parasut").importedElsewhere, true);
});
t("yanıt isteği notu (web responseNote)", () => {
  assert.equal(m.responseNote({ state: "queued" }), "Yanıt gönderildi · Paraşüt sonucu bekleniyor");
  assert.equal(m.responseNote({ state: "unknown" }), "Yanıt sonucu belirsiz · Paraşüt'te kontrol edin");
  assert.equal(m.responseNote({ state: "failed", message: "Belge süresi doldu." }), "Yanıt gönderilemedi · Belge süresi doldu.");
  assert.equal(m.responseNote({ state: "failed" }), "Yanıt gönderilemedi · yeniden deneyebilirsiniz");
  assert.equal(m.responseNote({ state: "done" }), null);
  assert.equal(m.responseNote(null), null);
});
t("kabul/red penceresi: metinler web ile aynı; red gerekçesi zorunlu, en çok 500; açık onay olmadan gövde yok", () => {
  assert.equal(m.RESPOND_COPY.reject.title, "Faturayı reddet");
  assert.equal(m.RESPOND_COPY.accept.confirm, "Kabul et ve gönder");
  assert.match(m.RESPOND_WARNING, /geri alınamaz/);
  assert.equal(m.respondBody("reject", "", true).error, "Red gerekçesi zorunludur.");
  assert.equal(m.respondBody("reject", "x".repeat(501), true).error, "Gerekçe en çok 500 karakter olabilir.");
  assert.equal(m.respondBody("accept", "", false).error, "Geri alınamayacağını onaylayın.");
  assert.deepEqual(m.respondBody("reject", " Fiyat farkı ", true).body, { decision: "reject", confirm_irreversible: true, reason: "Fiyat farkı" });
  assert.deepEqual(m.respondBody("accept", "yok sayılır", true).body, { decision: "accept", confirm_irreversible: true });
});
t("yanıt sonucu metni (queued / kabul / red)", () => {
  assert.equal(m.respondDoneText({ response_request: { state: "queued" } }, "accept"), "Yanıt gönderildi, Paraşüt sonucu bekleniyor.");
  assert.equal(m.respondDoneText({ response_request: { state: "done" } }, "accept"), "Fatura kabul edildi.");
  assert.equal(m.respondDoneText({}, "reject"), "Fatura reddedildi.");
});
t("toplu indirme: en çok 20; sonuç metni web ile aynı", () => {
  assert.equal(m.MAX_DOWNLOAD, 20);
  assert.equal(m.downloadProblem(0), "Önce belge seçin.");
  assert.equal(m.downloadProblem(21), "İndirme için en çok 20 belge seçin.");
  assert.equal(m.downloadProblem(20), null);
  assert.equal(m.downloadText(3, 0, "pdf"), "3 belge PDF olarak indirildi (zip).");
  assert.equal(m.downloadText(2, 1, "xml"), "2 belge XML olarak indirildi; 1 belge indirilemedi (zip içindeki EKSIK.txt'de yazar).");
});
t("arşiv metni", () => {
  assert.equal(m.archiveText(2, true), "2 belge arşivlendi.");
  assert.equal(m.archiveText(1, false), "1 belge arşivden çıkarıldı.");
});
t("base64 (zip baytları dosyaya yazmak için)", () => {
  assert.equal(m.bytesToBase64(new Uint8Array([80, 75, 3, 4])), "UEsDBA==");
  assert.equal(m.bytesToBase64(new TextEncoder().encode("Merhaba")), Buffer.from("Merhaba").toString("base64"));
  assert.equal(m.bytesToBase64(new Uint8Array([])), "");
});
console.log(`\n${n} test geçti`);
