// Birim testi: src/kasa-ui.ts — D-15 kasa listesi, arşiv/sil, hareket listesi (docs/pm/tasarim/D-15.md).
// Çalıştırma: node dev/test-kasa-ui.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/kasa-ui.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("liste sorgusu: aktif varsayılan, arşiv sekmesi status=archived", () => {
  assert.equal(m.accountsPath("active"), "/finance/accounts");
  assert.equal(m.accountsPath("archived"), "/finance/accounts?status=archived");
  assert.equal(m.accountsPath("all"), "/finance/accounts?status=all");
});

const resp = {
  items: [
    { id: "acc-cash", name: "Nakit", currency: "TRY", balance: 130, group: "obihub" },
    { id: "prs-1", name: "Paraşüt Banka", currency: "TRY", balance: 0, group: "parasut", read_only: true },
    { id: "acc-usd", name: "Dolar", currency: "USD", balance: 50, group: "obihub" },
  ],
  groups: [
    { key: "parasut", label: "Paraşüt hesapları", count: 1, account_ids: ["prs-1"] },
    { key: "obihub", label: "ObiHub hesapları", count: 2, account_ids: ["acc-cash", "acc-usd"] },
  ],
  counts: { active: 3, archived: 1 },
  totals_by_currency: { USD: 50, TRY: 130 },
  archived_totals_by_currency: { TRY: 500 },
};

t("gruplar: sunucu sırası; tek grup (yalnız ObiHub) başlıksız", () => {
  const g = m.accountSections(resp);
  assert.deepEqual(g.map((s) => [s.title, s.items.map((a) => a.id)]), [["Paraşüt hesapları", ["prs-1"]], ["ObiHub hesapları", ["acc-cash", "acc-usd"]]]);
  const one = m.accountSections({ items: [resp.items[0]], groups: [{ key: "obihub", label: "ObiHub hesapları", account_ids: ["acc-cash"] }] });
  assert.deepEqual(one.map((s) => [s.title, s.items.length]), [["Hesaplar", 1]]);
});
t("gruplar: eski sunucu (groups yok) → tüm hesaplar tek bölüm", () => {
  assert.deepEqual(m.accountSections({ items: resp.items }).map((s) => [s.title, s.items.length]), [["Hesaplar", 3]]);
});
t("para birimi toplamları: TRY önde, asla tek sayıya inmez; yoksa satırlardan", () => {
  assert.deepEqual(m.currencyTotals(resp), [{ currency: "TRY", amount: 130 }, { currency: "USD", amount: 50 }]);
  assert.deepEqual(m.currencyTotals({ items: [{ currency: "TL", balance: 10 }, { currency: "EUR", balance: 2 }, { currency: "TRY", balance: 5 }] }), [
    { currency: "TRY", amount: 15 },
    { currency: "EUR", amount: 2 },
  ]);
});
t("arşivli hesap notu: bakiyesi olan arşiv varsa", () => {
  assert.match(m.archivedNote(resp, (v, c) => `${v} ${c}`), /Arşivli hesaplar bu toplama dahil değil: 500 TRY/);
  assert.equal(m.archivedNote({ archived_totals_by_currency: { TRY: 0 } }, String), null);
  assert.equal(m.archivedNote({}, String), null);
});
t("sekme sayaçları counts'tan", () => {
  assert.deepEqual(m.tabCounts(resp), { active: 3, archived: 1 });
  assert.deepEqual(m.tabCounts({ items: [1, 2] }), { active: 2, archived: 0 });
});

t("hesap düğmeleri: sunucu actions; yoksa eski davranış (aynalı değilse hareket eklenir, arşiv yok)", () => {
  const a = m.accountActions({ actions: { add_movement: true, transfer: true, edit: true, archive: true, unarchive: false, delete: false } });
  assert.deepEqual(a, { addMovement: true, transfer: true, archive: true, unarchive: false, remove: false });
  assert.deepEqual(m.accountActions({}), { addMovement: true, transfer: true, archive: false, unarchive: false, remove: false });
  assert.deepEqual(m.accountActions({ read_only: true }), { addMovement: false, transfer: false, archive: false, unarchive: false, remove: false });
  assert.deepEqual(m.accountActions({ archived: true }), { addMovement: false, transfer: false, archive: false, unarchive: false, remove: false });
});

t("arşiv hatası: bakiye sıfır değilse onay sorulur (bakiye metniyle), diğer kodlar Türkçe metin", () => {
  const r = m.archiveError({ status: 409, code: "ACCOUNT_BALANCE_NOT_ZERO", message: "Hesabın bakiyesi sıfır değil.", data: { balance: 30, currency: "TRY" } });
  assert.equal(r.confirm, true);
  assert.match(r.text, /Kasa ve Bankalar listelerinde görünmeyecek/);
  assert.match(r.text, /bakiye/i);
  assert.deepEqual(m.archiveError({ status: 409, code: "ACCOUNT_DEFAULT_LOCKED", message: "Sunucu hatası (409)" }), { confirm: false, text: "Varsayılan kasa arşivlenemez ve silinemez." });
  assert.equal(m.archiveError({ status: 409, code: "ACCOUNT_HAS_MOVEMENTS", message: "" }).text, "Hareketi olan hesap silinemez; arşivleyebilirsiniz.");
  assert.equal(m.archiveError({ status: 409, code: "OPERATION_PENDING", message: "" }).text, "Bu hesaba yazacak bir işlem sürüyor; biraz sonra yeniden deneyin.");
  assert.equal(m.archiveError({ status: 409, code: "ACCOUNT_INACTIVE", message: "" }).text, "Bu hesap arşivde; hareket yazılamaz.");
  assert.equal(m.archiveError({ status: 400, code: "X", message: "Özel ileti" }).text, "Özel ileti");
});
t("onay metinleri (Paraşüt dili)", () => {
  assert.match(m.ARCHIVE_CONFIRM_TEXT, /etkilenmeyecek/);
  assert.match(m.DELETE_CONFIRM_TEXT, /geri alınamaz/);
});

