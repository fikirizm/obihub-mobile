// Çalışanlar (P5.3; saf modül, birim testi dev/test-employees.mjs). Sunucu: backend/employees.py, routers/employees.py.
// Bakiye ortak cari defterde (taraf employee:<id>); cari/tedarikçi listelerinde ve yaşlandırmada görünmez. Eksi = çalışana borcumuz
// (we_owe), artı = çalışandan alacağımız (they_owe, ör. avans). İşlemler kasa TL hesabından; Idempotency-Key zorunlu; silme ters kayıt.
// Maaş/SGK yalnız ödeme kaydıdır (bordro yok). Web: pages/EmployeesPage.jsx.

export const KINDS: [string, string, string][] = [
  ["advance", "Avans", "Kasadan çıkar; çalışandan alacak olur, gider değildir."],
  ["salary", "Maaş", "Gider olarak yazılır; kasadan ödenir."],
  ["bonus", "Prim", "Gider olarak yazılır; kasadan ödenir."],
  ["payment", "Ödeme", "Çalışana borcunuzu (ör. cebinden ödediği masraf) kapatır; gider değildir."],
];
export const periodAllowed = (kind: string) => kind === "salary" || kind === "bonus";

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export function tl(v: unknown) {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v ?? "").trim());
  if (!m) return "—";
  return `${m[1] && /[1-9]/.test(m[2] + (m[3] || "")) ? "−" : ""}₺${group(m[2])},${((m[3] || "") + "00").slice(0, 2)}`;
}
const dateTr = (iso: unknown) => {
  const s = String(iso || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "";
};

export function balanceView(b: any): { text: string; tone: "error" | "success" | "neutral" } {
  if (b?.direction === "we_owe") return { text: `Çalışana borcunuz ${tl(b.amount)}`, tone: "error" };
  if (b?.direction === "they_owe") return { text: `Çalışandan alacağınız ${tl(b.amount)}`, tone: "success" };
  return { text: "Bakiye yok", tone: "neutral" };
}
export const summaryText = (s: any) => `${Number(s?.count) || 0} çalışan · borcunuz ${tl(s?.we_owe ?? "0")} · alacağınız ${tl(s?.they_owe ?? "0")}`;

// --- Kart ---
export type EmployeeForm = { name: string; title?: string; email?: string; phone?: string; iban?: string; notes?: string };
const cleanIban = (v: unknown) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function validateEmployee(f: EmployeeForm): Record<string, string> {
  const e: Record<string, string> = {};
  const name = String(f.name || "").trim().replace(/\s+/g, " ");
  if (!name) e.name = "Çalışanın adını girin.";
  else if (name.length > 120) e.name = "Ad en çok 120 karakter olabilir.";
  const iban = cleanIban(f.iban);
  if (iban && !/^TR\d{24}$/.test(iban)) e.iban = "IBAN geçersiz. TR ile başlayan 26 karakterlik IBAN'ı girin ya da boş bırakın.";
  const email = String(f.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "E-posta adresi geçersiz.";
  if (String(f.title || "").trim().length > 80) e.title = "Görev en çok 80 karakter olabilir.";
  if (String(f.notes || "").trim().length > 500) e.notes = "Not en çok 500 karakter olabilir.";
  return e;
}
export function employeeBody(f: EmployeeForm) {
  return {
    name: String(f.name || "").trim().replace(/\s+/g, " "),
    title: String(f.title || "").trim(),
    email: String(f.email || "").trim(),
    phone: String(f.phone || "").trim(),
    iban: cleanIban(f.iban),
    notes: String(f.notes || "").trim(),
  };
}

// --- İşlem ---
export type TxnForm = { kind: string; amount: string; account_id: string; date: string; period: string; note: string };
export function amountDot(text: unknown): string | null {
  let t = String(text ?? "").replace(/\s|₺/g, "");
  if (!t || t.startsWith("-")) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m || !/[1-9]/.test(m[1] + (m[2] || ""))) return null;
  return `${m[1].replace(/^0+(?=\d)/, "")}.${(m[2] || "").padEnd(2, "0")}`;
}
export function validateTxn(f: TxnForm, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!KINDS.some(([k]) => k === f.kind)) e.kind = "İşlem türünü seçin.";
  if (amountDot(f.amount) === null) e.amount = "Geçerli bir tutar girin (ör. 15.000,00).";
  if (!f.account_id) e.account = "Paranın çıkacağı TL kasa/banka hesabını seçin.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.date = "Tarihi YYYY-AA-GG biçiminde yazın.";
  else if (f.date > today) e.date = "İşlem tarihi bugünden ileri olamaz.";
  if (periodAllowed(f.kind) && f.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.period)) e.period = "Dönemi YYYY-AA biçiminde yazın (ör. 2026-11).";
  if (String(f.note || "").trim().length > 200) e.note = "Açıklama en çok 200 karakter olabilir.";
  return e;
}
export function txnBody(f: TxnForm) {
  const out: Record<string, string> = { kind: f.kind, amount: amountDot(f.amount) || "", account_id: f.account_id, date: f.date };
  if (periodAllowed(f.kind) && f.period) out.period = f.period;
  const note = String(f.note || "").trim().replace(/\s+/g, " ");
  if (note) out.note = note;
  return out;
}

// --- Ekstre ---
export function statementRow(r: any) {
  const side = r?.side === "credit" ? "Tahakkuk" : "Ödeme";
  return {
    id: String(r?.id || ""),
    title: String(r?.label || "Kayıt"),
    sub: [dateTr(r?.date), side, r?.pocket ? "Cebinden ödeme" : "", r?.reference || ""].filter(Boolean).join(" · "),
    amount: tl(r?.amount),
    reversed: r?.reversed === true,
    canVoid: r?.can_void === true && r?.reversed !== true && Boolean(r?.transaction_id),
    txnId: String(r?.transaction_id || ""),
  };
}

export const tlAccounts = <A extends { currency?: string }>(list: A[]) =>
  (Array.isArray(list) ? list : []).filter((a) => ["", "TRY", "TL", "TRL"].includes(String(a?.currency || "").toUpperCase()));

export function errorText(e: any) {
  if (Number(e?.status) === 403) return "Bu işlem için yetkiniz yok (Faturalar ve finans izni gerekir).";
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (msg && !/^Sunucu hatası/.test(msg)) return msg;
  return "İşlem tamamlanamadı. Biraz sonra yeniden deneyin.";
}
