// Satış faturası durumu — iki eksen (saf modül; birim testi dev/test-invoice-status.mjs). Web: frontend/src/lib/invoiceStatus.js ile aynı kural.
//   Belge:    Taslak → Kesildi (resmileşmedi) → Resmileşti (e-Fatura / e-Arşiv) → İptal
//   Tahsilat: Tahsil edilecek / Kısmen tahsil edildi / Tahsil edildi / Gecikti
// İç "gonderildi" değeri kullanıcıya "Kesildi" olarak gösterilir. Sunucu süzgeci: GET /local-invoices?view=… (_view_filter).

export type Kind = "success" | "info" | "warning" | "error" | "neutral";
export type Axis = { key: string; label: string; kind: Kind };

export const DOC_AXIS: Record<string, Axis> = {
  draft: { key: "draft", label: "Taslak", kind: "neutral" },
  issued: { key: "issued", label: "Kesildi", kind: "info" },
  official: { key: "official", label: "Resmileşti", kind: "success" },
  cancelled: { key: "cancelled", label: "İptal", kind: "neutral" },
};
export const PAY_AXIS: Record<string, Axis> = {
  to_collect: { key: "to_collect", label: "Tahsil edilecek", kind: "warning" },
  partial: { key: "partial", label: "Kısmen tahsil edildi", kind: "info" },
  paid: { key: "paid", label: "Tahsil edildi", kind: "success" },
  overdue: { key: "overdue", label: "Gecikti", kind: "error" },
};
export const NOT_OFFICIAL: Axis = { key: "not_official", label: "Resmileşmedi", kind: "warning" };
// Dalga 1 (P1.1): e-belgesi iptal edilmiş fatura resmi değil; yerel iptale kadar "Kesildi · e-Belge iptal edildi".
export const EDOC_CANCELLED: Axis = { key: "edoc_cancelled", label: "e-Belge iptal edildi", kind: "error" };
export const edocCancelled = (inv: Record<string, any> | null | undefined) => Boolean(inv?.edoc_cancelled_at) || inv?.edoc_state === "cancelled";

export const SALES_TABS: [string, string][] = [
  ["", "Tümü"],
  ["taslak", "Taslak"],
  ["kesildi", "Kesildi"],
  ["resmilesti", "Resmileşti"],
  ["tahsil", "Tahsil edilecek"],
  ["gecikmis", "Gecikmiş"],
  ["iptal", "İptal"],
  ["arsiv", "Arşiv"],
];

const EDOC_TYPE: Record<string, string> = { e_invoice: "e-Fatura", einvoice: "e-Fatura", e_fatura: "e-Fatura", e_archive: "e-Arşiv", earchive: "e-Arşiv", e_arsiv: "e-Arşiv" };
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Inv = Record<string, any> | null | undefined;

export function documentAxis(inv: Inv): "draft" | "issued" | "official" | "cancelled" {
  const st = inv?.status;
  if (st === "taslak") return "draft";
  if (st === "iptal") return "cancelled";
  if (inv?.edoc_cancelled_at) return "issued";
  // Sürüm 3: Paraşüt'te doğmuş ya da aynalanmış belge de resmidir (sunucu view=resmilesti ile aynı kural).
  if (st === "resmilesti" || inv?.edoc_state === "done" || ["parasut_import", "parasut", "parasut_mirror"].includes(String(inv?.source || "")) || inv?.source_kind === "parasut")
    return "official";
  return "issued";
}

const isRefund = (inv: Inv) => String(inv?.parasut_item_type || "").toLowerCase() === "refund";

// Tahsil edilecek tutar: tevkifat ve stopaj düşülmüş `payable_amount`; eski belgede `total`.
export const collectAmount = (inv: Inv) => num(inv?.payable_amount ?? inv?.total);

export function paymentAxis(inv: Inv): "to_collect" | "partial" | "paid" | "overdue" | null {
  const doc = documentAxis(inv);
  if (doc === "draft" || doc === "cancelled" || isRefund(inv)) return null;
  const total = collectAmount(inv);
  const paid = num(inv?.paid_amount);
  const remaining = inv?.remaining_amount == null ? Math.max(total - paid, 0) : num(inv.remaining_amount);
  if (remaining <= 0 && (paid > 0 || inv?.status === "odendi" || total === 0)) return "paid";
  if (inv?.is_overdue === true || inv?.display_status === "gecikti" || inv?.money_state === "overdue") return "overdue";
  if (paid > 0) return "partial";
  return "to_collect";
}

