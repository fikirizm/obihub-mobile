// Birim testi: src/api-iceri-al.ts saf kısımları (İçeri Al; 14 Kas 2026 sözleşmesi, docs/mobil-oturum-icin-notlar.md).
// "./api" içe aktarımı sahte bir request ile değiştirilir (modül ağ kullanmadan yüklenir).
// Çalıştırma: node dev/test-iceri-al.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
let src = readFileSync(join(here, "../frontend/src/api-iceri-al.ts"), "utf8");
src = src.replace(/import \{ request \} from "\.\/api";/, "const request = async () => { throw new Error('ağ yok'); };");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const GENERIC = "İçeri alma altyapısı bu fatura için henüz hazır değil.";
const CODE = /[A-Z]{3,}_[A-Z]/;

t("muhasebe kapısı engelleri genel 'altyapı' metni değil, firma durumu (state)", () => {
  const a = m.collectIssues({ blocker_items: [{ key: "ACCOUNTING_NOT_ACTIVE" }], review_items: [] }, null)[0];
  assert.equal(a.kind, "state");
  assert.notEqual(a.text, GENERIC);
  assert.match(a.text, /Muhasebe ayarlarınız bu firmada henüz etkin değil/);
  assert.match(a.text, /Destek ekibimizle/);
  const e = m.collectIssues({ blocker_items: [{ key: "EXPENSE_MODULE_DISABLED" }], review_items: [] }, null)[0];
  assert.equal(e.kind, "state");
  assert.match(e.text, /ön muhasebesi bu firmada kapalı/);
  assert.match(e.text, /Ayarlar'dan açabilirsiniz/);
  assert.ok(!CODE.test(a.text + e.text));
});
t("LEGACY_RECORD_EXISTS: ödenmiş eski aktarım kaydı (state, Türkçe metin)", () => {
  const r = m.collectIssues({ blocker_items: [{ key: "LEGACY_RECORD_EXISTS" }], review_items: [] }, null)[0];
  assert.equal(r.kind, "state");
  assert.equal(r.text, "Bu fatura daha önce eski aktarımla ObiHub'a kaydedilmiş ve ödenmiş. İkinci kez borç ve gider oluşturulmaz; mevcut gider faturası kaydını kullanın.");
});
t("POSSIBLE_LEGACY_DUPLICATE: açık kabul isteyen madde (ack); metin ve kutu etiketi web'le aynı", () => {
  const r = m.collectIssues({ blocker_items: [], review_items: [{ key: "POSSIBLE_LEGACY_DUPLICATE" }] }, null)[0];
  assert.equal(r.kind, "ack");
  assert.equal(r.text, "Aynı tedarikçiden aynı gün aynı tutarda eski aktarımla kaydedilmiş, numarası farklı bir fatura var. Farklı bir faturaysa onaylayıp devam edin.");
  assert.equal(m.LEGACY_DUPLICATE.ackLabel, "Bu farklı bir fatura; içeri almaya devam et");
  assert.equal(m.hasLegacyDuplicate([{ key: "X" }, { key: "POSSIBLE_LEGACY_DUPLICATE" }]), true);
  assert.equal(m.hasLegacyDuplicate([]), false);
  assert.equal(m.hasLegacyDuplicate(null), false);
});
t("kabul önizleme ve onay gövdesine yalnız true iken legacy_duplicate_ack: true olarak girer", () => {
  const base = { ...m.INITIAL_ARGS };
  assert.equal(base.legacyAck, false);
  assert.ok(!("legacy_duplicate_ack" in m.importPayload(base, true)));
  assert.equal(m.importPayload({ ...base, legacyAck: true }, true).legacy_duplicate_ack, true);
  assert.equal(m.importPayload({ ...base, legacyAck: true }, false).legacy_duplicate_ack, true);
});
t("onay reddi 409: sunucunun Türkçe açıklaması önce; yoksa bilinen kodun metni; ham kod asla", () => {
  const d = "ObiHub ön muhasebesi bu firmada kapalı; fatura içeri alınmadı. Ayarlar'dan açabilirsiniz.";
  assert.equal(m.confirmErrorOutcome({ status: 409, message: d, code: "EXPENSE_MODULE_DISABLED" }).detail, d);
  assert.equal(m.confirmErrorOutcome({ status: 409, message: "Yeni bir ret gerekçesi oluştu.", code: "APPLY_SOMETHING_NEW" }).detail, "Yeni bir ret gerekçesi oluştu.");
  const dis = m.confirmErrorOutcome({ status: 409, message: "Bir hata oluştu", code: "EXPENSE_MODULE_DISABLED" });
  assert.equal(dis.status, "REJECTED");
  assert.match(dis.detail, /ön muhasebesi bu firmada kapalı/);
  const own = m.confirmErrorOutcome({ status: 409, message: "APPLY_OWNERSHIP_UNKNOWN", reason: "APPLY_OWNERSHIP_UNKNOWN" });
  assert.equal(own.detail, "Muhasebe ayarlarınız bu işlem için henüz hazır değil. Destek ekibimizle iletişime geçin.");
  assert.ok(!CODE.test(own.detail));
});
t("elle alış: kabul belge alanları değişince düşer", () => {
  assert.equal(m.legacyAckValid(true, '{"a":1}', '{"a":1}'), true);
  assert.equal(m.legacyAckValid(true, '{"a":1}', '{"a":2}'), false);
  assert.equal(m.legacyAckValid(false, '{"a":1}', '{"a":1}'), false);
});

t("Faz A M7: belge toplamı esasında satır tutar farkı notları bilgi (kaydı engellemez); web model.js collectIssues", () => {
  const view = (basis, quick = false) => ({ document: { totals_basis: basis, quick_expense: quick }, lines: [{ index: 0, issues: ["LINE_NET_DIFFERS_FROM_UBL", "LINE_DISCOUNT_UNREADABLE"] }] });
  for (const x of m.collectIssues({}, view("document"))) assert.equal(x.kind, "notice");
  assert.ok(m.collectIssues({}, view("lines")).some((x) => x.kind !== "notice"));
});

t("Faz C2: 'Evet'te (-), indirim, iskonto, yuvarlama satırları gider kalır (Türkçe küçük harf)", () => {
  const view = { lines: [{ index: 0, description: "Kablo 2m" }, { index: 1, description: "Kampanya İndirimi (-)" }, { index: 2, description: "YUVARLAMA FARKI" }, { index: 3, description: "İskonto" }] };
  const a = m.answerArgs({ supplierId: "s1", mode: "expense_only", lineChoices: [], warehouseId: null, quickExpense: false }, view, "yes");
  assert.deepEqual(a.lineChoices.map((c) => c.kind), ["product", "service", "service", "service"]);
  assert.deepEqual(a.lineChoices.map((c) => c.stock), [true, null, null, null]);
  const b = m.answerArgs({ supplierId: "s1", mode: "expense_only", lineChoices: [], warehouseId: null, quickExpense: false }, view, "no");
  assert.ok(b.lineChoices.every((c) => c.kind === "service"));
});
t("Faz C2: Ödendi ilk seçilince ödeme tarihi fatura tarihi (bugünden ileri değilse); ileri tarih reddedilir", () => {
  assert.equal(m.firstPaymentDate("2026-11-20", "2026-11-21"), "2026-11-20");
  assert.equal(m.firstPaymentDate("2026-11-25", "2026-11-21"), null);
  assert.equal(m.firstPaymentDate(null, "2026-11-21"), null);
  assert.equal(m.paymentDateError({ payment_state: "paid", payment_date: "2026-11-22" }, "2026-11-21"), "Ödeme tarihi ileri bir gün olamaz.");
  assert.equal(m.paymentDateError({ payment_state: "paid", payment_date: "2026-11-21" }, "2026-11-21"), null);
  assert.equal(m.paymentDateError({ payment_state: "payable", payment_date: "2026-11-30" }, "2026-11-21"), null);
});

console.log(`\n${n} test geçti`);
