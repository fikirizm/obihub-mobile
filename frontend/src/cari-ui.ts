// Cari mahsup (K8), cari virman (K9), "Alacak bakiyesi" (K10) — 13 Kas 2026 (saf modül; birim testi dev/test-cari-ui.mjs).
// Sözleşme: docs/mobil-oturum-icin-notlar.md "Cari mahsup (K8), cari virman (K9)…" (1–9). Tasarım: docs/pm/tasarim/cari-mahsup-virman.md.

// --- para biçimi (uygulamanın formatMoney biçimi: bilinen simge başta) ---
const SYMBOLS: Record<string, string> = { TRY: "₺", TRL: "₺", USD: "$", EUR: "€", GBP: "£" };
function money(v: unknown, currency = "TRY"): string {
  const n = Number(v);
  const minor = Math.round((Number.isFinite(n) ? Math.abs(n) : 0) * 100);
  const whole = Math.floor(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const num = `${whole},${String(minor % 100).padStart(2, "0")}`;
  const code = String(currency || "TRY").toUpperCase();
  const sign = Number.isFinite(n) && n < 0 ? "-" : "";
  return `${sign}${SYMBOLS[code] ? `${SYMBOLS[code]}${num}` : `${num} ${code}`}`;
}
const curOf = (c: unknown) => {
  const v = String(c || "TRY").trim().toUpperCase() || "TRY";
  return v === "TRL" ? "TRY" : v;
};
const isUncertain = (e: any) => {
  const s = Number(e?.status);
  return !Number.isFinite(s) || s === 0 || (s >= 500 && e?.code !== "MONEY_PARTIAL" && e?.code !== "MONEY_PENDING");
};
const detailOf = (e: any) => (typeof e?.message === "string" ? e.message.trim() : "");
const UNCERTAIN_TEXT = "Bağlantı koptu ya da sunucu yanıt vermedi; işlem kaydedilmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz, ikinci kez kaydedilmez.";
const REPLAYED_TEXT = "Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi.";

// --- M1: bakiye kartında "Faturalarla eşleştir" ---
export const MATCH_BLOCKED: Record<string, string> = {
  ledger_pending: "Bazı kayıtlar cari hesaba işleniyor; eşleştirme birkaç dakika sonra açılır.",
  ledger_issue: "Bu caride muhasebe kaydı sorunlu bir belge var; eşleştirme için önce o belge düzeltilmeli.",
};
export function matchLinkView(state: { can_match?: unknown; credit?: unknown; currency?: unknown; match_blocked_reason?: unknown } | null | undefined) {
  if (state && state.can_match === true)
    return { show: true, text: `${money(state.credit, curOf(state.currency))} eşleşmemiş tahsilat · Faturalarla eşleştir`, note: null as string | null };
  const reason = state ? String(state.match_blocked_reason || "") : "";
  return { show: false, text: null as string | null, note: MATCH_BLOCKED[reason] || null };
}

// --- M5: fatura kesme / resmileştirme / e-belge yanıtında otomatik kapama ---
export function autoSettlementText(as: { applied_amount?: unknown; currency?: unknown } | null | undefined): string | null {
  const n = Number(as?.applied_amount);
  if (!as || !Number.isFinite(n) || n <= 0) return null;
  return `${money(n, curOf(as.currency))} carinin alacak bakiyesinden bu faturaya işlendi.`;
}

// --- M4: "Eşleşmeyi kaldır" (DELETE /local-invoices/{id}/allocations/{payment_id}) ---
export const UNMATCH_CONFIRM = "Bu tutar faturadan çözülür ve carinin alacak bakiyesine döner. Kasa ve cari bakiyesi değişmez.";
export function canUnmatch(p: { id?: unknown; source?: unknown; void_op?: unknown }): boolean {
  return Boolean(p?.id) && p?.source === "customer_payment" && !p?.void_op;
}
const UNMATCH_TEXTS: Record<string, string> = {
  COLLECTION_NOT_ALLOCATION: "Bu satır doğrudan fatura tahsilatı, cari eşleşmesi değil. Kaldırmak için tahsilatı silin.",
  INVOICE_NOT_FOUND: "Fatura bulunamadı; silinmiş olabilir.",
  COLLECTION_NOT_FOUND: "Eşleşme bulunamadı; kaldırılmış olabilir. Fatura yenilendi.",
  INVOICE_BUSY: "Fatura şu anda başka bir işlemde. Birazdan tekrar deneyin.",
  INVOICE_BLOCKED: "Fatura e-belge ya da Paraşüt durumu nedeniyle kilitli; eşleşme şu anda kaldırılamaz.",
  OPERATION_PENDING: "Bu cari için başka bir işlem sürüyor; birazdan aynı işlemi yeniden gönderin.",
  COLLECTION_VOIDED: "Bu tahsilat zaten silinmiş. Fatura yenilendi.",
};
export function unmatchErrorText(e: any): string {
  if (e?.code && UNMATCH_TEXTS[e.code]) return UNMATCH_TEXTS[e.code];
  if (isUncertain(e)) return UNCERTAIN_TEXT;
  return detailOf(e) || "Eşleşme kaldırılamadı.";
}
export function unmatchDoneText(r: any): string {
  if (r?.replayed === true) return REPLAYED_TEXT;
  return `${money(r?.released_amount, curOf(r?.currency))} faturadan çözüldü; carinin alacak bakiyesine döndü.`;
}

// --- M6: cari virman (POST/PATCH/DELETE /customers/{id}/transfers) ---
export type TransferForm = { targetId: string; amount: string; date: string; note: string };

// Türkçe tutar → "150.50" (en çok 2 ondalık); geçersizse null.
function amountDot(text: string): string | null {
  const raw = String(text ?? "").trim().replace(/\s/g, "");
  if (!raw) return null;
  let n: string;
  if (raw.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(raw)) return null;
    n = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(raw) && !/^\d{1,3}\.\d{3}$/.test(raw)) n = raw;
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) n = raw.replace(/\./g, "");
  else if (/^\d+$/.test(raw)) n = raw;
  else return null;
  const [w, f = ""] = n.split(".");
  const out = `${String(Number(w))}.${f.padEnd(2, "0")}`;
  return Number(out) > 0 ? out : null;
}