t("hareket sorgusu: imleç, sıra, tarih; ilk sayfada geri alınanlar istenir", () => {
  assert.equal(m.movementsPath("acc 1", {}), "/finance/accounts/acc%201/movements?limit=50&include_undone=true");
  assert.equal(m.movementsPath("a", { cursor: "XYZ=", limit: 20 }), "/finance/accounts/a/movements?limit=20&cursor=XYZ%3D");
  assert.equal(m.movementsPath("a", { dateFrom: "2026-11-01", dateTo: "2026-11-30", direction: "in" }), "/finance/accounts/a/movements?limit=50&date_from=2026-11-01&date_to=2026-11-30&direction=in");
});
t("hareket satırı: yön, açılış öncesi etiketi, yürüyen bakiye yalnız sayıysa", () => {
  const r = m.movementRow({ entry_type: "transfer_out", amount: 12, direction: "out", running_balance: 88, before_opening: false, source: { label: "Virman" }, related_account_name: "Banka" });
  assert.equal(r.incoming, false);
  assert.equal(r.balance, 88);
  assert.equal(r.tag, null);
  assert.equal(r.typeLabel, "Giden virman");
  const b = m.movementRow({ entry_type: "income", amount: 20, running_balance: null, before_opening: true });
  assert.equal(b.incoming, true);
  assert.equal(b.balance, null);
  assert.equal(b.tag, "Açılış öncesi");
  assert.equal(m.movementRow({ entry_type: "income", amount: 1, direction: "out" }).incoming, false);
});
t("hareket toplamları: giriş/çıkış/net; açılış öncesi ayrı not", () => {
  const s = m.movementTotals({ totals: { currency: "TRY", in: 30, out: 5, net: 25, count: 4, before_opening: { in: 70, out: 0, count: 2 } } });
  assert.deepEqual([s.in, s.out, s.net, s.count, s.beforeCount], [30, 5, 25, 4, 2]);
  assert.match(s.beforeNote, /2 hareket açılış tarihinden önce/);
  assert.equal(m.movementTotals({}), null);
});
t("seçicide arşivli ve Paraşüt aynalı hesap gösterilmez", () => {
  assert.equal(m.pickable({ archived: true }), false);
  assert.equal(m.pickable({ read_only: true }), false);
  assert.equal(m.pickable({ actions: { add_movement: false } }), false);
  assert.equal(m.pickable({ id: "a" }), true);
});

t("Dalga 4: bakiye sabitleme gövdesi — hedef (eksi olabilir), tarih, açıklama", () => {
  assert.deepEqual(m.adjustBody("-1.250,50", "16.11.2026", " Banka ekstresi "), { body: { target_balance: "-1250.50", entry_date: "2026-11-16", description: "Banka ekstresi" }, error: null });
  assert.equal(m.adjustBody("", "2026-11-16", "").error, "Hedef bakiyeyi girin.");
  assert.equal(m.adjustBody("abc", "2026-11-16", "").error, "Hedef bakiyeyi girin.");
  assert.equal(m.adjustBody("100", "", "").error, "Tarihi girin (GG.AA.YYYY).");
  assert.equal(m.adjustDiffText(130, "100", "TRY", (v, c) => `${v} ${c}`), "Fark: -30 TRY (bakiye 130 TRY → 100 TRY)");
  assert.match(m.adjustErrorText({ code: "BALANCE_ADJUSTMENT_BUSY" }), /birkaç saniye/);
  assert.match(m.adjustErrorText({ code: "BALANCE_ALREADY_AT_TARGET" }), /zaten/);
});
t("Dalga 4 / D-05: geri alınabilen hareket — elle, virman, bakiye düzeltme; diğerleri kaynağından", () => {
  assert.equal(m.canUndo({ source_type: "manual" }), true);
  assert.equal(m.canUndo({ source: { type: "transfer" } }), true);
  assert.equal(m.canUndo({ source_type: "balance_adjustment" }), true);
  assert.equal(m.canUndo({ source_type: "invoice_payment" }), false);
  assert.equal(m.canUndo({ source_type: "parasut_trx" }), false);
  assert.equal(m.canUndo({ source_type: "manual", before_opening: true }), true);
  assert.equal(m.movementLabel({ source_type: "balance_adjustment" }), "Bakiye düzeltme");
  assert.equal(m.movementLabel({ source: { label: "Elle girilen hareket" } }), "Elle girilen hareket");
});
console.log(`\n${n} test geçti`);
