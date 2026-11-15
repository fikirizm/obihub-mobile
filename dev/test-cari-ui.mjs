// Birim testi: src/cari-ui.ts (13 Kas 2026 cari mahsup K8, virman K9, "Alacak bakiyesi" K10; M1, M4, M5, M6, M7).
// Çalıştırma: node dev/test-cari-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/cari-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }
const err = (status, code, message) => ({ status, code, message });

// M1
t("M1: can_match iken 'Faturalarla eşleştir' bağlantısı ve eşleşmemiş alacak tutarı", () => {
  const v = m.matchLinkView({ can_match: true, credit: 250, currency: "TRY", match_blocked_reason: null });
  assert.equal(v.show, true);
  assert.equal(v.text, "₺250,00 eşleşmemiş tahsilat · Faturalarla eşleştir");
  assert.equal(v.note, null);
});
t("M1: eşleştirilemiyorsa bağlantı yok; engel nedeni varsa not", () => {
  assert.deepEqual(m.matchLinkView({ can_match: false, credit: 0, currency: "TRY", match_blocked_reason: null }), { show: false, text: null, note: null });
  assert.match(m.matchLinkView({ can_match: false, credit: 100, match_blocked_reason: "ledger_pending" }).note, /işleniyor/);
  assert.match(m.matchLinkView({ can_match: false, credit: 100, match_blocked_reason: "ledger_issue" }).note, /muhasebe kaydı sorunlu/);
  assert.equal(m.matchLinkView(null).show, false);
});

// M5
t("M5: otomatik kapama bildirimi yalnız applied_amount > 0 iken; skipped_reason sessiz", () => {
  assert.equal(m.autoSettlementText({ applied_amount: 1250.5, currency: "TRY" }), "₺1.250,50 carinin alacak bakiyesinden bu faturaya işlendi.");
  assert.equal(m.autoSettlementText({ applied_amount: 0, skipped_reason: "currency" }), null);
  assert.equal(m.autoSettlementText({ applied_amount: 0, skipped_reason: "ledger_pending" }), null);
  assert.equal(m.autoSettlementText(null), null);
  assert.equal(m.autoSettlementText({ applied_amount: 10, currency: "USD" }), "$10,00 carinin alacak bakiyesinden bu faturaya işlendi.");
});

// M4
t("M4: eşleşmeyi kaldır yalnız cari tahsilatından gelen satırda", () => {
  assert.equal(m.canUnmatch({ id: "p1", source: "customer_payment" }), true);
  assert.equal(m.canUnmatch({ id: "p1", source: "customer_payment", void_op: "x" }), false);
  assert.equal(m.canUnmatch({ id: "p1" }), false);
  assert.equal(m.canUnmatch({ source: "customer_payment" }), false);
  assert.equal(m.UNMATCH_CONFIRM, "Bu tutar faturadan çözülür ve carinin alacak bakiyesine döner. Kasa ve cari bakiyesi değişmez.");
});
t("M4: eşleşmeyi kaldır hata ve sonuç metinleri", () => {
  assert.match(m.unmatchErrorText(err(409, "COLLECTION_NOT_ALLOCATION")), /tahsilatı silin/);
  for (const c of ["INVOICE_NOT_FOUND", "COLLECTION_NOT_FOUND", "INVOICE_BUSY", "INVOICE_BLOCKED", "OPERATION_PENDING", "COLLECTION_VOIDED"])
    assert.ok(m.unmatchErrorText(err(409, c)).length > 15, c);
  assert.match(m.unmatchErrorText(err(0)), /yeniden gönderebilirsiniz/);
  assert.equal(m.unmatchErrorText(err(400, "X", "Sunucu metni")), "Sunucu metni");
  assert.equal(m.unmatchDoneText({ released_amount: 300, currency: "TRY" }), "₺300,00 faturadan çözüldü; carinin alacak bakiyesine döndü.");
  assert.match(m.unmatchDoneText({ replayed: true }), /zaten/);
});

