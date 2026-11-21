// Finans raporları (saf modül; birim testi dev/test-finance-reports.mjs): P6.1 Satışlar / Giderler (GET /reports/sales|expenses,
// backend/reports_period.py) ve P6.2 Kasa/Banka (GET /reports/cash-bank) ile Nakit Akışı (GET /reports/cashflow, backend/reports_cash.py).
// Web: pages/reports/periodModel.js, cashReportsModel.js. Tutarlar sunucudan dize gelir; para birimleri toplanmaz, burada para
// hesabı yapılmaz (yalnız görüntü biçimi). Mobilde Excel yerine belge dökümü CSV olarak paylaşılır.

export type Kind = "sales" | "expenses";
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// --- Tarih ---
export function todayTr(now = new Date()) {
  const d = new Date(now.getTime() + 3 * 3600 * 1000); // Europe/Istanbul (UTC+3, yaz saati yok)
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysIn = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
export const dateTr = (iso: unknown) => {
  const s = String(iso || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "—";
};
export const rangeLabel = (from: string, to: string) => `${dateTr(from)} – ${dateTr(to)}`;

export const PRESETS: [string, string][] = [["month", "Bu ay"], ["prev", "Geçen ay"], ["quarter", "Son 3 ay"], ["year", "Bu yıl"]];
export function presetRange(key: string, today = todayTr()) {
  const [y, m] = today.split("-").map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  if (key === "prev") {
    const end = addDays(first(y, m), -1);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  if (key === "quarter") return { from: addDays(today, -89), to: today };
  if (key === "year") return { from: `${y}-01-01`, to: today };
  return { from: first(y, m), to: today };
}
export const presetOf = (from: string, to: string, today = todayTr()) =>
  (PRESETS.find(([k]) => {
    const r = presetRange(k, today);
    return r.from === from && r.to === to;
  }) || [null])[0];

// --- Kırılım (sunucu varsayılanıyla aynı: ≤31 gün gün, ≤93 gün hafta, üstü ay; gün en çok 93 gün) ---
export const GROUPS: [string, string][] = [["day", "Gün"], ["week", "Hafta"], ["month", "Ay"], ["year", "Yıl"]];
export const defaultGroup = (from: string, to: string) => {
  const n = daysIn(from, to);
  return n <= 31 ? "day" : n <= 93 ? "week" : "month";
};
export const groupAllowed = (g: string, from: string, to: string) => g !== "day" || daysIn(from, to) <= 93;
export const fixGroup = (g: string, from: string, to: string) => (GROUPS.some(([k]) => k === g) && groupAllowed(g, from, to) ? g : defaultGroup(from, to));
export function periodLabel(p: any, group: string) {
  if (!p?.key) return "";
  if (group === "day") return dateTr(p.key);
  if (group === "week") return `${p.key.slice(8, 10)}.${p.key.slice(5, 7)} – ${dateTr(p.to)}`;
  if (group === "month") return `${MONTHS[Number(p.key.slice(5, 7)) - 1]} ${p.key.slice(0, 4)}`;
  return p.key.slice(0, 4);
}

// --- Para ---
const SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };
function grouped(v: unknown) {
  const s = String(v ?? "").trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const int = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = ((m[3] || "") + "00").slice(0, 2);
  return { neg: m[1] === "-" && /[1-9]/.test(m[2] + (m[3] || "")), text: `${int},${dec}` };
}
export function money(v: unknown, currency: string) {
  const g = grouped(v);
  if (!g) return "—";
  const sym = SYMBOL[currency];
  return `${g.neg ? "−" : ""}${sym ? `${sym}${g.text}` : `${g.text} ${currency}`}`;
}
export const isNeg = (v: unknown) => String(v ?? "").trim().startsWith("-");
const csvNum = (v: unknown) => {
  const g = grouped(v);
  return g ? `${g.neg ? "-" : ""}${g.text.replace(/\./g, "")}` : "";
};

export function pickCurrency<T extends { currency?: string }>(list: T[] | undefined, wanted: string): T | null {
  const arr = Array.isArray(list) ? list : [];
  return arr.find((c) => c.currency === wanted) || arr.find((c) => c.currency === "TRY") || arr[0] || null;
}

// --- Satışlar / Giderler ---
export const PARASUT_NOTE = "Paraşüt verisi yalnız ObiHub'a aktarılan dönemleri kapsar.";
export const REPORT: Record<Kind, { title: string; dims: [string, string][]; kinds: Record<string, string>; party: string; unit: string; paramsCode: string; empty: string; footnote: string }> = {
  sales: {
    title: "Satışlar",
    dims: [["customers", "Müşteri"], ["categories", "Kategori"]],
    kinds: { sales_invoice: "Satış faturası", pos_sale: "POS satışı", external_sales_invoice: "Paraşüt satışı" },
    party: "Müşteri",
    unit: "belgenin",
    paramsCode: "SALES_REPORT_PARAMS_INVALID",
    empty: "Bu dönemde kesilmiş satış faturası, POS satışı ya da Paraşüt satışı yok.",
    footnote: "Taslak, teklif ve iptal belgeler dahil değildir; iade belgeler eksi sayılır. POS fişine dönüştürülen fatura ayrıca sayılmaz.",
  },
  expenses: {
    title: "Giderler",
    dims: [["categories", "Kategori"], ["suppliers", "Tedarikçi"], ["tags", "Etiket"]],
    kinds: { purchase_invoice: "Gider faturası", expense_record: "Gider kaydı", payroll: "Maaş ve prim" },
    party: "Tedarikçi",
    unit: "kaydın",
    paramsCode: "EXPENSE_REPORT_PARAMS_INVALID",
    empty: "Bu dönemde gider faturası ya da gider kaydı yok.",
    footnote: "İptal edilen belgeler dahil değildir; ters kayıtlar eksi sayılır. Toplam diğer vergileri de içerir (diğer vergiler = toplam − net − KDV).",
  },
};
export const TAGS_NOTE = "Etiketli kayıt her etiketinde sayılır; bu yüzden etiket toplamı rapor toplamını aşabilir.";

export const periodPath = (kind: Kind, from: string, to: string, group: string, rows: boolean) =>
  `/reports/${kind}?from=${from}&to=${to}&group=${group}&rows=${rows ? "true" : "false"}`;
export function periodErrorText(e: any, kind: Kind) {
  if (Number(e?.status) === 403) return "Raporları görme yetkiniz yok. Yöneticinizden Raporlar iznini isteyin.";
  if (e?.code === REPORT[kind].paramsCode) return "Seçilen dönem geçersiz. Tarihleri kontrol edin.";
  if (e?.code === "REPORT_TOO_LARGE") return "Bu dönemde çok fazla belge var; döküm tek seferde açılamıyor. Dönemi daraltın.";
  if (e?.code === "EXPENSE_REPORT_REVIEW_REQUIRED") return "Bir gider belgesi okunamadı; destek ekibine bildirin.";
  if (Number(e?.status) === 429) return "Çok fazla istek gönderildi; birkaç saniye sonra yeniden deneyin.";
  return "Rapor şu anda okunamadı. Biraz sonra yeniden deneyin.";
}
export const hasAnyDocument = (currencies: any[]) => (Array.isArray(currencies) ? currencies : []).some((c) => Number(c?.totals?.count) > 0);

export function periodFigs(cur: any) {
  const t = cur?.totals || {};
  const out: { label: string; value: string; hint?: string }[] = [
    { label: "Net (KDV hariç)", value: t.net ?? "0.00" },
    { label: "KDV", value: t.vat ?? "0.00" },
  ];
  if (t.other_taxes !== undefined && Number(t.other_taxes) !== 0) out.push({ label: "Diğer vergiler", value: t.other_taxes });
  out.push({ label: "Toplam (KDV dahil)", value: t.gross ?? "0.00", hint: `${Number(t.count) || 0} belge${Number(t.return_count) > 0 ? `, ${t.return_count} iade` : ""}` });
  return out;
}
export function periodNotes(cur: any, kind: Kind) {
  const t = cur?.totals || {};
  const code = cur?.currency || "TRY";
  const out: string[] = [];
  if (Number(t.vat_unknown_count) > 0)
    out.push(`${t.vat_unknown_count} ${REPORT[kind].unit} KDV tutarı bilinmiyor (brüt ${money(t.vat_unknown_gross, code)}). Bu tutar toplama dahil; net ve KDV toplamlarına dahil değil.`);
  const te = cur?.try_equivalent;
  if (te)
    out.push(
      `TL karşılığı (belge kuruyla, yalnız bilgi): toplam ${money(te.gross, "TRY")}.${Number(te.missing_rate_count) > 0 ? ` ${te.missing_rate_count} belgede kur yok; TL karşılığına dahil değil.` : ""}`
    );
  return out;
}
export function docLine(r: any, kind: Kind) {
  const k = `${REPORT[kind].kinds[r?.kind] || "Belge"}${r?.is_return ? " (iade)" : ""}`;
  return { title: String(r?.number || "—"), sub: [k, dateTr(r?.date), r?.party_name || r?.description].filter((x) => x && x !== "—").join(" · "), gross: String(r?.gross ?? "") };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function periodCsv(kind: Kind, rows: any[], currency: string) {
  const sales = kind === "sales";
  const head = ["Tür", "Belge no", "Tarih", REPORT[kind].party, "Kategori", ...(sales ? [] : ["Etiketler"]), "Net", "KDV", "Diğer vergiler", "Toplam", "Kaynak"];
  const lines = (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.currency === currency)
    .map((r) =>
      [
        `${REPORT[kind].kinds[r.kind] || "Belge"}${r.is_return ? " (iade)" : ""}`,
        r.number || "",
        dateTr(r.date) === "—" ? "" : dateTr(r.date),
        r.party_name || r.description || "",
        r.category_name || "",
        ...(sales ? [] : [Array.isArray(r.tag_names) ? r.tag_names.join(", ") : ""]),
        r.vat_known ? csvNum(r.net) : "",
        r.vat_known ? csvNum(r.vat) : "",
        r.vat_known ? csvNum(r.other_taxes) : "",
        csvNum(r.gross),
        r.origin === "parasut" ? "Paraşüt" : "ObiHub",
      ]
        .map(csvCell)
        .join(";")
    );
  return "﻿" + [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
export const csvName = (kind: Kind, currency: string, from: string, to: string) => `${kind === "sales" ? "satislar" : "giderler"}-raporu-${currency}-${from}-${to}.csv`;

// --- Kasa / Banka ---
export const ACCOUNT_TYPE: Record<string, string> = { cash: "Kasa", bank: "Banka", pos: "POS", credit_card: "Kredi kartı", marketplace: "Pazaryeri", other: "Diğer" };
export const cashBankPath = (from: string, to: string) => `/reports/cash-bank?date_from=${from}&date_to=${to}`;
export function cashBankView(data: any, wanted: string) {
  const tot = pickCurrency<any>(data?.currencies, wanted);
  const code = tot?.currency || "TRY";
  const accounts = (Array.isArray(data?.accounts) ? data.accounts : [])
    .filter((a: any) => a?.currency === code)
    .map((a: any) => ({
      ...a,
      typeLabel: ACCOUNT_TYPE[a.account_type] || "Hesap",
      badge: a.archived ? "Arşivde" : a.read_only ? "Paraşüt" : "",
      hasTransfer: Number(a.transfer_in) !== 0 || Number(a.transfer_out) !== 0,
    }));
  return { code, totals: tot, accounts };
}

// --- Nakit akışı ---
export const VIEWS: [string, string][] = [["week", "12 hafta"], ["month", "12 ay"]];
export const cashflowPath = (view: string) => `/reports/cashflow?view=${view === "month" ? "month" : "week"}`;
export const STARTING_NOTE = "Başlangıç bakiyesi: etkin kasa ve banka hesaplarının bugünkü bakiyesi. Vadesi geçmiş kalemler bakiyeye eklenmez.";
export function flowLabel(p: any, view: string) {
  if (!p?.start || !p?.end) return "";
  const s = { d: Number(p.start.slice(8, 10)), m: Number(p.start.slice(5, 7)), y: p.start.slice(0, 4) };
  const e = { d: Number(p.end.slice(8, 10)), m: Number(p.end.slice(5, 7)) };
  if (view === "month") return `${MONTHS_SHORT[s.m - 1]} ${s.y}`;
  return s.m === e.m ? `${s.d}–${e.d} ${MONTHS_SHORT[e.m - 1]}` : `${s.d} ${MONTHS_SHORT[s.m - 1]} – ${e.d} ${MONTHS_SHORT[e.m - 1]}`;
}
export function flowGroups(block: any) {
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  return [
    { title: "Girişler", rows: rows.filter((r: any) => r.direction === "in") },
    { title: "Çıkışlar", rows: rows.filter((r: any) => r.direction === "out") },
  ].filter((g) => g.rows.length);
}
export function cellItems(block: any, pick: { row: string; col: number | "overdue" | "later" } | null) {
  if (!block || !pick) return [];
  return (block.items || []).filter(
    (it: any) => it.row === pick.row && (pick.col === "overdue" ? it.overdue : pick.col === "later" ? it.later : !it.overdue && !it.later && it.period === pick.col)
  );
}
const LINK: Record<string, string> = {
  sales_invoice: "Satış faturası",
  expense_invoice: "Gider faturası",
  cheque: "Çek",
  recurring_plan: "Tekrarlayan plan",
  cash_account: "Kasa/Banka",
  expense_draft: "Gider taslağı",
};
export const flowLinkLabel = (item: any) => LINK[String(item?.link?.type || "")] || "Belge";
export const hasFlow = (block: any) => Boolean(block && ((block.items || []).length || Number(block.starting_balance)));
