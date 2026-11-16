// Dalga 2 (saf modül; birim testi dev/test-followup.mjs): alacak/borç yaşlandırma (GET /reports/aging), fatura tahsilat takibi
// (GET /local-invoices/{id}/collection-followup, POST .../reminder) ve cari notları/mesajları (GET /customers/{id}/timeline, notes).
// Para birimleri asla tek sayıya inmez (her para birimi ayrı blok, TRY önce).

const BUCKETS: [string, string][] = [
  ["current", "Vadesi gelmemiş"],
  ["1-30", "1-30 gün"],
  ["31-60", "31-60 gün"],
  ["61-90", "61-90 gün"],
  ["90+", "90+ gün"],
];
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type AgingBlock = {
  currency: string;
  total: number;
  overdue: number;
  count: number;
  buckets: { key: string; label: string; amount: number }[];
  top: { name: string; total: number; count: number }[];
};

export function agingView(resp: any, side: "receivable" | "payable"): { blocks: AgingBlock[]; warning: string | null; asOf: string } {
  const list = Array.isArray(resp?.currencies) ? resp.currencies : [];
  const blocks: AgingBlock[] = list
    .map((c: any) => {
      const s = c?.[side] || {};
      const totals = s.totals || {};
      const buckets = BUCKETS.map(([key, label]) => ({ key, label, amount: num(totals[key]) }));
      const total = num(totals.total) || buckets.reduce((a, b) => a + b.amount, 0);
      const parties = (Array.isArray(s.parties) ? s.parties : [])
        .map((p: any) => ({ name: String(p?.party_name || "Adsız"), total: num(p?.total), count: num(p?.count) }))
        .sort((a: any, b: any) => b.total - a.total)
        .slice(0, 3);
      return {
        currency: String(c?.currency || "TRY").toUpperCase(),
        total,
        overdue: Math.round((total - buckets[0].amount) * 100) / 100,
        count: num(s.count),
        buckets,
        top: parties,
      };
    })
    .filter((b: AgingBlock) => b.total > 0.004)
    .sort((a: AgingBlock, b: AgingBlock) => (a.currency === "TRY" ? -1 : b.currency === "TRY" ? 1 : a.currency.localeCompare(b.currency)));
  const warning = resp?.scope?.new_ledger === "unavailable" ? "Bazı borçlar okunamadı; toplam eksik olabilir." : null;
  return { blocks, warning, asOf: String(resp?.as_of || "") };
}

export function followupView(r: any) {
  const remaining = num(r?.remaining);
  const overdue = num(r?.overdue_days);
  const dueIn = r?.due_in_days == null ? null : num(r.due_in_days);
  const dueText =
    remaining <= 0.004 ? null : overdue > 0 ? `${overdue} gün gecikti` : dueIn != null && dueIn > 0 ? `Vadeye ${dueIn} gün var` : r?.due_date ? "Vadesi bugün" : null;
  const reminders = Array.isArray(r?.reminders) ? r.reminders : [];
  const a = r?.actions || {};
  return {
    remaining,
    currency: String(r?.currency || "TRY"),
    dueDate: r?.due_date || null,
    dueText,
    bucket: r?.aging_bucket || null,
    canDue: a.due_change === true,
    canRemind: a.remind === true,
    reminderCount: reminders.length,
    lastReminder: reminders[0]?.at || null,
    notice: typeof r?.offset_notice === "string" && r.offset_notice ? r.offset_notice : null,
    recipient: String(r?.default_recipient || ""),
    releasing: (Array.isArray(r?.offsets) ? r.offsets : []).filter((o: any) => o?.status === "releasing").map((o: any) => String(o.id)),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function reminderBody(toText: string, message: string, confirm: boolean, key: string) {
  const to = String(toText || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!to.length || to.length > 10 || to.some((a) => !EMAIL.test(a))) return { error: "Geçerli bir e-posta adresi girin.", body: null };
  const body: Record<string, unknown> = { to, message: String(message || "").trim(), confirm };
  if (confirm) body.idempotency_key = key;
  return { error: null, body };
}

const FU_TEXT: Record<string, string> = {
  EMAIL_NOT_CONFIGURED: "E-posta gönderimi bu ortamda etkin değil.",
  RECIPIENT_REQUIRED: "En az bir geçerli alıcı e-posta adresi girin.",
  RATE_LIMITED: "Saatte gönderilebilecek hatırlatma sınırına ulaşıldı. Daha sonra tekrar deneyin.",
  NOTE_REQUIRED: "Not boş olamaz (en çok 2000 karakter).",
  NOTE_NOT_FOUND: "Not bulunamadı; silinmiş olabilir.",
};
export function followupErrorText(e: { code?: string; message?: string; status?: number } | null | undefined) {
  if (Number(e?.status) === 429) return FU_TEXT.RATE_LIMITED;
  if (e?.code && FU_TEXT[e.code]) return FU_TEXT[e.code];
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  return m && !/^Sunucu hatası/.test(m) ? m : "İşlem yapılamadı.";
}

export const TIMELINE_KINDS: [string, string][] = [
  ["all", "Tümü"],
  ["notes", "Notlar"],
  ["messages", "Mesajlar"],
];
const TAG: Record<string, string> = { note: "Not", message: "Mesaj", activity: "Etkinlik" };

export type TimelineRow = { id: string; tag: string; title: string; body: string; at: string; actor: string | null; canDelete: boolean; invoiceId: string | null };
export function timelineRows(resp: any): TimelineRow[] {
  const items: any[] = Array.isArray(resp?.items) ? resp.items : [];
  return items.map((x: any) => ({
    id: String(x?.id || ""),
    tag: TAG[String(x?.kind)] || "Etkinlik",
    title: String(x?.title || ""),
    body: String(x?.body || ""),
    at: String(x?.at || ""),
    actor: x?.actor ? String(x.actor) : null,
    canDelete: x?.can_delete === true,
    invoiceId: x?.link?.type === "invoice" && x.link.id ? String(x.link.id) : null,
  }));
}

export function noteProblem(text: string) {
  const t = String(text || "").trim();
  if (!t) return "Not boş olamaz.";
  if (String(text).length > 2000) return "Not en çok 2000 karakter olabilir.";
  return null;
}
