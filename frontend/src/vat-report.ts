// KDV raporu + devir (saf modül; birim testi dev/test-vat-report.mjs). D-20: GET /reports/vat?month=YYYY-AA; P6.4: yanıttaki `carry`
// (yalnız TL zinciri) ve açılış devri GET|PUT|DELETE /reports/vat/carry-opening {month, amount} (yazma settings.manage).
// Web: pages/reports/vatModel.js, VatReportPage.jsx. Tutarlar dize kalır; para birimleri toplanmaz; beyanname değildir.
import { dateTr, money } from "./finance-reports";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const CARRY_PATH = "/reports/vat/carry-opening";

export const isMonth = (v: unknown) => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function currentMonth(now = new Date()) {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 7); // Europe/Istanbul (UTC+3)
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
export const monthLabel = (month: unknown) => (isMonth(month) ? `${MONTHS[Number(String(month).slice(5)) - 1]} ${String(month).slice(0, 4)}` : "");
export const vatPath = (month: string) => `/reports/vat?month=${month}`;

export const rateLabel = (rate: unknown) => (rate === null || rate === undefined ? "Oran bilinmiyor" : `%${String(rate).replace(".", ",")}`);
export function rowRates(row: any) {
  const rates = Array.isArray(row?.rates) ? row.rates : [];
  return rates.length ? rates.map((r: any) => rateLabel(r.rate)).join(", ") : "—";
}

export function resultOf(cur: any) {
  const r = cur?.result || {};
  if (r.status === "payable") return { label: "Ödenecek KDV", amount: r.payable, tone: "payable" };
  if (r.status === "carry_forward") return { label: "Devreden KDV", amount: r.carry_forward, tone: "carry" };
  return { label: "KDV farkı yok", amount: "0.00", tone: "zero" };
}
export const hasAnyDocument = (currencies: any[]) =>
  (Array.isArray(currencies) ? currencies : []).some((c) => [c?.output, c?.input].some((s) => Number(s?.count) > 0 || Number(s?.vat_unknown_count) > 0));

export function vatErrorText(e: any) {
  if (Number(e?.status) === 403) return "Raporları görme yetkiniz yok. Yöneticinizden Raporlar iznini isteyin.";
  if (e?.code === "VAT_REPORT_PARAMS_INVALID") return "Seçilen ay geçersiz. Başka bir ay seçin.";
  if (e?.code === "VAT_REPORT_TOO_LARGE") return "Bu ayda çok fazla belge var; rapor tek seferde açılamıyor. Destek ekibine yazın.";
  if (e?.code === "VAT_REPORT_REVIEW_REQUIRED") return "Bir alış belgesi okunamadı; destek ekibine bildirin.";
  if (Number(e?.status) === 429) return "Çok fazla istek gönderildi; birkaç saniye sonra yeniden deneyin.";
  return "KDV raporu şu anda okunamadı. Biraz sonra yeniden deneyin.";
}

export function vatNotes(cur: any, data: any) {
  const code = cur?.currency || "TRY";
  const out = cur?.output || {};
  const inp = cur?.input || {};
  const notes: string[] = [];
  if (Number(inp.withholding) > 0) notes.push(`Alışta tevkif ettiğiniz KDV: ${money(inp.withholding, code)} (2 no'lu KDV beyannamesi); yukarıdaki sonuca dahil değildir.`);
  const unknown = [["Satışta", out], ["Alışta", inp]].filter(([, s]: any) => Number(s?.vat_unknown_count) > 0);
  if (unknown.length)
    notes.push(
      `${unknown.map(([label, s]: any) => `${label} ${s.vat_unknown_count} kaydın KDV tutarı bilinmiyor (brüt ${money(s.vat_unknown_amount, code)}).`).join(" ")} Bu kayıtlar toplama dahil değil; KDV'sini tamamlayınca rapora girer.`
    );
  const te = cur?.try_equivalent;
  if (te)
    notes.push(
      `TL karşılığı (belge kuruyla, yalnız bilgi): hesaplanan KDV ${money(te.output_vat, "TRY")}, indirilecek KDV ${money(te.input_vat, "TRY")}.${Number(te.missing_rate_count) > 0 ? ` ${te.missing_rate_count} belgede kur yok; TL karşılığına dahil değil.` : ""}`
    );
  const prev = (data?.previous?.currencies || []).find((c: any) => c.currency === code);
  if (prev) {
    const net = Number(prev.kdv1_net);
    notes.push(
      `${monthLabel(data?.previous?.month || shiftMonth(data?.month || currentMonth(), -1))}: ${net > 0 ? "ödenecek" : net < 0 ? "devreden" : "fark yok"} KDV ${money(String(prev.kdv1_net).replace(/^-/, ""), code)} (hesaplanan ${money(prev.output_vat, code)}, indirilecek ${money(prev.input_vat, code)}).`
    );
    // P6.3: geçen ayda KDV'si bilinmeyen kayıt varsa sonuç eksik olabilir (web GuncelDurum gd-vat-prev-incomplete).
    if (Number(prev.vat_unknown_count) > 0) notes.push(`Geçen ay ${Number(prev.vat_unknown_count)} kaydın KDV tutarı bilinmiyor; sonuç eksik olabilir.`);
  }
  return notes;
}

