// Bildirim ekranı görünümü (saf modül; birim testi dev/test-notification-view.mjs). Web: components/notifications/NotificationDrawer.jsx +
// notificationTime.js (KABUK-1, 23 Kas 2026): tür çipleri, gün grupları (Bugün / Dün / Bu hafta / Daha eski), kısa göreli zaman.
// Gün sınırı Europe/Istanbul (UTC+3, yaz saati yok); Hermes'te saat dilimi desteğine güvenilmez.

type Item = { id: string; kind: string; ts: number; read?: boolean };

const TR_OFFSET = 3 * 3600 * 1000;
const DAY = 86400000;
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const dayNumber = (ts: number) => Math.floor((ts + TR_OFFSET) / DAY);
const pad = (x: number) => String(x).padStart(2, "0");

export const KIND_LABEL: Record<string, string> = { order: "Siparişler", finance: "Finans", stock: "Stok", support: "Destek", system: "Sistem" };
const KIND_ORDER = ["order", "finance", "stock", "support", "system"];
export const GROUP_LABELS: Record<string, string> = { today: "Bugün", yesterday: "Dün", week: "Bu hafta", older: "Daha eski" };
const GROUP_ORDER = ["today", "yesterday", "week", "older"];

export function dayGroup(ts: number, now = Date.now()): "today" | "yesterday" | "week" | "older" {
  if (!Number.isFinite(ts)) return "today";
  const diff = Math.max(0, dayNumber(now) - dayNumber(ts));
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 6) return "week";
  return "older";
}

// 'şimdi' · '12 dk' · '3 sa' · 'dün 16:20' · '12 Kas'
export function relativeTime(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts)) return "";
  const diffMs = now - ts;
  if (diffMs < 60000) return "şimdi";
  const days = Math.max(0, dayNumber(now) - dayNumber(ts));
  if (days === 0) {
    const min = Math.floor(diffMs / 60000);
    return min < 60 ? `${min} dk` : `${Math.floor(min / 60)} sa`;
  }
  const d = new Date(ts + TR_OFFSET);
  if (days === 1) return `dün ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// Tümü + içeriği olan türler (mobil bildirim geçmişi cihazda; yalnız sipariş ve destek türleri oluşur).
export function notificationChips(list: Item[]): { key: string; label: string; count: number }[] {
  if (!list.length) return [];
  const c: Record<string, number> = {};
  list.forEach((i) => (c[i.kind] = (c[i.kind] || 0) + 1));
  return [{ key: "all", label: "Tümü", count: list.length }, ...KIND_ORDER.filter((k) => c[k]).map((k) => ({ key: k, label: KIND_LABEL[k], count: c[k] }))];
}

export function groupNotifications<T extends Item>(list: T[], filter: string, now = Date.now()): { key: string; title: string; data: T[] }[] {
  const shown = filter === "all" ? list : list.filter((i) => i.kind === filter);
  return GROUP_ORDER.map((g) => ({ key: g, title: GROUP_LABELS[g], data: shown.filter((i) => dayGroup(i.ts, now) === g) })).filter((g) => g.data.length);
}
