// Birim testi: src/finance-reports.ts (P6.1 Satışlar/Giderler, P6.2 Kasa/Banka ve Nakit Akışı). Sunucu: backend/reports_period.py,
// backend/reports_cash.py; web: pages/reports/periodModel.js, cashReportsModel.js. Çalıştırma: node dev/test-finance-reports.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../frontend/package.json"));
const ts = require("typescript");
const src = readFileSync(join(here, "../frontend/src/finance-reports.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("bugün İstanbul gününe göre; hazır dönemler", () => {
  assert.equal(m.todayTr(new Date("2026-11-21T22:30:00Z")), "2026-11-22");
  assert.deepEqual(m.presetRange("month", "2026-11-22"), { from: "2026-11-01", to: "2026-11-22" });
  assert.deepEqual(m.presetRange("prev", "2026-01-10"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(m.presetRange("quarter", "2026-11-22"), { from: "2026-08-25", to: "2026-11-22" });
  assert.deepEqual(m.presetRange("year", "2026-11-22"), { from: "2026-01-01", to: "2026-11-22" });
  assert.equal(m.presetOf("2026-11-01", "2026-11-22", "2026-11-22"), "month");
  assert.equal(m.presetOf("2026-11-02", "2026-11-22", "2026-11-22"), null);
});
t("kırılım: varsayılan sunucuyla aynı; gün en çok 93 gün", () => {
  assert.equal(m.defaultGroup("2026-11-01", "2026-11-30"), "day");
  assert.equal(m.defaultGroup("2026-09-01", "2026-11-30"), "week");
  assert.equal(m.defaultGroup("2026-01-01", "2026-11-30"), "month");
  assert.equal(m.groupAllowed("day", "2026-01-01", "2026-11-30"), false);
  assert.equal(m.fixGroup("day", "2026-01-01", "2026-11-30"), "month");
  assert.equal(m.fixGroup("year", "2026-01-01", "2026-11-30"), "year");
});
t("dönem raporu yolu ve hata metinleri", () => {
  assert.equal(m.periodPath("sales", "2026-11-01", "2026-11-22", "day", false), "/reports/sales?from=2026-11-01&to=2026-11-22&group=day&rows=false");
  assert.equal(m.periodPath("expenses", "2026-11-01", "2026-11-22", "week", true), "/reports/expenses?from=2026-11-01&to=2026-11-22&group=week&rows=true");
  assert.match(m.periodErrorText({ code: "REPORT_TOO_LARGE" }, "sales"), /Dönemi daraltın/);
  assert.match(m.periodErrorText({ code: "SALES_REPORT_PARAMS_INVALID" }, "sales"), /dönem geçersiz/);
  assert.match(m.periodErrorText({ code: "EXPENSE_REPORT_REVIEW_REQUIRED" }, "expenses"), /destek/);
  assert.match(m.periodErrorText({ status: 403 }, "sales"), /yetkiniz yok/);
  assert.match(m.periodErrorText({ status: 500 }, "sales"), /Biraz sonra/);
});
t("dönem etiketi ve tarih", () => {
  assert.equal(m.periodLabel({ key: "2026-11-05" }, "day"), "05.11.2026");
  assert.equal(m.periodLabel({ key: "2026-11-02", to: "2026-11-08" }, "week"), "02.11 – 08.11.2026");
  assert.equal(m.periodLabel({ key: "2026-11-01" }, "month"), "Kasım 2026");
  assert.equal(m.periodLabel({ key: "2026-01-01" }, "year"), "2026");
});
t("para birimi seçimi: istenen, yoksa TRY, yoksa ilki", () => {
  const list = [{ currency: "USD" }, { currency: "TRY" }];
  assert.equal(m.pickCurrency(list, "USD").currency, "USD");
  assert.equal(m.pickCurrency(list, "EUR").currency, "TRY");
  assert.equal(m.pickCurrency([{ currency: "EUR" }], "").currency, "EUR");
  assert.equal(m.pickCurrency([], ""), null);
});
t("özet kartları ve notlar: diğer vergi yalnız sıfır değilse; KDV bilinmeyen ve TL karşılığı", () => {
  const cur = { currency: "USD", totals: { count: 4, return_count: 1, net: "100.00", vat: "20.00", other_taxes: "0.00", gross: "120.00", vat_unknown_count: 2, vat_unknown_gross: "30.00" },
    try_equivalent: { gross: "4100.00", missing_rate_count: 1 } };
  assert.deepEqual(m.periodFigs(cur).map((f) => f.label), ["Net (KDV hariç)", "KDV", "Toplam (KDV dahil)"]);
  assert.equal(m.periodFigs(cur)[2].hint, "4 belge, 1 iade");
  assert.equal(m.periodFigs({ totals: { other_taxes: "5.00" } }).length, 4);
  const notes = m.periodNotes(cur, "sales");
  assert.match(notes[0], /2 belgenin KDV tutarı bilinmiyor/);
  assert.match(notes[1], /TL karşılığı/);
  assert.match(notes[1], /1 belgede kur yok/);
  assert.match(m.periodNotes({ totals: { vat_unknown_count: 1, vat_unknown_gross: "1" } }, "expenses")[0], /1 kaydın/);
  assert.equal(m.hasAnyDocument([{ totals: { count: 0 } }]), false);
  assert.equal(m.hasAnyDocument([{ totals: { count: 1 } }]), true);
});
t("kırılım türleri ve Paraşüt notu", () => {
  assert.deepEqual(m.REPORT.sales.dims.map((d) => d[1]), ["Müşteri", "Kategori"]);
  assert.deepEqual(m.REPORT.expenses.dims.map((d) => d[1]), ["Kategori", "Tedarikçi", "Etiket"]);
  assert.equal(m.PARASUT_NOTE, "Paraşüt verisi yalnız ObiHub'a aktarılan dönemleri kapsar.");
});
t("belge satırı görünümü", () => {
  const r = { kind: "pos_sale", is_return: false, number: "POS-1", date: "2026-11-05", party_name: "Ali", gross: "50.00", currency: "TRY", origin: "obihub" };
  assert.deepEqual(m.docLine(r, "sales"), { title: "POS-1", sub: "POS satışı · 05.11.2026 · Ali", gross: "50.00" });
  assert.equal(m.docLine({ kind: "purchase_invoice", is_return: true, date: "2026-11-01", description: "Kira" }, "expenses").sub, "Gider faturası (iade) · 01.11.2026 · Kira");
});
t("CSV: BOM, noktalı virgül, virgüllü ondalık, tırnak kaçışı, para birimine süzülür", () => {
  const rows = [
    { kind: "sales_invoice", number: "F1", date: "2026-11-05", party_name: 'Ali "Usta"; Ltd', category_name: "", vat_known: true, net: "100.00", vat: "20.00", other_taxes: "0.00", gross: "120.00", currency: "TRY", origin: "obihub" },
    { kind: "sales_invoice", number: "F2", date: "2026-11-06", party_name: "X", vat_known: false, net: "0", vat: "0", other_taxes: "0", gross: "10.00", currency: "USD", origin: "parasut" },
  ];
  const csv = m.periodCsv("sales", rows, "TRY");
  assert.ok(csv.startsWith("﻿Tür;Belge no;Tarih;Müşteri;Kategori;Net;KDV;Diğer vergiler;Toplam;Kaynak\r\n"));
  assert.ok(csv.includes('Satış faturası;F1;05.11.2026;"Ali ""Usta""; Ltd";;100,00;20,00;0,00;120,00;ObiHub'));
  assert.ok(!csv.includes("F2"));
  const exp = m.periodCsv("expenses", [{ ...rows[1], currency: "TRY", tag_names: ["a", "b"] }], "TRY");
  assert.ok(exp.includes("Tedarikçi;Kategori;Etiketler;Net"));
  assert.ok(exp.includes(";a, b;;;;10,00;Paraşüt"));
  assert.equal(m.csvName("sales", "TRY", "2026-11-01", "2026-11-22"), "satislar-raporu-TRY-2026-11-01-2026-11-22.csv");
});
t("kasa/banka: hesaplar para birimine göre, arşiv ve Paraşüt etiketi, transfer ayrı", () => {
  const data = { date_from: "2026-11-01", date_to: "2026-11-22",
    accounts: [{ id: "a", name: "Kasa", account_type: "cash", currency: "TRY", opening: "1", in: "2", out: "1", net: "1", closing: "2", transfer_in: "0.00", transfer_out: "15.00", archived: false },
      { id: "b", name: "Eski", account_type: "bank", currency: "TRY", archived: true, transfer_in: "0.00", transfer_out: "0.00" },
      { id: "c", name: "Dolar", account_type: "bank", currency: "USD", read_only: true, transfer_in: "0", transfer_out: "0" }],
    currencies: [{ currency: "TRY", opening: "1" }, { currency: "USD" }] };
  const v = m.cashBankView(data, "");
  assert.equal(v.code, "TRY");
  assert.deepEqual(v.accounts.map((a) => [a.name, a.typeLabel, a.badge, a.hasTransfer]), [["Kasa", "Kasa", "", true], ["Eski", "Banka", "Arşivde", false]]);
  assert.equal(m.cashBankView(data, "USD").accounts[0].badge, "Paraşüt");
  assert.equal(m.cashBankPath("2026-11-01", "2026-11-22"), "/reports/cash-bank?date_from=2026-11-01&date_to=2026-11-22");
});
t("nakit akışı: dönem etiketi, satır grupları, vadesi geçmiş ayrı, bağlantı türleri", () => {
  assert.equal(m.flowLabel({ start: "2026-11-16", end: "2026-11-22" }, "week"), "16–22 Kas");
  assert.equal(m.flowLabel({ start: "2026-10-26", end: "2026-11-01" }, "week"), "26 Eki – 1 Kas");
  assert.equal(m.flowLabel({ start: "2026-12-01", end: "2026-12-31" }, "month"), "Ara 2026");
  assert.equal(m.cashflowPath("month"), "/reports/cashflow?view=month");
  const block = { rows: [{ key: "receivables", direction: "in", label: "Beklenen tahsilatlar" }, { key: "scheduled_out", direction: "out", label: "İleri tarihli çıkışlar" }, { key: "payables", direction: "out", label: "Beklenen ödemeler" }],
    items: [{ row: "receivables", period: 1, overdue: false, later: false }, { row: "receivables", overdue: true }, { row: "payables", later: true }] };
  const g = m.flowGroups(block);
  assert.deepEqual(g.map((x) => [x.title, x.rows.map((r) => r.key)]), [["Girişler", ["receivables"]], ["Çıkışlar", ["scheduled_out", "payables"]]]);
  assert.equal(m.cellItems(block, { row: "receivables", col: 1 }).length, 1);
  assert.equal(m.cellItems(block, { row: "receivables", col: "overdue" }).length, 1);
  assert.equal(m.cellItems(block, { row: "payables", col: "later" }).length, 1);
  assert.equal(m.flowLinkLabel({ link: { type: "cash_account" } }), "Kasa/Banka");
  assert.equal(m.flowLinkLabel({ link: { type: "expense_draft" } }), "Gider taslağı");
  assert.equal(m.flowLinkLabel({ link: { type: "cheque" } }), "Çek");
  assert.equal(m.STARTING_NOTE, "Başlangıç bakiyesi: etkin kasa ve banka hesaplarının bugünkü bakiyesi. Vadesi geçmiş kalemler bakiyeye eklenmez.");
});
t("para metni: işaret ve binlik", () => {
  assert.equal(m.money("1234.5", "TRY"), "₺1.234,50");
  assert.equal(m.money("-20.00", "USD"), "−$20,00");
  assert.equal(m.money("10", "GBP"), "10,00 GBP");
  assert.equal(m.money(null, "TRY"), "—");
});
console.log(`${n} test geçti`);