const KIND: Record<string, string> = {
  sales_invoice: "Satış faturası",
  pos_sale: "POS satışı",
  income_record: "Gelir kaydı",
  external_sales_invoice: "Paraşüt satışı",
  purchase_invoice: "Alış faturası",
  expense_record: "Gider kaydı",
};
export const filterRows = (rows: any[], code: string, side: string) => (Array.isArray(rows) ? rows : []).filter((r) => r.currency === code && (side === "all" || r.side === side));
export function rowView(r: any, code: string) {
  const kind = `${KIND[r?.kind] || "Belge"}${r?.is_return ? " (iade)" : ""}`;
  const d = dateTr(r?.date);
  return {
    title: String(r?.number || r?.description || "Kayıt"),
    sub: [kind, r?.origin === "parasut" ? "Paraşüt" : "", d === "—" ? "" : d, r?.number ? r?.party_name || r?.description : r?.party_name].filter(Boolean).join(" · "),
    amount: r?.vat_known ? `KDV ${money(r.vat, code)}` : "KDV bilinmiyor",
    detail: r?.vat_known ? `Matrah ${money(r.base, code)} · ${rowRates(r)}` : "",
  };
}

// --- Devir ---
export function carryResult(carry: any) {
  if (!carry || carry.status !== "ok") return null;
  if (carry.result_status === "payable") return { label: "Devirle ödenecek KDV", amount: carry.payable, tone: "payable" };
  if (carry.result_status === "carry_forward") return { label: "Sonraki aya devreden KDV", amount: carry.carry_out, tone: "carry" };
  return { label: "Devirle KDV farkı yok", amount: "0.00", tone: "zero" };
}
const monthList = (list: unknown) => (Array.isArray(list) ? list : []).filter(isMonth).map(monthLabel).join(", ");
export function carryView(carry: any) {
  const ok = carry?.status === "ok";
  const warnings: string[] = [];
  if (ok && Array.isArray(carry.incomplete_months) && carry.incomplete_months.length)
    warnings.push(`KDV tutarı ya da kuru bilinmeyen kayıt olan aylar: ${monthList(carry.incomplete_months)}. Bu kayıtlar devre katılmadı; tamamlayınca devir yeniden hesaplanır.`);
  if (ok && Array.isArray(carry.foreign_currency_months) && carry.foreign_currency_months.length)
    warnings.push(`Dövizli belge olan aylar: ${monthList(carry.foreign_currency_months)}. Dövizli belgelerin KDV'si belgedeki kurla TL karşılığıyla devre dahildir.`);
  const o = carry?.opening;
  return {
    ok,
    message: ok ? "" : `${carry?.message || "Devreden KDV bilinmiyor."}${carry?.status === "before_opening" ? " Bu ay için devir bilinmiyor." : ""}`,
    tone: carry?.status === "not_set" ? "warning" : "info",
    warnings,
    openingText: o ? `Açılış devri: ${monthLabel(o.month)} öncesinden ${money(o.amount, "TRY")}. Sonraki aylar zincirle hesaplanır.` : "",
  };
}
export function parseCarryAmount(text: unknown) {
  let t = String(text ?? "").replace(/\s|₺/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return `${m[1].replace(/^0+(?=\d)/, "")}.${(m[2] || "").padEnd(2, "0")}`;
}
export const amountToInput = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));
export function carryBody(month: string, amountText: string, today = currentMonth()): { ok: true; body: { month: string; amount: string } } | { ok: false; error: string } {
  if (!isMonth(month)) return { ok: false, error: "Açılış ayını YYYY-AA biçiminde yazın (ör. 2026-08)." };
  if (month > today) return { ok: false, error: "Açılış ayı gelecek bir ay olamaz." };
  const amount = parseCarryAmount(amountText);
  if (amount === null) return { ok: false, error: "Tutar sıfır ya da pozitif olmalı, en çok iki ondalık basamak (ör. 1.250,50)." };
  return { ok: true, body: { month, amount } };
}
export function carryErrorText(e: any, fallback = "İşlem tamamlanamadı. Biraz sonra yeniden deneyin.") {
  if (e?.code === "VAT_CARRY_INVALID" && typeof e?.message === "string" && e.message.trim()) return e.message.trim();
  if (Number(e?.status) === 403) return "Açılış devrini değiştirme yetkiniz yok.";
  return fallback;
}
