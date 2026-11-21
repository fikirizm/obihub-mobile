// Dövizli elle alış (P5.3; saf modül, birim testi dev/test-manual-fx.mjs). Satır birim fiyatları belgenin dövizindedir; kayıt TL
// karşılığıyla yapılır. Kur girilmezse sunucu fatura tarihinin TCMB kurunu kullanır (önizlemede rate_source "tcmb").
// Web: components/expenses/ManualExpenseForm.jsx (PURCHASE_CURRENCIES, exchange_rate).

export const PURCHASE_CURRENCIES: [string, string][] = [["TRY", "TL (₺)"], ["USD", "ABD doları ($)"], ["EUR", "Euro (€)"], ["GBP", "İngiliz sterlini (£)"]];
const RATE_PROBLEM = "Kur sıfırdan büyük bir sayı olmalı (ör. 36,50).";

function rateDot(text: string): string | null {
  let t = String(text || "").trim().replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(t);
  if (!m || !/[1-9]/.test(m[1] + (m[2] || ""))) return null;
  return m[2] ? `${m[1]}.${m[2]}` : m[1];
}
export function fxFields(currency: string, rateText: string): { fields: Record<string, string>; problem: string | null } {
  const cur = PURCHASE_CURRENCIES.some(([c]) => c === currency) ? currency : "TRY";
  if (cur === "TRY") return { fields: { currency: "TRY" }, problem: null };
  if (!String(rateText || "").trim()) return { fields: { currency: cur }, problem: null };
  const r = rateDot(rateText);
  return r ? { fields: { currency: cur, exchange_rate: r }, problem: null } : { fields: { currency: cur }, problem: RATE_PROBLEM };
}
export function payAccountsFor<A extends { currency?: string }>(accounts: A[], currency: string): A[] {
  const of = (c: string) => (Array.isArray(accounts) ? accounts : []).filter((a) => String(a?.currency || "TRY").toUpperCase() === c);
  return currency && currency !== "TRY" ? [...of("TRY"), ...of(currency)] : of("TRY");
}
const tr = (v: unknown) => {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v ?? ""));
  return m ? `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${((m[2] || "") + "00").slice(0, 2)}` : String(v ?? "");
};
export function fxSummary(fx: any): string | null {
  if (!fx?.currency) return null;
  return `Döviz tutarı ${tr(fx.totals?.payable)} ${fx.currency} · kur ${String(fx.rate).replace(".", ",")} (${fx.rate_source === "tcmb" ? "TCMB" : "girilen"})`;
}
