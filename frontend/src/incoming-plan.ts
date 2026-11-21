// Gelen faturada yeni ürün planı (saf modül; birim testi dev/test-incoming-plan.mjs). Faz A M6.
// Web: components/quickImport/useQuickImportPreview.js. Stoklu modda form açıkken "Yeni ürün" seçilen satırlar için önce
// POST /incoming-invoices/{id}/quick-import/remember-products {line_indexes} ile ertelenmiş kart planı alınır; planlanan satırlar
// new_product_draft:false ile önizlenir (sunucu planı belgeyle eşleştirir; onayda tek kart açılır, kopya ürün oluşmaz).

type Choice = { kind: "product" | "service" | null; product_id: string | null; new_product_draft: boolean; [k: string]: unknown };

export function planIndexes(choices: Choice[], planned: Set<number>, ctx: { formOpen: boolean; mode: string }): number[] | null {
  if (!ctx.formOpen || ctx.mode !== "expense_and_stock" || !choices.some((c) => c?.new_product_draft)) return null;
  return choices.flatMap((c, i) => (c?.kind === "product" && !c.product_id && (c.new_product_draft || planned.has(i)) ? [i] : []));
}

export function applyPlan<T extends Choice>(choices: T[], res: any): { choices: T[]; planned: Set<number> } {
  const lines: any[] = Array.isArray(res?.lines) ? res.lines : [];
  const planned = new Set<number>(lines.filter((l) => Number.isInteger(l?.index) && l.product_id && ["planned", "existing"].includes(l.status)).map((l) => l.index as number));
  return { choices: choices.map((c, i) => (planned.has(i) ? { ...c, new_product_draft: false } : c)), planned };
}
