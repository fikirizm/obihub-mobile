// Tekrarlayan belgeler ve pazaryeri iade rozeti (saf modül; birim testi dev/test-recurring.mjs). Dalga 5a: /recurring-documents
// (mobilde liste + durdur/sürdür), GET /orders return_request. Web: components/recurring/recurringModel.js.

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const parts = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};

export function scheduleText(plan: { frequency?: string; every?: number; start_date?: string; day?: number } | null | undefined) {
  const p = parts(plan?.start_date);
  if (!p || !plan) return "—";
  const n = Number(plan.every || 1);
  if (plan.frequency === "weekly") {
    const wd = DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
    return n === 1 ? `Her hafta ${wd}` : `${n} haftada bir ${wd}`;
  }
  if (plan.frequency === "monthly") {
    const day = plan.day || p.d;
    return `${n === 1 ? "Her ay" : `${n} ayda bir`}, ayın ${day}. günü${day > 28 ? " (kısa aylarda son gün)" : ""}`;
  }
  return `${n === 1 ? "Her yıl" : `${n} yılda bir`}, ${p.d} ${MONTHS[p.m - 1]}`;
}

type Kind = "success" | "info" | "warning" | "error" | "neutral";
export function planStatus(plan: { status?: string }): { label: string; kind: Kind; action: "pause" | "resume" | null } {
  if (plan?.status === "active") return { label: "Etkin", kind: "success", action: "pause" };
  if (plan?.status === "paused") return { label: "Durduruldu", kind: "warning", action: "resume" };
  return { label: "Tamamlandı", kind: "neutral", action: null };
}

export function runText(run: { ref_type?: string; issued?: boolean; ref_number?: string }) {
  const base =
    run?.ref_type === "sales_invoice" ? (run.issued ? "Fatura kesildi" : "Taslak fatura")
    : run?.ref_type === "expense_draft" ? "Gider taslağı"
    : run?.ref_type === "expense_invoice" ? "Gider kaydedildi"
    : run?.ref_type === "cash_entry" ? "Kasa/banka hareketi"
    : "";
  return [base, run?.ref_number].filter(Boolean).join(" · ");
}

export function summaryLine(plan: { summary?: { customer_name?: string; document_name?: string; source_number?: string } }) {
  const s = plan?.summary || {};
  return [s.customer_name || s.document_name || "", s.source_number ? `Şablon ${s.source_number}` : ""].filter(Boolean).join(" · ");
}

// Pazaryeri iade talebi (Trendyol/HB): yalnız işaret; sipariş durumu ve stok değişmez (stok girişi öneridir, onaylanır).
export function returnBadge(o: { return_request?: { state?: string; label?: string; reason?: string } | null }) {
  const r = o?.return_request;
  if (!r || !r.state) return null;
  const kind: Kind = r.state === "approved" ? "info" : r.state === "rejected" ? "neutral" : "warning";
  return { label: r.label || "İade talebi", kind, reason: r.reason || "" };
}