export function transferTargets<T extends { id?: unknown; currency?: unknown; source?: unknown }>(list: T[], self: { id: string; currency?: unknown }): T[] {
  const cur = curOf(self.currency);
  return (Array.isArray(list) ? list : []).filter((c) => {
    const id = String(c?.id || "");
    if (!id || id === self.id) return false;
    if (c.source === "orders" || /^(e|p|n):/.test(id)) return false;
    return curOf(c.currency) === cur;
  });
}

export function transferFormError(f: TransferForm, today: string): string | null {
  if (!f.targetId) return "Virmanın gideceği hedef cari seçin.";
  if (!amountDot(f.amount)) return "Geçerli bir tutar girin: sıfırdan büyük, en çok 2 ondalık (ör. 1.250,50).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "Geçerli bir tarih girin (GG.AA.YYYY).";
  if (f.date > today) return "Virman tarihi ileri bir gün olamaz.";
  if (!f.note.trim()) return "Açıklama zorunludur (ör. mahsup nedeni).";
  return null;
}
export function transferBody(f: TransferForm) {
  return { target_customer_id: f.targetId, amount: amountDot(f.amount) as string, date: f.date, note: f.note.trim() };
}
export function transferPatchBody(f: { amount: string; date: string; note: string }) {
  return { amount: amountDot(f.amount) as string, date: f.date, note: f.note.trim() };
}

const TRANSFER_TEXTS: Record<string, string> = {
  TRANSFER_SAME_CUSTOMER: "Cari kendisine virman yapamaz. Başka bir cari seçin.",
  TRANSFER_SAME_PARTY: "Bu iki kart aynı vergi numarasına sahip (aynı firma); aralarında virman yapılamaz.",
  TRANSFER_NOTE_REQUIRED: "Virman için açıklama zorunludur.",
  IDEMPOTENCY_KEY_REQUIRED: "İşlem anahtarı eksik; ekranı kapatıp yeniden deneyin.",
  TRANSFER_NOT_FOUND: "Virman bulunamadı; silinmiş olabilir. Ekstre yenilendi.",
  TRANSFER_VOIDED: "Bu virman zaten silinmiş. Ekstre yenilendi.",
  PARTY_LEDGER_OFF: "Bu firmada cari defteri henüz açık değil; virman yapılamıyor.",
  CURRENCY_MISMATCH: "İki carinin para birimi aynı olmalı. Aynı para birimindeki bir cari seçin.",
  AMOUNT_INVALID: "Tutar geçersiz. Sıfırdan büyük, en çok 2 ondalık bir tutar girin.",
  DATE_INVALID: "Tarih geçersiz; bugün ya da daha önceki bir gün seçin.",
  CUSTOMER_NOT_FOUND: "Cari bulunamadı; silinmiş olabilir.",
  IDEMPOTENCY_CONFLICT: "Bu işlem daha önce farklı bilgilerle gönderilmiş. Ekranı kapatıp ekstreyi kontrol edin.",
  OPERATION_PENDING: "Bu cari için başka bir işlem sürüyor; birazdan aynı işlemi yeniden gönderin.",
  MONEY_INCOMPLETE: "İşlem tamamlanamadı. Aynı bilgilerle yeniden gönderebilirsiniz; ikinci kez işlenmez.",
};
export function transferErrorText(e: any): string {
  if (e?.code && TRANSFER_TEXTS[e.code]) return TRANSFER_TEXTS[e.code];
  if (isUncertain(e)) return UNCERTAIN_TEXT;
  return detailOf(e) || "Virman kaydedilemedi.";
}
export function transferRowActions(row: { transfer?: unknown; actions?: { edit?: unknown; void?: unknown } | null }) {
  if (!row?.transfer || !row.actions) return null;
  const a = { edit: row.actions.edit === true, void: row.actions.void === true };
  return a.edit || a.void ? a : null;
}

// --- M7: bakiye ipucu ---
export function balanceHint(balance: number): string {
  return balance > 0 ? "Alacağınız" : balance < 0 ? "Alacak bakiyesi · biz cariye borçluyuz" : "Bakiye";
}
export function balanceListHint(balance: number): string | undefined {
  return balance > 0 ? "Alacağınız var" : balance < 0 ? "Alacak bakiyesi" : undefined;
}
