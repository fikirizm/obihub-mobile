// Para birimi ayrımı (saf modül; birim testi: dev/test-pos-money.mjs). Tekil rapor alanları yalnız TRY taşır;
// diğer birimler `by_currency`'den ayrı satır olarak gösterilir, toplanmaz.
const norm = (c: string) => {
  const v = String(c || "").trim().toUpperCase();
  return v === "TL" || v === "TRL" || v === "" ? "TRY" : v;
};

export type CurrencyRevenue = { currency: string; revenue: number; orders: number };

// GET/POST /reports/overview → by_currency[<birim>].summary {total_revenue, total_orders}
export function otherCurrencyRevenue(byCurrency: Record<string, any> | null | undefined): CurrencyRevenue[] {
  if (!byCurrency || typeof byCurrency !== "object") return [];
  return Object.entries(byCurrency)
    .map(([cur, v]) => ({ currency: norm(cur), revenue: Number(v?.summary?.total_revenue) || 0, orders: Number(v?.summary?.total_orders) || 0 }))
    .filter((r) => r.currency !== "TRY" && (Math.abs(r.revenue) > 0.004 || r.orders > 0));
}
