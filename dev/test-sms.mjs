// Birim testi: src/sms.ts (Netgsm SMS ekranı). Sunucu: backend/routers/netgsm.py + netgsm_sms.py; web: components/sms/*.
// Belge: docs/netgsm-sms.md "2. Mobil iş listesi". Çalıştırma: node dev/test-sms.mjs
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
const m = await load("sms.ts");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const view = {
  connected: true, enabled: true, sender: "", encoding: "TURKISH", store_name: "Dükkan", revision: 7,
  channels: { website: true, woocommerce: false },
  rules: { created: { enabled: true, text: "Siparişiniz [siparis_no] alındı" }, admin_created: { enabled: true, text: "Yeni sipariş", phones: ["0532 111 22 33"] } },
  senders: [{ name: "DUKKAN", type: "ALPHANUMERIC", usable: true }, { name: "8501234567", type: "SUBSCRIBER_NUMBER", usable: true }, { name: "ESKI", usable: false, reason: "ROUTING_CODE_MISSING" }],
};

t("telefon düzeltme: 0532…, 532…, +90…, 0090… → +905…; geçersiz boş", () => {
  for (const raw of ["0532 123 45 67", "532 123 45 67", "+90 532 123 45 67", "0090 532 123 4567", "905321234567"]) assert.equal(m.normalizePhone(raw), "+905321234567", raw);
  assert.equal(m.normalizePhone("0212 123 45 67"), "");
  assert.equal(m.normalizePhone("123"), "");
});
t("istek kimliği sunucu kalıbına uyar ve her çağrıda farklı", () => {
  const a = m.makeRequestId(), b = m.makeRequestId();
  assert.match(a, /^[A-Za-z0-9_-]{6,64}$/);
  assert.notEqual(a, b);
});
t("taslak: beş kural eksiksiz, yalnız admin_created telefon taşır; yük expected_revision ile", () => {
  const d = m.toDraft(view);
  assert.deepEqual(Object.keys(d.rules), ["created", "shipped", "delivered", "cancelled", "admin_created"]);
  assert.deepEqual(d.rules.shipped, { enabled: false, text: "" });
  assert.deepEqual(d.rules.admin_created.phones, ["0532 111 22 33"]);
  d.rules.admin_created.phones = [" 0533 000 00 00 ", ""];
  const p = m.toPayload(7, d);
  assert.equal(p.expected_revision, 7);
  assert.deepEqual(p.rules.admin_created.phones, ["0533 000 00 00"]);
  assert.equal("phones" in p.rules.created, false);
  assert.deepEqual(Object.keys(p).sort(), ["channels", "enabled", "encoding", "expected_revision", "rules", "sender", "store_name"]);
});
t("ayar hatası: 409 / DRAFT_CHANGED çakışma, diğeri sunucu metni", () => {
  assert.deepEqual(m.settingsError({ status: 409, code: "DRAFT_CHANGED", message: "x" }), { conflict: true, text: m.CONFLICT_TEXT });
  assert.deepEqual(m.settingsError({ status: 400, code: "SENDER_REQUIRED", message: "Gönderici adı seçin." }), { conflict: false, text: "Gönderici adı seçin." });
});
t("gönderici adı uyarısı: birden çok ad varsa sayıyı söyler, seçiliyse yok", () => {
  assert.match(m.senderMissingText(view), /2 gönderici adı var/);
  assert.match(m.senderMissingText(view), /Seçilmeden SMS gönderilmez/);
  assert.equal(m.senderMissingText({ ...view, sender: "DUKKAN" }), "");
  assert.doesNotMatch(m.senderMissingText({ ...view, senders: [view.senders[0]] }), /gönderici adı var/);
});
t("gönderici adları: seçilemeyenin nedeni Türkçe, tür etiketi", () => {
  const rows = m.senderRows(view.senders);
  assert.deepEqual(rows.map((r) => [r.name, r.usable]), [["DUKKAN", true], ["8501234567", true], ["ESKI", false]]);
  assert.equal(rows[1].typeLabel, "Abone numarası");
  assert.match(rows[2].reason, /tanımı tamamlanmamış/);
  assert.match(m.senderReason("YENI_KOD"), /izin vermiyor/);
});
t("değişken ekleme: köşeli parantez, gerekirse boşlukla sona eklenir", () => {
  assert.equal(m.tag("siparis_no"), "[siparis_no]");
  assert.equal(m.tag("[ad]"), "[ad]");
  assert.equal(m.appendVar("Merhaba", "ad"), "Merhaba [ad]");
  assert.equal(m.appendVar("Merhaba ", "[ad]"), "Merhaba [ad]");
  assert.equal(m.appendVar("", "ad"), "[ad]");
});
t("alıcı seçimi: yinelenen tek, tavan aşılırsa durur ve bildirir", () => {
  let r = m.addRecipients({}, [{ name: "A", phone: "+905000000001" }, { name: "A2", phone: "+905000000001" }, { name: "B", phone: "+905000000002" }], 5000);
  assert.deepEqual(r.sel, { "+905000000001": "A", "+905000000002": "B" });
  assert.equal(r.capped, false);
  r = m.addRecipients(r.sel, [{ name: "C", phone: "+905000000003" }, { name: "D", phone: "+905000000004" }], 3);
  assert.equal(Object.keys(r.sel).length, 3);
  assert.equal(r.capped, true);
});
t("gönder düğmesi nedeni: gönderici → alıcı → metin → İYS sırası; hazırsa null", () => {
  const base = { sender: "DUKKAN", count: 2, text: "Merhaba", commercial: false, iys: "", consent: false };
  assert.match(m.sendBlockReason({ ...base, sender: "" }), /gönderici adı seçin/);
  assert.match(m.sendBlockReason({ ...base, count: 0 }), /en az bir alıcı/);
  assert.match(m.sendBlockReason({ ...base, text: "  " }), /mesaj metnini/);
  assert.match(m.sendBlockReason({ ...base, commercial: true }), /İYS filtresini/);
  assert.match(m.sendBlockReason({ ...base, commercial: true, iys: "BRAND" }), /onay kutusunu/);
  assert.equal(m.sendBlockReason({ ...base, commercial: true, iys: "BRAND", consent: true }), null);
  assert.equal(m.sendBlockReason(base), null);
});
t("kampanya gövdesi: bilgilendirmede NONE/false; ticaride seçilen filtre ve onay", () => {
  const sel = { "+905000000001": "A" };
  assert.deepEqual(m.campaignBody("rid123", "Hi", false, "BRAND", true, sel), { request_id: "rid123", text: "Hi", commercial: false, iys_filter: "NONE", consent_ack: false, recipients: [{ name: "A", phone: "+905000000001" }] });
  const c = m.campaignBody("rid123", "Hi", true, "RETAILER", true, sel);
  assert.equal(c.iys_filter, "RETAILER");
  assert.equal(c.consent_ack, true);
});
t("gönderim hatası: UNKNOWN_OUTCOME belirsiz sonuca döner (yeniden gönderme yok); diğerleri hata metni", () => {
  const u = m.campaignFailure({ status: 503, code: "UNKNOWN_OUTCOME", message: "SMS gitmiş olabilir." });
  assert.deepEqual(u, { result: { state: "unknown", error: "SMS gitmiş olabilir." } });
  assert.deepEqual(m.campaignFailure({ status: 400, code: "TEXT_TOO_LONG", message: "Metni kısaltın." }), { error: "Metni kısaltın." });
  assert.deepEqual(m.campaignFailure({}), { error: "Gönderim yapılamadı." });
});
t("sonuç: sent başarı + atlanan/reddedilen; unknown yeniden gönderme uyarısı; failed yeni kimlik ister", () => {
  const s = m.resultView({ state: "sent", accepted: 1200, rejected: 2, invalid: 3, duplicates: 1, rejected_items: [{ phone: "+905…", reason: "İYS izni yok" }] });
  assert.equal(s.tone, "success");
  assert.equal(s.title, "1.200 numara Netgsm'e iletildi");
  assert.ok(s.lines.some((l) => /3 geçersiz numara atlandı/.test(l)));
  assert.ok(s.lines.some((l) => /1 tekrar eden numara tek sayıldı/.test(l)));
  assert.equal(s.rejectedTitle, "2 numara reddedildi");
  assert.equal(s.finished, true);
  const u = m.resultView({ state: "unknown", error: "Yanıt alınamadı." });
  assert.equal(u.tone, "warning");
  assert.ok(u.lines.includes("Yeniden göndermeyin; Netgsm panelinden ya da Geçmiş'ten kontrol edin."));
  assert.equal(u.finished, true);
  const f = m.resultView({ state: "failed", error: "Bakiye yetersiz." });
  assert.equal(f.finished, false);
  assert.equal(f.newRequestId, true);
  assert.equal(m.resultView({ state: "pending" }).title, "Gönderim sıraya alındı");
});
t("geçmiş durumu: teslim raporu ve hata nedeni Türkçe", () => {
  assert.deepEqual(m.stateInfo({ state: "sent", delivery: "DELIVERED" }), { label: "İletildi", tone: "success", detail: "" });
  assert.deepEqual(m.stateInfo({ state: "sent", delivery: "NOT_DELIVERED", fail_reason: "IYS_REJECTED" }), { label: "İletilmedi", tone: "error", detail: "İYS izni yok" });
  assert.equal(m.stateInfo({ state: "sent" }).label, "Gönderildi");
  assert.equal(m.stateInfo({ state: "unknown", error: "x" }).tone, "warning");
  assert.equal(m.stateInfo({ state: "failed", error: "Hata" }).detail, "Hata");
  assert.equal(m.stateInfo({ state: "pending" }).label, "Sırada");
  assert.equal(m.failReason("YOK_KOD"), "Netgsm iletemedi");
  assert.equal(m.EVENT_LABEL.admin_created, "Yetkili bildirimi");
});
t("ilk satır ve önizleme yolu", () => {
  assert.equal(m.firstLine("Kampanya\nikinci"), "Kampanya");
  assert.deepEqual(m.previewBody("x", "bulk", "DEFAULT"), { text: "x", scope: "bulk", encoding: "DEFAULT" });
  assert.equal(m.previewBody("x", "order", "garip").encoding, "TURKISH");
});
console.log(`${n} test geçti`);
