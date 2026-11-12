// Aşama 4 / P8: cari tahsilatının faturalara dağıtımı ve "avansı faturaya dağıt" (saf modül; birim testi dev/test-allocation.mjs).
// Web: frontend/src/components/customers/allocation.js, CollectionDialogOS.jsx, AllocateAdvanceDialog.jsx; lib/moneyMinor.js.
// Tutarlar kuruş (BigInt); girişte Türkçe biçim ("1.250,50").  Float yok.
// Uçlar: GET /customers/{id}/allocation-state, POST /customers/{id}/payments {…, allocations?}, POST /customers/{id}/allocations.
// K4: taslak (kesilmemiş) faturaya dağıtım yapılmaz; sunucu yalnız kesilmiş faturaları döndürür, istemci ayrıca eler.

export type OpenInvoice = { id: string; invoice_number?: string; invoice_date?: string; due_date?: string; total?: string; remaining: string; status?: string; invoice_type?: string };
export type AllocationItem = { invoice_id: string; amount: string };
export type Allocations = { items: AllocationItem[]; total: bigint; errors: Record<string, string> };
export type AllocationMode = "auto" | "manual" | "advance";

// "1.250,50" / "1250,5" / "1250.5" / "1.250" → "1250.50" benzeri; geçersiz, negatif ya da 2'den fazla ondalık → null.
export function parseTrAmount(text: string): string | null {
  const raw = String(text ?? "").trim().replace(/\s/g, "");
  if (!raw) return null;
  let n: string;
  if (raw.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(raw)) return null;
    n = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(raw) && !/^\d{1,3}\.\d{3}$/.test(raw)) {
    n = raw;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    n = raw.replace(/\./g, "");
  } else if (/^\d+$/.test(raw)) {
    n = raw;
  } else return null;
  const [w, f = ""] = n.split(".");
  if (f.length > 2) return null;
  return f ? `${String(BigInt(w))}.${f}` : String(BigInt(w));
}

export function toMinor(value: unknown): bigint | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] || "").padEnd(2, "0").slice(0, 2));
  return m[1] === "-" ? -c : c;
}
export function fromMinor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function formatMinor(minor: bigint, currency = "TRY"): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const code = String(currency || "TRY").toUpperCase();
  return `${neg ? "−" : ""}${whole},${String(abs % 100n).padStart(2, "0")} ${code === "TRY" || code === "TRL" ? "₺" : code}`;
}
// Noktalı dize → Türkçe giriş metni ("1250.5" → "1.250,50").
export function toTrInput(dot: unknown): string {
  const c = toMinor(dot);
  return c === null ? "" : formatMinor(c, "X").replace(/ X$/, "");
}
const money = (v: unknown, cur: string) => formatMinor(toMinor(v) ?? 0n, cur);

export function allocatableInvoices(list: OpenInvoice[] | null | undefined): OpenInvoice[] {
  return (Array.isArray(list) ? list : []).filter((i) => {
    if (!i || !i.id) return false;
    if (["taslak", "iptal"].includes(String(i.status || "")) || i.invoice_type === "teklif") return false;
    const r = toMinor(i.remaining);
    return r !== null && r > 0n;
  });
}

export function buildAllocations(invoices: OpenInvoice[], values: Record<string, string>, currency = "TRY"): Allocations {
  const items: AllocationItem[] = [];
  const errors: Record<string, string> = {};
  let total = 0n;
  for (const inv of invoices) {
    const text = String(values?.[inv.id] ?? "").trim();
    if (!text) continue;
    const dot = parseTrAmount(text);
    const minor = dot ? toMinor(dot) : null;
    if (minor === null || minor <= 0n) {
      errors[inv.id] = "Geçerli bir tutar girin (ör. 1.250,50).";
      continue;
    }
    const remaining = toMinor(inv.remaining);
    if (remaining !== null && minor > remaining) {
      errors[inv.id] = `Fatura kalanını aşamaz (kalan ${formatMinor(remaining, currency)}).`;
      continue;
    }
    items.push({ invoice_id: inv.id, amount: fromMinor(minor) });
    total += minor;
  }
  return { items, total, errors };
}

// En eski vadeden (sunucunun sırası), `available` kuruşa kadar doldurur.
export function autoFill(invoices: OpenInvoice[], available: bigint): Record<string, string> {
  const out: Record<string, string> = {};
  let left = available;
  for (const inv of invoices) {
    if (left <= 0n) break;
    const remaining = toMinor(inv.remaining);
    if (remaining === null || remaining <= 0n) continue;
    const take = remaining < left ? remaining : left;
    out[inv.id] = toTrInput(fromMinor(take));
    left -= take;
  }
  return out;
}

// Tahsilat gövdesindeki `allocations`: undefined = alan yok (sunucu en eski vadeden dağıtır), [] = tamamı avans.
export function allocationBody(mode: AllocationMode, items: AllocationItem[]): AllocationItem[] | undefined {
  if (mode === "advance") return [];
  if (mode === "manual" && items.length) return items;
  return undefined;
}

export function collectAllocationError(mode: AllocationMode, a: Allocations, amount: bigint | null): string {
  if (mode !== "manual") return "";
  if (Object.keys(a.errors).length) return "Dağıtım tutarlarındaki hataları düzeltin.";
  if (amount !== null && a.total > amount) return "Dağıtım toplamı tahsilat tutarını aşamaz.";
  return "";
}
export function advanceAllocationError(a: Allocations, advance: bigint): string {
  if (Object.keys(a.errors).length) return "Dağıtım tutarlarındaki hataları düzeltin.";
  if (!a.items.length) return "Dağıtılacak en az bir fatura için tutar girin.";
  if (a.total > advance) return "Dağıtım toplamı mevcut avansı aşamaz.";
  return "";
}

