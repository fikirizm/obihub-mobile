// Birim testi: src/allocation.ts (Aşama 4 / P8 cari tahsilatı dağıtımı + avansı faturaya dağıt; web components/customers/allocation.js).
// Çalıştırma: node dev/test-allocation.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/allocation.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const err = (status, code, message) => Object.assign(new Error(message || code || "e"), { status, code });

const invs = [
  { id: "i1", invoice_number: "SF-1", due_date: "2026-10-31", total: "300.00", remaining: "300.00", status: "gonderildi" },
  { id: "i2", invoice_number: "SF-2", due_date: "2026-11-20", total: "800.00", remaining: "500.00", status: "gecikti" },
];

t("Türkçe tutar → noktalı dize; geçersiz ve 2'den fazla ondalık reddedilir", () => {
  assert.equal(m.parseTrAmount("1.250,50"), "1250.50");
  assert.equal(m.parseTrAmount("1250,5"), "1250.5");
  assert.equal(m.parseTrAmount("1250.5"), "1250.5");
  assert.equal(m.parseTrAmount("1.250"), "1250");
  assert.equal(m.parseTrAmount("12,345"), null);
  assert.equal(m.parseTrAmount("-5"), null);
  assert.equal(m.parseTrAmount(""), null);
});
t("kuruş (BigInt): dize ↔ kuruş, biçim (uygulamanın formatMoney biçimi: simge başta)", () => {
  assert.equal(m.formatMinor(-500n, "TRY"), "-₺5,00");
  assert.equal(m.formatMinor(100n, "EUR"), "€1,00");
  assert.equal(m.formatMinor(100n, "CHF"), "1,00 CHF");
  assert.equal(m.toMinor("300.95"), 30095n);
  assert.equal(m.toMinor("0.1"), 10n);
  assert.equal(m.toMinor("x"), null);
  assert.equal(m.fromMinor(125050n), "1250.50");
  assert.equal(m.formatMinor(125050n, "TRY"), "₺1.250,50");
  assert.equal(m.formatMinor(5n, "USD"), "$0,05");
  assert.equal(m.toTrInput("1250.5"), "1.250,50");
});

t("K4: dağıtılabilir faturalar — taslak / teklif / iptal ve kalanı sıfır olan elenir", () => {
  const list = m.allocatableInvoices([...invs, { id: "d", remaining: "10.00", status: "taslak" }, { id: "q", remaining: "5.00", invoice_type: "teklif" }, { id: "c", remaining: "5.00", status: "iptal" }, { id: "z", remaining: "0.00", status: "gonderildi" }]);
  assert.deepEqual(list.map((x) => x.id), ["i1", "i2"]);
  assert.deepEqual(m.allocatableInvoices(null), []);
});

t("satır dağıtımı: boş satır atlanır, toplam kuruşla, gövde dize", () => {
  const a = m.buildAllocations(invs, { i1: "100,25", i2: "" });
  assert.deepEqual(a.items, [{ invoice_id: "i1", amount: "100.25" }]);
  assert.equal(a.total, 10025n);
  assert.deepEqual(a.errors, {});
});
t("satır dağıtımı: geçersiz tutar ve fatura kalanını aşan satır hata", () => {
  const a = m.buildAllocations(invs, { i1: "abc", i2: "500,01" });
  assert.match(a.errors.i1, /Geçerli bir tutar/);
  assert.match(a.errors.i2, /kalanını aşamaz/);
  assert.deepEqual(a.items, []);
  assert.equal(m.buildAllocations(invs, { i1: "0" }).errors.i1 !== undefined, true);
});
t("en eski vadeden doldur: avans/tutar kadar, sırayla", () => {
  assert.deepEqual(m.autoFill(invs, 35000n), { i1: "300,00", i2: "50,00" });
  assert.deepEqual(m.autoFill(invs, 100000n), { i1: "300,00", i2: "500,00" });
  assert.deepEqual(m.autoFill(invs, 0n), {});
});
t("tahsilat gövdesi allocations: otomatik → alan yok, avans → [], elle → satırlar (boşsa otomatik)", () => {
  const items = [{ invoice_id: "i1", amount: "1.00" }];
  assert.equal(m.allocationBody("auto", items), undefined);
  assert.deepEqual(m.allocationBody("advance", items), []);
  assert.deepEqual(m.allocationBody("manual", items), items);
  assert.equal(m.allocationBody("manual", []), undefined);
});

