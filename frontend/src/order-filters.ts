// Sipariş durum grupları (saf modül; birim testi dev/test-order-filters.mjs).
// Kullanıcı (13 Kas 2026): "sipariş durumları filtrelenebilmeli. Yani kargoda olanları tamamlananları görebilmeli."
// Süzgeç SUNUCUDA uygulanır (GET /orders?status=a,b&integration_id=…): sayfalama doğru kalır. Sayılar GET /orders/stats
// (integration_id ile mağazaya göre) — sunucunun iç durumları backend/order_status.py'deki tablodan gelir.
// Not: kanallar iadeyi "cancelled"a çevirir (returned/refunded pratikte oluşmaz); bu yüzden tek grup "İptal / İade".

export type OrderGroupKey = "all" | "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "deleted";
export type OrderGroup = { key: OrderGroupKey; label: string; statuses: string[] };

export const ORDER_GROUPS: OrderGroup[] = [
  { key: "all", label: "Tümü", statuses: [] },
  // "Bekleyen" panel kartının saydığı açık siparişler (gönderime hazır dahil).
  { key: "pending", label: "Bekleyen", statuses: ["pending", "new", "processing", "ready_to_ship", "preparing", "payment_received"] },
  { key: "processing", label: "Gönderime hazır", statuses: ["processing", "ready_to_ship"] },
  { key: "shipped", label: "Kargoda", statuses: ["shipped", "in_transit", "intransit", "cargo", "kargoda"] },
  { key: "delivered", label: "Tamamlandı", statuses: ["delivered", "completed"] },
  { key: "cancelled", label: "İptal / İade", statuses: ["cancelled", "returned", "refunded"] },
  { key: "deleted", label: "Silinmiş", statuses: ["deleted"] },
];

type Stats = { total?: unknown; pending?: unknown; processing?: unknown; shipped?: unknown; delivered?: unknown; cancelled?: unknown; deleted?: unknown } | null | undefined;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function groupCount(stats: Stats, key: OrderGroupKey): number | undefined {
  if (!stats) return undefined;
  switch (key) {
    case "all":
      return num(stats.total);
    case "pending":
      return num(stats.pending) + num(stats.processing);
    default:
      return num((stats as any)[key]);
  }
}

export function orderQuery(o: { group: string; integrationId?: string; search?: string }) {
  const g = ORDER_GROUPS.find((x) => x.key === o.group);
  const q = String(o.search || "").trim();
  return { statuses: g ? g.statuses : [], integrationId: o.integrationId || undefined, search: q.length >= 2 ? q : undefined };
}
