// Gider faturası geçmişi ve kopyası (saf modül; birim testi dev/test-expense-extras.mjs). Dalga 1 P1.3:
// GET /accounting/expense-invoices/{ref}/history, /copy (elle alış formu ön doldurması; belge no, tarih, vade, ödeme kopyalanmaz).

const KIND_LABEL: Record<string, string> = {
  created: "Oluşturuldu",
  synced: "Eşitlendi",
  payment: "Ödeme eklendi",
  payment_voided: "Ödeme silindi",
  category: "Kategori değişti",
  tags: "Etiketler değişti",
  archived: "Arşivlendi",
  unarchived: "Arşivden çıkarıldı",
  reversed: "Geri alındı",
};

export type HistoryRow = { at: string; kind: string; title: string; detail: string };

export function historyRows(resp: any): HistoryRow[] {
  const items = Array.isArray(resp?.items) ? resp.items : [];
  return items.map((x: any) => {
    const kind = String(x?.kind || "");
    const title = typeof x?.title === "string" && x.title.trim() ? x.title.trim() : KIND_LABEL[kind] || "İşlem";
    return { at: String(x?.at || ""), kind, title, detail: typeof x?.detail === "string" ? x.detail : "" };
  });
}

type LineInput = { kind: "service" | "product"; productId: string; productName: string; description: string; quantity: string; unitPrice: string; vatRate: string; discount: string };

const plain = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const rate = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "20";
};

// Elle gider formunun kopyalanan alanları (ManualForm'un alt kümesi). Kalemsiz kopyada bir boş kalem.
export function copyToForm(copy: any) {
  const s = copy?.supplier || {};
  const lines: LineInput[] = (Array.isArray(copy?.lines) ? copy.lines : []).map((l: any) => {
    const product = l?.kind === "product" && l?.product_id;
    return {
      kind: product ? "product" : "service",
      productId: product ? String(l.product_id) : "",
      productName: product ? plain(l.product_name || l.description) : "",
      description: plain(l?.description),
      quantity: plain(l?.quantity) || "1",
      unitPrice: plain(l?.unit_price),
      vatRate: rate(l?.vat_rate),
      discount: plain(l?.discount),
    };
  });
  return {
    supplierMode: (s.party_id ? "existing" : "new") as "existing" | "new",
    partyId: s.party_id ? String(s.party_id) : "",
    name: plain(s.name),
    taxId: plain(s.tax_id),
    documentNumber: "",
    issueDate: "",
    dueDate: "",
    categoryId: copy?.expense_category_id ? String(copy.expense_category_id) : "",
    lines: lines.length ? lines : [{ kind: "service" as const, productId: "", productName: "", description: "", quantity: "1", unitPrice: "", vatRate: "20", discount: "" }],
  };
}

const WARN: Record<string, string> = {
  CATEGORY_NOT_COPIED: "Kategori kopyalanmadı (arşivlenmiş ya da yok).",
  TAGS_NOT_COPIED: "Etiketlerin bir kısmı kopyalanmadı.",
};
export function copyNotice(copy: any): string | null {
  const w = (Array.isArray(copy?.warnings) ? copy.warnings : []).map((c: string) => WARN[c]).filter(Boolean);
  return w.length ? w.join(" ") : null;
}
