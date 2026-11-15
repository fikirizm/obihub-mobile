// Tahsilat hesap seçimi (saf modül; birim testi: dev/test-pos-money.mjs). Sunucu kuralı (Aşama 4 P3):
// pasif hesap (is_active/active false, archived/is_deleted true) önerilmez (açıkça verilirse 409 ACCOUNT_INACTIVE);
// POS (Kart) hesabı otomatik seçilmez, açıkça seçilirse kabul edilir → listede en sonda ve işaretli.
import type { CashAccount } from "./types";

export function isAccountInactive(a: CashAccount) {
  return a.is_active === false || a.active === false || a.archived === true || a.is_deleted === true;
}
// D-15 / G4-21: Paraşüt aynalı hesap (read_only, actions.add_movement false) ObiHub'dan yazılamaz → seçicide yok.
export const isAccountWritable = (a: CashAccount) => a.read_only !== true && a.actions?.add_movement !== false;
export const isPosAccount = (a: CashAccount) => String(a.account_type || "") === "pos";

const normCur = (c?: string | null) => {
  const v = String(c || "TRY").trim().toUpperCase();
  return v === "TRL" || v === "TL" || v === "" ? "TRY" : v;
};

// İşlemin para birimindeki etkin hesaplar; varsayılan (POS değilse) önce, POS en sonda; aradakiler gelen sırada.
export function accountsForCurrency(accounts: CashAccount[], currency: string) {
  const cur = normCur(currency);
  const rank = (a: CashAccount) => (isPosAccount(a) ? 2 : a.is_default ? 0 : 1);
  return accounts
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => normCur(a.currency) === cur && !isAccountInactive(a) && isAccountWritable(a))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
    .map(({ a }) => a);
}

// Hesap seçicideki etiket: POS hesabı işaretlenir, birden çok seçenekte varsayılan "(varsayılan)" ile.
export function accountOptionLabel(a: CashAccount, many: boolean) {
  if (isPosAccount(a)) return /pos/i.test(a.name) ? `${a.name} · kart` : `${a.name} (POS)`;
  return a.is_default && many ? `${a.name} (varsayılan)` : a.name;
}
