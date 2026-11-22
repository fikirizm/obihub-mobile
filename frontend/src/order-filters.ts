// Sipariş durum grupları (saf modül; birim testi dev/test-order-filters.mjs).
// Kullanıcı (13 Kas 2026): "sipariş durumları filtrelenebilmeli. Yani kargoda olanları tamamlananları görebilmeli."
// Ortak sözleşme (13 Kas 2026, docs/mobil-oturum-icin-notlar.md; backend/order_status.py ORDER_STATUS_GROUPS):
// süzgeç GET /orders?status_group=…&integration_id=… (sunucuda; sayfalama doğru), sayılar GET /orders/stats → groups.
// Her sipariş tam bir gruba düşer; "İade" iç durumu iptal/silinmiş olup kanal ham durumu iade olan siparişlerdir.

export type OrderGroupKey = "all" | "pending" | "ready_to_ship" | "shipped" | "delivered" | "cancelled" | "returned" | "deleted";
export type OrderGroup = { key: OrderGroupKey; label: string };

export const ORDER_GROUPS: OrderGroup[] = [
  { key: "all", label: "Tümü" },
  { key: "pending", label: "Bekleyen" },
  { key: "ready_to_ship", label: "Gönderime hazır" },
  { key: "shipped", label: "Kargoda" },
  { key: "delivered", label: "Tamamlandı" },
  { key: "cancelled", label: "İptal" },
  { key: "returned", label: "İade" },
  { key: "deleted", label: "Silinmiş" },
];

type Stats = { groups?: Partial<Record<OrderGroupKey, unknown>> | null } | null | undefined;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Sayılar yalnız sunucunun grup bölünmesinden; groups yoksa (eski sunucu) sayı gösterilmez.
export function groupCount(stats: Stats, key: OrderGroupKey): number | undefined {
  const groups = stats?.groups;
  if (!groups || typeof groups !== "object") return undefined;
  return num(groups[key]);
}

// Arama metni olduğu gibi gönderilir: sunucu regex kaçışını kendisi yapar.
export function orderQuery(o: { group: string; integrationId?: string; search?: string }) {
  const g = ORDER_GROUPS.find((x) => x.key === o.group);
  const q = String(o.search || "").trim();
  return {
    statusGroup: g && g.key !== "all" ? g.key : undefined,
    integrationId: o.integrationId || undefined,
    search: q.length >= 2 ? q : undefined,
  };
}

// Sipariş sekmesi başlığındaki "Sipariş Raporu" düğmesi (kullanıcı kararı 22 Kas 2026); yalnız rapor izni olana (canAccess "reports").
export type OrderReportLink = { label: string; route: "/reports"; a11y: string };
export function orderReportLink(canSeeReports: boolean): OrderReportLink | null {
  return canSeeReports ? { label: "Sipariş Raporu", route: "/reports", a11y: "Sipariş Raporu'nu aç" } : null;
}
