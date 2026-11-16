// Birim testi: src/followup.ts — Dalga 2: yaşlandırma (reports/aging), tahsilat takibi (collection-followup, hatırlatma),
// cari notları ve mesajları (timeline). Çalıştırma: node dev/test-followup.mjs  (obihub-mobile kökünden)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/followup.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

const zero = { current: "0.00", "1-30": "0.00", "31-60": "0.00", "61-90": "0.00", "90+": "0.00" };
const aging = {
  as_of: "2026-11-16",
  currencies: [
    { currency: "USD", receivable: { totals: { ...zero, "1-30": "80.00", total: "80.00" }, count: 1, parties: [] }, payable: { totals: { ...zero, total: "0.00" }, count: 0, parties: [] } },
    { currency: "TRY", receivable: { totals: { current: "100.00", "1-30": "200.00", "31-60": "900.00", "61-90": "0.00", "90+": "500.00", total: "1700.00" }, count: 5,
      parties: [{ party_name: "Ayşe Market", total: "1000.00", count: 3 }, { party_name: "Bora Ltd", total: "100.00", count: 1 }, { party_name: "Paraşüt Müşteri", total: "600.00", count: 1 }] },
      payable: { totals: { ...zero, "90+": "700.00", total: "700.00" }, count: 1, parties: [{ party_name: "Tedarikçi Y", total: "700.00", count: 1 }] } },
  ],
  scope: { source: "obihub_ledger" },
};
t("yaşlandırma: para birimi başına (TRY önce), kovalar sırayla, gecikmiş toplam, en büyük cariler", () => {
  const v = m.agingView(aging, "receivable");
  assert.deepEqual(v.blocks.map((b) => b.currency), ["TRY", "USD"]);
  const tr = v.blocks[0];
  assert.deepEqual(tr.buckets.map((b) => [b.key, b.label, b.amount]), [["current", "Vadesi gelmemiş", 100], ["1-30", "1-30 gün", 200], ["31-60", "31-60 gün", 900], ["61-90", "61-90 gün", 0], ["90+", "90+ gün", 500]]);
  assert.equal(tr.total, 1700); assert.equal(tr.overdue, 1600); assert.equal(tr.count, 5);
  assert.deepEqual(tr.top.map((p) => p.name), ["Ayşe Market", "Paraşüt Müşteri", "Bora Ltd"]);
  assert.equal(v.warning, null);
  assert.deepEqual(m.agingView(aging, "payable").blocks.map((b) => b.currency), ["TRY"]);
});
t("yaşlandırma: yeni defter okunamadıysa uyarı", () => {
  assert.equal(m.agingView({ ...aging, scope: { new_ledger: "unavailable" } }, "payable").warning, "Bazı borçlar okunamadı; toplam eksik olabilir.");
  assert.deepEqual(m.agingView(null, "receivable").blocks, []);
});
t("tahsilat takibi: gecikme / kalan gün metni, eylemler, mahsup bildirimi", () => {
  const f = m.followupView({ remaining: 800, currency: "TRY", due_date: "2026-11-01", overdue_days: 15, due_in_days: 0, aging_bucket: "1-30",
    offsets: [{ id: "o1", status: "releasing", can_release: true }], reminders: [{ at: "2026-11-10T10:00:00Z", to: ["e***@x.test"] }],
    offset_notice: "Bu carinin açık borcu var.", default_recipient: "elif@example.test", actions: { due_change: true, remind: true, offset: false } });
  assert.equal(f.dueText, "15 gün gecikti"); assert.equal(f.canDue, true); assert.equal(f.canRemind, true);
  assert.equal(f.lastReminder, "2026-11-10T10:00:00Z"); assert.equal(f.reminderCount, 1);
  assert.equal(f.notice, "Bu carinin açık borcu var."); assert.equal(f.recipient, "elif@example.test");
  assert.deepEqual(f.releasing, ["o1"]);
  assert.equal(m.followupView({ remaining: 100, due_in_days: 3, overdue_days: 0, actions: {} }).dueText, "Vadeye 3 gün var");
  assert.equal(m.followupView({ remaining: 100, due_in_days: 0, overdue_days: 0, due_date: "2026-11-16", actions: {} }).dueText, "Vadesi bugün");
  assert.equal(m.followupView({ remaining: 0, actions: {} }).dueText, null);
});
t("hatırlatma gövdesi: alıcı denetimi, onaysız önizleme, onaylı gönderim anahtarla", () => {
  assert.equal(m.reminderBody("kotu", "", false, "k1").error, "Geçerli bir e-posta adresi girin.");
  assert.deepEqual(m.reminderBody("a@x.test, b@x.test", " Merhaba ", false, "k1").body, { to: ["a@x.test", "b@x.test"], message: "Merhaba", confirm: false });
  assert.deepEqual(m.reminderBody("a@x.test", "", true, "k1").body, { to: ["a@x.test"], message: "", confirm: true, idempotency_key: "k1" });
  assert.match(m.followupErrorText({ code: "EMAIL_NOT_CONFIGURED" }), /etkin değil/);
  assert.match(m.followupErrorText({ status: 429 }), /Saatte/);
  assert.equal(m.followupErrorText({ code: "X", message: "Sunucu metni." }), "Sunucu metni.");
});
t("cari zaman çizelgesi: not / mesaj / etkinlik etiketi, silinebilirlik, fatura bağlantısı", () => {
  const rows = m.timelineRows({ items: [
    { id: "note_1", kind: "note", type: "note", at: "2026-11-16T09:00:00Z", title: "Not", body: "Arandı, hafta sonu ödeyecek", actor: "Ece", can_delete: true },
    { id: "r1", kind: "message", type: "reminder_sent", at: "2026-11-15T09:00:00Z", title: "Tahsilat hatırlatması · OBI1", body: "e***@x · Kalan ₺800", link: { type: "invoice", id: "li9" }, can_delete: false },
    { id: "ofs_1", kind: "activity", type: "offset", at: "2026-11-14T09:00:00Z", title: "Mahsup · ₺400", body: "OBI1 ↔ GF-2", link: { type: "invoice", id: "li9" } },
  ] });
  assert.deepEqual(rows.map((r) => [r.tag, r.canDelete, r.invoiceId]), [["Not", true, null], ["Mesaj", false, "li9"], ["Etkinlik", false, "li9"]]);
  assert.equal(rows[0].body, "Arandı, hafta sonu ödeyecek"); assert.equal(rows[0].actor, "Ece");
  assert.equal(m.noteProblem("  "), "Not boş olamaz.");
  assert.equal(m.noteProblem("x".repeat(2001)), "Not en çok 2000 karakter olabilir.");
  assert.equal(m.noteProblem("Tamam"), null);
  assert.deepEqual(m.TIMELINE_KINDS.map((k) => k[0]), ["all", "notes", "messages"]);
});

console.log(`\n${n} test geçti`);