export function invoiceStatusView(inv: Inv, ctx: { parasutConnected?: boolean } = {}) {
  const doc = documentAxis(inv);
  const base = DOC_AXIS[doc];
  const typeLabel = doc === "official" ? EDOC_TYPE[String(inv?.edocument_type || inv?.edoc_type || "").toLowerCase()] : undefined;
  const document: Axis = typeLabel ? { ...base, label: `${base.label} · ${typeLabel}` } : base;
  const pay = paymentAxis(inv);
  const second = doc === "issued" ? (inv?.edoc_cancelled_at ? EDOC_CANCELLED : ctx.parasutConnected ? NOT_OFFICIAL : null) : null;
  return { document, notOfficial: second, payment: pay ? PAY_AXIS[pay] : null };
}

export function invoiceStatusText(inv: Inv, ctx?: { parasutConnected?: boolean }) {
  const v = invoiceStatusView(inv, ctx);
  return [v.document.label, v.notOfficial?.label, v.payment?.label].filter(Boolean).join(" · ");
}

// ---- Detay tutar satırları (G2 §5) ----
// P1 belgesinde (doc_schema: 1) `subtotal` iskontolardan SONRAki KDV hariç ara toplamdır; eski belgede iskonto öncesidir.
// Genel toplam = ara toplam + ÖTV/ÖİV/konaklama + KDV; tevkifat ve stopaj toplamdan düşmez, "Tahsil edilecek"ten düşer.
export type AmountRow = { key: string; label: string; amount: number; strong?: boolean };

const rateLabel = (r: unknown) => String(r).replace(".", ",");

export function amountRows(inv: Inv): AmountRow[] {
  const p1 = Number(inv?.doc_schema) === 1;
  const disc = num(inv?.discount_amount);
  const rows: AmountRow[] = [];
  if (p1) {
    if (disc > 0) rows.push({ key: "discount", label: "İndirim", amount: -disc });
    rows.push({ key: "subtotal", label: "Ara toplam (KDV hariç)", amount: num(inv?.subtotal) });
  } else {
    rows.push({ key: "subtotal", label: "Ara toplam", amount: num(inv?.subtotal) });
    if (disc > 0) rows.push({ key: "discount", label: "İndirim", amount: -disc });
  }
  if (num(inv?.other_taxes_total) > 0) rows.push({ key: "other_taxes", label: "ÖTV / ÖİV", amount: num(inv?.other_taxes_total) });
  rows.push({ key: "vat", label: "KDV", amount: num(inv?.vat_amount) });
  if (inv?.accommodation_tax_rate != null && inv.accommodation_tax_rate !== "")
    rows.push({ key: "accommodation", label: `Konaklama vergisi (%${rateLabel(inv.accommodation_tax_rate)})`, amount: num(inv.accommodation_tax_total) });
  rows.push({ key: "total", label: "Genel toplam", amount: num(inv?.total), strong: true });
  const wh = num(inv?.withholding_total);
  const stopaj = inv?.stopaj_rate != null && inv.stopaj_rate !== "" ? num(inv.stopaj_total) : 0;
  if (wh > 0) rows.push({ key: "withholding", label: "Tevkifat", amount: -wh });
  if (stopaj > 0) rows.push({ key: "stopaj", label: `Stopaj (%${rateLabel(inv?.stopaj_rate)})`, amount: -stopaj });
  if (wh > 0 || stopaj > 0) rows.push({ key: "payable", label: "Tahsil edilecek", amount: collectAmount(inv), strong: true });
  return rows;
}

// ---- G2 §6: Paraşüt'e taşınamayan alanlar (sunucu 422 PARASUT_FIELD_UNSUPPORTED); ön yüz düğmeyi göstermeden açıklar ----
export function parasutUnsupported(inv: Inv): string[] {
  const out: string[] = [];
  if (num(inv?.withholding_total) > 0) out.push("KDV tevkifatı");
  if (num(inv?.other_taxes_total) > 0) out.push("ÖTV/ÖİV");
  if (num(inv?.accommodation_tax_total) > 0) out.push("konaklama vergisi");
  if (num(inv?.stopaj_total) > 0) out.push("stopaj");
  return out;
}
export function parasutUnsupportedText(inv: Inv): string | null {
  const f = parasutUnsupported(inv);
  return f.length ? `Bu faturadaki ${f.join(", ")} Paraşüt'e henüz aktarılamıyor; bu fatura yalnız ObiHub'da kalır.` : null;
}
