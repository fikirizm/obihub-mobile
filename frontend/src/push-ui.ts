// Yeni sipariş bildirimi (saf modül; birim testi dev/test-push-ui.mjs). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md.
// Kullanıcı isteği (15 Kas 2026): kilit ekranında başlık "Yeni sipariş · Kanal", gövde tutar ve ürün sayısı; müşteri adı YOK.

export type OrderNote = { channel: string; amount: number; itemCount: number; currency?: string; customer?: string };

function tl(v: number) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const [int, frac] = n.toFixed(2).split(".");
  return `₺${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac}`;
}

export function orderNotificationText(orders: OrderNote[], opts: { showAmount?: boolean } = {}): { title: string; body: string } {
  const show = opts.showAmount !== false;
  if (orders.length <= 1) {
    const o = orders[0] || { channel: "", amount: 0, itemCount: 0 };
    const items = o.itemCount > 0 ? `${o.itemCount} ürün` : "";
    return {
      title: o.channel ? `Yeni sipariş · ${o.channel}` : "Yeni sipariş",
      body: [show ? tl(o.amount) : null, items || null].filter(Boolean).join(" · ") || "Siparişi görmek için dokunun",
    };
  }
  const by: Record<string, number> = {};
  let total = 0;
  for (const o of orders) {
    by[o.channel || "Diğer"] = (by[o.channel || "Diğer"] || 0) + 1;
    total += Number(o.amount) || 0;
  }
  const parts = Object.entries(by).map(([c, k]) => `${c} ${k}`);
  if (show) parts.push(`Toplam ${tl(total)}`);
  return { title: `${orders.length} yeni sipariş`, body: parts.join(" · ") };
}

// Bildirime dokununca: sipariş detayı. Yalnız uygulama içi yol ya da uygulama şemasıyla gelen bağlantı kabul edilir.
export function notificationRoute(data: any): { pathname: "/orders/[id]"; params: { id: string } } | null {
  if (data?.order_id) return { pathname: "/orders/[id]", params: { id: String(data.order_id) } };
  const raw = String(data?.path || data?.url || "");
  const m = /^(?:obihub:\/\/|frontend:\/\/|\/)orders\/([^/?#]+)/.exec(raw);
  return m ? { pathname: "/orders/[id]", params: { id: decodeURIComponent(m[1]) } } : null;
}

// İzin açıklama ekranı: yalnız sistem izni hiç sorulmamışsa; "Şimdi değil" 7 gün susturur.
const SNOOZE_MS = 7 * 86400000;
export function shouldShowPushPrompt(status: string | null, dismissedAt: number | null, now = Date.now()) {
  if (status !== "undetermined") return false;
  return !dismissedAt || now - dismissedAt >= SNOOZE_MS;
}
