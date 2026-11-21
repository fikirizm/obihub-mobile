// Dövizli borç ödemesi (P5.3; saf modül, birim testi dev/test-payable-fx.mjs). Sunucu: orchestration/payable_payment.py.
// Dövizli borçta (payable.fx) ödeme tutarı DÖVİZDİR ve `currency` borcun dövizi olarak gönderilir. Döviz hesabından ödemede tutar aynen
// döviz çıkar; TL hesaptan ödemede `cash_amount` (hesaptan çıkan TL) zorunludur ve döviz × fatura kuru karşılığının %50–%150'si içinde
// olmalıdır (PAYMENT_CASH_AMOUNT_OUT_OF_RANGE); fark sunucuda kur farkı satırı olur. Web: components/expenses/PayablePaymentDialog.jsx.

export type PayableFx = { currency: string; rate: string; total: string; paid: string; remaining: string } | null;
type Info = { currency: string; remaining: string; fx?: PayableFx };

export const curOf = (c: unknown) => {
  const v = String(c || "").trim().toUpperCase() || "TRY";
  return v === "TRL" ? "TRY" : v;
};
export const payCurrency = (info: Info | null | undefined) => (info?.fx?.currency ? curOf(info.fx.currency) : curOf(info?.currency));
export const payRemaining = (info: Info | null | undefined) => String((info?.fx ? info.fx.remaining : info?.remaining) ?? "0");

// TL borçta yalnız TL hesaplar; dövizli borçta önce borcun (TL) birimi, sonra dövizdeki hesaplar.
export function payAccounts<A extends { currency?: string }>(accounts: A[], info: Info | null | undefined): A[] {
  const list = Array.isArray(accounts) ? accounts : [];
  const base = curOf(info?.currency);
  const fx = info?.fx?.currency ? curOf(info.fx.currency) : null;
  const of = (c: string) => list.filter((a) => curOf(a?.currency) === c);
  return fx && fx !== base ? [...of(base), ...of(fx)] : of(base);
}
export const needsCash = (info: Info | null | undefined, account: { currency?: string } | null | undefined) =>
  Boolean(info?.fx && account && curOf(account.currency) === curOf(info.currency));

const amountMinor = (s: unknown) => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(s ?? "").trim());
  return m ? BigInt(m[1]) * BigInt(100) + BigInt((m[2] || "").padEnd(2, "0")) : null;
};
const rateMicro = (s: unknown) => {
  const m = /^(\d+)(?:[.,](\d{1,6}))?$/.exec(String(s ?? "").trim());
  return m ? BigInt(m[1]) * BigInt(1000000) + BigInt((m[2] || "").padEnd(6, "0")) : null;
};
const trText = (kurus: bigint) => {
  const int = (kurus / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${int},${(kurus % BigInt(100)).toString().padStart(2, "0")}`;
};
const expectedKurus = (amountDot: string, rate: string) => {
  const a = amountMinor(amountDot);
  const r = rateMicro(rate);
  if (a === null || r === null || a <= BigInt(0) || r <= BigInt(0)) return null;
  return (a * r + BigInt(500000)) / BigInt(1000000);
};
// Döviz tutarı ("100.00") × kur ("36,5") → TL önerisi ("3.650,00"); BigInt, float yok. Geçersizse "".
export function cashSuggestion(amountDot: string, rate: string) {
  const k = expectedKurus(amountDot, rate);
  return k === null ? "" : trText(k);
}
// Sunucunun bandı: beklenen (döviz × fatura kuru) × 0,5 ≤ çıkan TL ≤ × 1,5. Kur bilinmiyorsa uyarı yok.
export function cashOutOfBand(amountDot: string, invoiceRate: string, cashDot: string) {
  const k = expectedKurus(amountDot, invoiceRate);
  const c = amountMinor(cashDot);
  if (k === null || c === null) return false;
  return c * BigInt(2) < k || c * BigInt(2) > k * BigInt(3);
}

export function paymentBody(
  info: Info,
  account: { currency?: string } | null,
  b: { amount: string; date: string; account_id: string; idempotency_key: string; note?: string },
  cashDot: string | null
) {
  const out: Record<string, string> = { amount: b.amount, date: b.date, account_id: b.account_id, idempotency_key: b.idempotency_key, currency: payCurrency(info) };
  const note = String(b.note || "").trim();
  if (note) out.note = note;
  if (needsCash(info, account) && cashDot) out.cash_amount = cashDot;
  return out;
}

const fmt = (v: unknown, c: string) => {
  const k = amountMinor(String(v ?? "").replace(/^-/, ""));
  if (k === null) return String(v ?? "");
  const t = trText(k);
  const cur = curOf(c);
  return cur === "TRY" ? `₺${t}` : `${t} ${cur}`;
};
// Önceki ödeme satırı: "₺3.650,00 (100,00 USD) · Ana Banka" ya da "· Çalışan cebinden · Ad".
export function paymentLine(p: any) {
  const head = `${fmt(p?.amount, p?.currency)}${p?.fx ? ` (${fmt(p.fx.amount, p.fx.currency)})` : ""}`;
  const who = p?.method === "employee" ? `Çalışan cebinden${p?.employee_name ? ` · ${p.employee_name}` : ""}` : String(p?.account_name || "");
  return [head, who].filter(Boolean).join(" · ");
}

const FX_TEXT: Record<string, string> = {
  PAYMENT_CASH_AMOUNT_REQUIRED: "Dövizli borcu TL hesaptan öderken hesaptan çıkan TL tutarını da girin.",
  PAYMENT_CASH_AMOUNT_INVALID: "Hesaptan çıkan TL tutarı geçersiz ya da bu hesapta girilmez.",
  PAYMENT_CASH_AMOUNT_OUT_OF_RANGE: "Hesaptan çıkan TL tutarı, döviz tutarının fatura kuruyla karşılığından çok farklı. Tutarı ve kuru kontrol edin.",
  PAYMENT_CURRENCY_MISMATCH: "Ödeme para birimi borcun para birimiyle aynı olmalı.",
};
export const fxErrorText = (e: any): string | null => FX_TEXT[String(e?.code || "")] || null;
