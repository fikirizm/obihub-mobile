// Bildirim merkezi: uygulamanın gösterdiği bildirimlerin kalıcı, küçük bir geçmişi.
// Kaynaklar: yeni sipariş yoklaması ve sunucu push'u. Sunucuda bildirim geçmişi tutulmadığı için cihazda saklanır.
import { useSyncExternalStore } from "react";
import { loadCache, saveCache } from "../offlineCache";

export type AppNotification = {
  id: string;
  kind: "order" | "support";
  title: string;
  body: string;
  orderId?: string;
  provider?: string;
  ticketId?: string;
  ts: number;
  read: boolean;
};

const CACHE_KEY = "notifications_v1";
const MAX_ITEMS = 100;

let items: AppNotification[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  saveCache(CACHE_KEY, items).catch(() => {});
}

export async function hydrateNotifications() {
  if (hydrated) return;
  hydrated = true;
  const saved = await loadCache<AppNotification[]>(CACHE_KEY);
  if (Array.isArray(saved) && saved.length > 0) {
    const known = new Set(items.map((n) => n.id));
    items = [...items, ...saved.filter((n) => n && !known.has(n.id))].sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS);
    emit();
  }
}

export function addNotifications(entries: Omit<AppNotification, "read">[]) {
  if (entries.length === 0) return;
  const known = new Set(items.map((n) => n.id));
  const fresh = entries.filter((e) => !known.has(e.id)).map((e) => ({ ...e, read: false }));
  if (fresh.length === 0) return;
  items = [...fresh, ...items].sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS);
  emit();
  persist();
}

export function markNotificationRead(id: string) {
  if (!items.some((n) => n.id === id && !n.read)) return;
  items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
  emit();
  persist();
}

export function markAllNotificationsRead() {
  if (!items.some((n) => !n.read)) return;
  items = items.map((n) => (n.read ? n : { ...n, read: true }));
  emit();
  persist();
}

export function clearNotificationsStore() {
  items = [];
  hydrated = false;
  emit();
  persist();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => items;

export function useNotifications() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { list, unread: list.reduce((n, x) => n + (x.read ? 0 : 1), 0) };
}