// M6
const self = { id: "c1", currency: "TRY" };
t("M6: virman hedefi: kendisi, siparişten türetilen ve farklı para birimli kartlar listelenmez", () => {
  const list = [
    { id: "c1", name: "Kendisi", currency: "TRY", source: "registered" },
    { id: "c2", name: "Hedef", currency: "TRY", source: "registered" },
    { id: "e:ayse@x", name: "Sipariş", source: "orders" },
    { id: "c3", name: "Dolar", currency: "USD", source: "registered" },
    { id: "c4", name: "TL eski", currency: "TRL", source: "registered" },
  ];
  assert.deepEqual(m.transferTargets(list, self).map((x) => x.id), ["c2", "c4"]);
});
t("M6: virman formu doğrulaması: hedef, tutar (dize, 2 ondalık), tarih, zorunlu açıklama", () => {
  const ok = { targetId: "c2", amount: "150,50", date: "2026-11-13", note: "Mahsup" };
  assert.equal(m.transferFormError(ok, "2026-11-13"), null);
  assert.match(m.transferFormError({ ...ok, targetId: "" }, "2026-11-13"), /cari seçin/);
  assert.match(m.transferFormError({ ...ok, amount: "0" }, "2026-11-13"), /tutar/);
  assert.match(m.transferFormError({ ...ok, amount: "1,234" }, "2026-11-13"), /tutar/);
  assert.match(m.transferFormError({ ...ok, note: "  " }, "2026-11-13"), /[Aa]çıklama/);
  assert.match(m.transferFormError({ ...ok, date: "" }, "2026-11-13"), /[Tt]arih/);
  assert.match(m.transferFormError({ ...ok, date: "2026-11-20" }, "2026-11-13"), /ileri/);
  assert.deepEqual(m.transferBody(ok), { target_customer_id: "c2", amount: "150.50", date: "2026-11-13", note: "Mahsup" });
  assert.deepEqual(m.transferPatchBody({ amount: "99", date: "2026-11-12", note: " x " }), { amount: "99.00", date: "2026-11-12", note: "x" });
});
t("M6: virman hata metinleri", () => {
  const codes = ["TRANSFER_SAME_CUSTOMER", "TRANSFER_SAME_PARTY", "TRANSFER_NOTE_REQUIRED", "IDEMPOTENCY_KEY_REQUIRED", "TRANSFER_NOT_FOUND", "TRANSFER_VOIDED", "PARTY_LEDGER_OFF", "CURRENCY_MISMATCH", "AMOUNT_INVALID", "DATE_INVALID", "CUSTOMER_NOT_FOUND", "IDEMPOTENCY_CONFLICT", "OPERATION_PENDING"];
  for (const c of codes) assert.ok(m.transferErrorText(err(409, c)).length > 15, c);
  assert.match(m.transferErrorText(err(422, "CURRENCY_MISMATCH")), /para birimi/);
  assert.match(m.transferErrorText(err(500, "MONEY_INCOMPLETE")), /yeniden gönder/i);
  assert.match(m.transferErrorText(err(0)), /kaydedilmiş olabilir/);
});
t("M6: ekstrede virman satırı: düzenle/sil yalnız actions'a göre", () => {
  const row = { description: "Virman: Hedef carisine", transfer: { id: "t1", amount: "150.00" }, actions: { edit: true, void: true } };
  assert.deepEqual(m.transferRowActions(row), { edit: true, void: true });
  assert.equal(m.transferRowActions({ ...row, actions: { edit: false, void: false } }), null);
  assert.equal(m.transferRowActions({ description: "Satış faturası", actions: { edit: true, void: true } }), null);
});

// M7
t("M7: bakiye ipucu: eksi bakiyede 'Alacak bakiyesi'", () => {
  assert.equal(m.balanceHint(-120), "Alacak bakiyesi · biz cariye borçluyuz");
  assert.equal(m.balanceHint(500), "Alacağınız");
  assert.equal(m.balanceHint(0), "Bakiye");
  assert.equal(m.balanceListHint(-1), "Alacak bakiyesi");
  assert.equal(m.balanceListHint(1), "Alacağınız var");
  assert.equal(m.balanceListHint(0), undefined);
});

t("partyRouteParams: cari listesi ve sipariş ayrıntısı aynı parametrelerle cari ekranını açar", () => {
  const base = { id: "c1", name: "Elif Kaya", balance: 4725, currency: "TRY", source: "registered", origin: "customers", balanceAvailable: true,
    actions: { collect: true, view_ledger: true, edit: true, delete: false, view_orders: true } };
  assert.deepEqual(m.partyRouteParams(base), { id: "c1", name: "Elif Kaya", balance: "4725", registered: "1", origin: "customers", source: "registered", ledger: "1", edit: "1", del: "0", ro: "0", orders: "1", currency: "TRY" });
  const legacy = { ...base, origin: "read_model", source: "legacy", balanceAvailable: false, company_name: "Kaya Ltd." };
  const r = m.partyRouteParams(legacy);
  assert.equal(r.name, "Kaya Ltd."); assert.equal(r.balance, "0"); assert.equal(r.currency, ""); assert.equal(r.registered, "1");
  assert.equal(m.partyRouteParams({ ...base, source: "obihub", origin: "read_model" }).edit, "0");
  assert.equal(m.partyRouteParams({ ...base, source: "orders" }).registered, "0");
});

t("G4-30 ayna: read_only caride düzenle/sil kapalı, ro=1 (tahsilat ve virman ekranda gizlenir)", () => {
  const p = m.partyRouteParams({ id: "c1", name: "Paraşüt Cari", origin: "read_model", source: "legacy", balanceAvailable: true, balance: 10, read_only: true, actions: { collect: true, edit: true, delete: true, view_ledger: true } });
  assert.equal(p.edit, "0");
  assert.equal(p.del, "0");
  assert.equal(p.ro, "1");
  const q = m.partyRouteParams({ id: "c2", origin: "read_model", source: "legacy", actions: { edit: true } });
  assert.equal(q.ro, "0");
});
console.log(`\n${n} test geçti`);