t("tahsilat doğrulaması: elle dağıtım toplamı tutarı aşamaz, satır hatası engeller", () => {
  assert.equal(m.collectAllocationError("manual", m.buildAllocations(invs, { i1: "300,00" }), 20000n), "Dağıtım toplamı tahsilat tutarını aşamaz.");
  assert.equal(m.collectAllocationError("manual", m.buildAllocations(invs, { i1: "x" }), 20000n), "Dağıtım tutarlarındaki hataları düzeltin.");
  assert.equal(m.collectAllocationError("manual", m.buildAllocations(invs, { i1: "100" }), 20000n), "");
  assert.equal(m.collectAllocationError("auto", m.buildAllocations(invs, { i1: "999" }), 100n), "");
});
t("avans dağıtımı doğrulaması: hata, boş, avansı aşan", () => {
  assert.equal(m.advanceAllocationError(m.buildAllocations(invs, {}), 1000n), "Dağıtılacak en az bir fatura için tutar girin.");
  assert.equal(m.advanceAllocationError(m.buildAllocations(invs, { i1: "20,00" }), 1000n), "Dağıtım toplamı mevcut avansı aşamaz.");
  assert.equal(m.advanceAllocationError(m.buildAllocations(invs, { i1: "10,00" }), 1000n), "");
});
t("bakiye notu: kısmi, fazla (avans), kapanır", () => {
  assert.deepEqual(m.balanceNote(50000n, 20000n, "TRY"), { tone: "warn", text: "Kısmi tahsilat: ₺300,00 açık kalacak." });
  assert.deepEqual(m.balanceNote(50000n, 60000n, "TRY"), { tone: "warn", text: "Fazla tahsilat: ₺100,00 cari hesapta avans olarak kalacak." });
  assert.deepEqual(m.balanceNote(50000n, 50000n, "TRY"), { tone: "ok", text: "Cari bakiyesi kapanacak." });
  assert.equal(m.balanceNote(0n, 100n, "TRY"), null);
  assert.equal(m.balanceNote(50000n, null, "TRY"), null);
});

t("hata metinleri: dağıtım ve hesap kodları kendi metnimizle; CURRENCY_MISMATCH açık", () => {
  for (const [code, re] of [["ALLOCATION_EXCEEDS_AMOUNT", /aşıyor/], ["ALLOCATION_INVALID", /geçersiz/], ["PAYMENT_EXCEEDS_REMAINING", /kalan/], ["INVOICE_NOT_ISSUED", /[Tt]aslak/],
    ["ADVANCE_INSUFFICIENT", /avans/i], ["ALLOCATION_REQUIRED", /en az bir/], ["CURRENCY_MISMATCH", /para birimi/], ["ACCOUNT_REQUIRED", /hesap/i], ["ACCOUNT_NONE_FOR_CURRENCY", /hesab/i], ["ACCOUNT_NOT_FOUND", /hesap/i], ["ACCOUNT_INACTIVE", /pasif/]]) {
    assert.match(m.allocationErrorText(err(409, code)), re, code);
  }
  assert.equal(m.allocationErrorText(err(400, "OTHER", "Sunucu metni")), "Sunucu metni");
  assert.match(m.allocationErrorText(err(0)), /kaydedilmiş olabilir/);
});

t("tahsilat sonucu metni: dağıtılan + avans, atlanan, tekrar", () => {
  assert.deepEqual(m.collectDoneTexts({ allocated_amount: "300.00", advance_amount: "50.00" }, "TRY"), ["Tahsilat kaydedildi: ₺300,00 açık faturalara işlendi, ₺50,00 avans kaldı."]);
  assert.deepEqual(m.collectDoneTexts({ allocated_amount: "300.00", advance_amount: "0.00" }, "TRY"), ["Tahsilat kaydedildi: ₺300,00 açık faturalara işlendi."]);
  assert.deepEqual(m.collectDoneTexts({ allocated_amount: "0", advance_amount: "75.00" }, "TRY"), ["Tahsilat avans olarak kaydedildi (₺75,00)."]);
  assert.deepEqual(m.collectDoneTexts({ allocated_amount: "100.00", advance_amount: "0", skipped: [{ invoice_id: "i2" }] }, "TRY"),
    ["Tahsilat kaydedildi: ₺100,00 açık faturalara işlendi.", "1 fatura bu sırada değiştiği için atlandı; tutarı avansta kaldı."]);
  assert.deepEqual(m.collectDoneTexts({ replayed: true }, "TRY"), ["Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi."]);
});
t("avans dağıtımı sonucu metni", () => {
  assert.deepEqual(m.allocateDoneTexts({ advance_remaining: "25.00" }, 30000n, "TRY"), ["₺300,00 faturalara işlendi; kalan avans ₺25,00."]);
  assert.deepEqual(m.allocateDoneTexts({ skipped: [1, 2] }, 100n, "TRY"), ["₺1,00 faturalara işlendi.", "2 fatura bu sırada değiştiği için atlandı; tutarı avansta kaldı."]);
  assert.deepEqual(m.allocateDoneTexts({ replayed: true }, 100n, "TRY"), ["Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi."]);
});

console.log(`\n${n} test geçti`);