// Açık bakiyeye göre tahsilatın sonucu (web CollectionDialogOS notu).
export function balanceNote(due: bigint | null, amount: bigint | null, currency: string): { tone: "ok" | "warn"; text: string } | null {
  if (due === null || due <= 0n || amount === null || amount <= 0n) return null;
  if (amount < due) return { tone: "warn", text: `Kısmi tahsilat: ${formatMinor(due - amount, currency)} açık kalacak.` };
  if (amount > due) return { tone: "warn", text: `Fazla tahsilat: ${formatMinor(amount - due, currency)} cari hesapta avans olarak kalacak.` };
  return { tone: "ok", text: "Cari bakiyesi kapanacak." };
}

const TEXTS: Record<string, string> = {
  ALLOCATION_EXCEEDS_AMOUNT: "Dağıtım toplamı tahsilat tutarını aşıyor. Tutarları düzeltin.",
  ALLOCATION_INVALID: "Dağıtım geçersiz: fatura bu cariye ait değil ya da aynı fatura iki kez seçildi. Listeyi yenileyin.",
  PAYMENT_EXCEEDS_REMAINING: "Bir faturaya kalan tutarından fazlası dağıtılamaz. Liste yenilendi; tutarları kontrol edin.",
  INVOICE_NOT_ISSUED: "Taslak faturaya dağıtım yapılamaz; önce faturayı kesin.",
  ADVANCE_INSUFFICIENT: "Carinin dağıtılmamış avansı bu tutara yetmiyor. Liste yenilendi.",
  ALLOCATION_REQUIRED: "Dağıtılacak en az bir fatura için tutar girin.",
  CURRENCY_MISMATCH: "Seçilen hesabın para birimi carinin para biriminden farklı. Kur çevirisi yapılmaz; aynı para biriminde bir hesap seçin.",
  ACCOUNT_REQUIRED: "Birden çok uygun hesap var; tahsilatın yazılacağı hesabı seçin.",
  ACCOUNT_NONE_FOR_CURRENCY: "Bu para biriminde kasa/banka hesabı yok. Önce Kasa ve Bankalar'dan hesap ekleyin.",
  ACCOUNT_NOT_FOUND: "Seçilen hesap bulunamadı. Listeyi yenileyip başka bir hesap seçin.",
  ACCOUNT_INACTIVE: "Seçilen hesap pasif. Başka bir hesap seçin.",
  MONEY_PENDING: "İşlem sunucuda tamamlanıyor; yeniden göndermeyin. Kayıt birkaç dakika içinde listeye düşer.",
  MONEY_PARTIAL: "İşlem yarım kaldı ve geri alınamadı. Yeniden göndermeyin; önce Kasa hareketlerini kontrol edin.",
  MONEY_INCOMPLETE: "İşlem tamamlanamadı. Aynı bilgilerle yeniden gönderebilirsiniz; ikinci kez işlenmez.",
  OPERATION_PENDING: "Bu kayıt hâlâ tamamlanıyor; birazdan tekrar deneyin.",
  IDEMPOTENCY_CONFLICT: "Bu işlem daha önce farklı bilgilerle gönderilmiş. Ekranı kapatıp kayıtları kontrol edin.",
};
const UNCERTAIN_TEXT =
  "Bağlantı koptu ya da sunucu yanıt vermedi; işlem kaydedilmiş olabilir. Bilgiler kilitlendi: aynı işlemi yeniden gönderebilirsiniz, ikinci kez kaydedilmez.";

export function allocationErrorText(e: any): string {
  const code = e?.code;
  if (code && TEXTS[code]) return TEXTS[code];
  const status = Number(e?.status);
  const partialOrPending = code === "MONEY_PARTIAL" || code === "MONEY_PENDING" || code === "OPERATION_PENDING";
  if (!partialOrPending && (!Number.isFinite(status) || status === 0 || status >= 500)) return UNCERTAIN_TEXT;
  return (typeof e?.message === "string" && e.message.trim()) || "İşlem kaydedilemedi.";
}

const REPLAYED_TEXT = "Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi.";
const skippedText = (r: any) => {
  const n = Array.isArray(r?.skipped) ? r.skipped.length : 0;
  return n ? [`${n} fatura bu sırada değiştiği için atlandı; tutarı avansta kaldı.`] : [];
};

export function collectDoneTexts(r: any, currency: string): string[] {
  if (r?.replayed) return [REPLAYED_TEXT];
  const cur = r?.currency || currency;
  const allocated = toMinor(r?.allocated_amount ?? "0") ?? 0n;
  const advance = toMinor(r?.advance_amount ?? "0") ?? 0n;
  const main =
    allocated > 0n
      ? advance > 0n
        ? `Tahsilat kaydedildi: ${formatMinor(allocated, cur)} açık faturalara işlendi, ${formatMinor(advance, cur)} avans kaldı.`
        : `Tahsilat kaydedildi: ${formatMinor(allocated, cur)} açık faturalara işlendi.`
      : advance > 0n
        ? `Tahsilat avans olarak kaydedildi (${formatMinor(advance, cur)}).`
        : "Tahsilat kaydedildi.";
  return [main, ...skippedText(r)];
}

export function allocateDoneTexts(r: any, total: bigint, currency: string): string[] {
  if (r?.replayed) return [REPLAYED_TEXT];
  const cur = r?.currency || currency;
  const rest = r?.advance_remaining !== undefined && r?.advance_remaining !== null ? `; kalan avans ${money(r.advance_remaining, cur)}` : "";
  return [`${formatMinor(total, cur)} faturalara işlendi${rest}.`, ...skippedText(r)];
}
