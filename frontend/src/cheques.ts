// Çekler (saf modül; birim testi dev/test-cheques.mjs). Dalga 3 (P3.1): sunucu "cek"/"çek" yöntemini kasa tahsilatı olarak kabul etmez
// (422 CHEQUE_USE_CHEQUES). Çekle tahsilat POST /cheques/receive ile portföye girer, KASAYA GİRMEZ; fatura/cari satırı (source=cheque)
// salt okunur. Web: pages/cash/chequesModel.js, components/money/ChequeFields.jsx. Para birimleri asla tek sayıya inmez.

export const isChequeMethod = (m?: string | null) => ["cek", "çek"].includes(String(m || "").trim().toLocaleLowerCase("tr-TR"));

type Opt = { value: string; label: string };
// Yeni kasa tahsilatında çek seçeneği yok (çek ayrı akış).
export const cashMethods = <T extends Opt>(list: readonly T[]) => list.filter((o) => !isChequeMethod(o.value));
// Tahsilat düzenlemede "Çek" yalnız eski satır zaten çekliyse kalır.
export const editMethods = <T extends Opt>(list: readonly T[], current?: string | null) => (isChequeMethod(current) ? [...list] : cashMethods(list));

// "1.250,50" / "1250.5" → "1250.50"; geçersiz → null.
export function moneyText(v: unknown): string | null {
  let t = String(v ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t).toFixed(2);
}
const isoDay = (v: unknown) => {
  const t = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
const cents = (s: string) => Math.round(Number(s) * 100);

export type ReceiveInput = {
  invoiceId?: string;
  customerId?: string;
  amount: string;
  dueDate: string;
  chequeNo?: string;
  bankName?: string;
  drawer?: string;
  note?: string;
  date?: string;
  allocations?: { invoice_id: string; amount: string }[];
};

export function receiveBody(f: ReceiveInput): { error: string | null; body: Record<string, unknown> | null } {
  if (!f.invoiceId && !f.customerId) return { error: "Çekin hangi faturaya ya da cariye ait olduğunu seçin.", body: null };
  const amount = moneyText(f.amount);
  if (!amount || Number(amount) <= 0) return { error: "Çek tutarını girin.", body: null };
  const due = isoDay(f.dueDate);
  if (!due) return { error: "Çekin vade tarihini girin.", body: null };
  const body: Record<string, unknown> = { ...(f.invoiceId ? { invoice_id: f.invoiceId } : { customer_id: f.customerId }), amount, due_date: due };
  for (const [k, v] of [["cheque_no", f.chequeNo], ["bank_name", f.bankName], ["drawer", f.drawer], ["note", f.note]] as const) {
    const s = String(v || "").trim();
    if (s) body[k] = s;
  }
  const day = isoDay(f.date);
  if (day) body.date = day;
  if (f.allocations && f.allocations.length) {
    const list = f.allocations.map((a) => ({ invoice_id: a.invoice_id, amount: moneyText(a.amount) || "0.00" })).filter((a) => Number(a.amount) > 0);
    const sum = list.reduce((s, a) => s + cents(a.amount), 0);
    if (sum !== cents(amount)) return { error: "Faturalara dağıtılan toplam çek tutarına eşit olmalı.", body: null };
    body.allocations = list;
  }
  return { error: null, body };
}

export const isChequeRow = (r: { source?: string } | null | undefined) => r?.source === "cheque";

const TEXT: Record<string, string> = {
  CHEQUE_USE_CHEQUES: "Çekle tahsilat Çekler ekranından alınır; çek portföye girer, kasaya girmez.",
  COLLECTION_IS_CHEQUE: "Bu tahsilat bir çek; düzenleme ve silme Çekler ekranından yapılır.",
  CHEQUE_ALLOCATION_MISMATCH: "Faturalara dağıtılan toplam çek tutarına eşit olmalı.",
  CHEQUE_DUE_REQUIRED: "Çekin vade tarihini girin.",
  MIRROR_ACCOUNT_READ_ONLY: "Paraşüt'ten gelen hesaba tahsil edilemez; ObiHub hesabı seçin.",
};
export function chequeErrorText(e: { code?: string; message?: string } | null | undefined) {
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m) && m !== e?.code) return m;
  return (e?.code && TEXT[e.code]) || "İşlem yapılamadı.";
}

export type Direction = "received" | "issued";
export const FILTERS: Record<Direction, [string, string][]> = {
  received: [
    ["", "Tümü"],
    ["portfoy", "Portföyde"],
    ["due_soon", "Vadesi yaklaşan"],
    ["tahsil_edildi", "Tahsil edilen"],
    ["ciro_edildi", "Ciro edilen"],
    ["karsiliksiz", "Karşılıksız"],
    ["iade_edildi", "İade edilen"],
  ],
  issued: [
    ["", "Tümü"],
    ["verildi", "Ödenecek"],
    ["due_soon", "Vadesi yaklaşan"],
    ["odendi", "Ödenen"],
  ],
};
export const chequesPath = (direction: Direction, status: string) => `/cheques?direction=${direction}${status ? `&status=${encodeURIComponent(status)}` : ""}`;

export function dueText(c: { due_state?: unknown; days_to_due?: unknown }) {
  if (!c?.due_state || typeof c.days_to_due !== "number") return "";
  const d = c.days_to_due;
  if (d < 0) return `${-d} gün gecikti`;
  if (d === 0) return "Bugün vadesi geliyor";
  if (d === 1) return "Yarın vadesi geliyor";
  return `${d} gün sonra`;
}

export function totalsOf(rows: unknown) {
  const list = (Array.isArray(rows) ? rows : []) as { currency?: string; amount?: unknown; count?: unknown }[];
  const lines = list
    .map((r) => ({ currency: String(r.currency || "TRY"), amount: Number(r.amount) || 0 }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => (a.currency === "TRY" ? -1 : b.currency === "TRY" ? 1 : a.currency.localeCompare(b.currency)));
  return { lines, count: list.reduce((n, r) => n + (Number(r.count) || 0), 0) };
}

export type ChequeAction = "collect" | "endorse" | "return" | "pay" | "receipt" | "delete";
const ORDER: ChequeAction[] = ["collect", "endorse", "return", "pay", "receipt", "delete"];
export function chequeActions(c: { detached?: boolean; actions?: Partial<Record<ChequeAction, boolean>> | null }): ChequeAction[] {
  const a = c?.actions || {};
  if (c?.detached) return a.delete ? ["delete"] : [];
  return ORDER.filter((k) => a[k] === true);
}
export const ACTION_LABEL: Record<ChequeAction, string> = {
  collect: "Tahsil et",
  endorse: "Ciro et",
  return: "Karşılıksız / iade",
  pay: "Ödendi",
  receipt: "Makbuz",
  delete: "Sil",
};

export function readError(e: { status?: number } | null | undefined) {
  const s = Number(e?.status);
  if (s === 403) return "Çekleri görme yetkiniz yok. Firma yöneticinizden 'Nakit' iznini isteyin.";
  if (s === 429) return "Çok fazla istek gönderildi; birkaç saniye sonra yeniden deneyin.";
  return "Çekler şu anda okunamadı. Biraz sonra yeniden deneyin.";
}
