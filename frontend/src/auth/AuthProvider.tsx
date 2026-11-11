import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Notifications from "expo-notifications";
import * as FileSystem from "expo-file-system/legacy";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import * as Storage from "../storage";
import { getMe, getOrders, login as apiLogin, registerPushToken } from "../api";
import { displayOrderNo, formatOrderDateTime, isNewOrderStatus, providerLabel } from "../utils";
import type { Order, User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  bootLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  unreadNotifications: number;
  clearNotifications: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "obihub_token";
const USER_KEY = "obihub_user";
const SEEN_ORDER_IDS_KEY = "obihub_seen_order_ids";
const ORDERS_CHANNEL_ID = "orders";
const BG_TASK_NAME = "obihub-order-poll";

// Background task — runs even when app is suspended/killed (iOS ~15 min, Android more frequent)
TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    const tokenRaw = await Storage.getItemAsync("obihub_token");
    if (!tokenRaw) return BackgroundFetch.BackgroundFetchResult.NoData;

    const rawSeen = await Storage.getItemAsync("obihub_seen_order_ids");
    const parsed = rawSeen ? JSON.parse(rawSeen) : [];
    const seen = new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);

    const list = await getOrders(tokenRaw, undefined, { page: 1, perPage: 40, sortBy: "-created_at" });
    const rows = Array.isArray(list) ? list : [];
    const newOrders = rows.filter((o) => {
      const provider = String(o.integration_provider || o.provider || o.channel || "");
      return isNewOrderStatus(o, provider) && !seen.has(o.id);
    });

    if (newOrders.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    newOrders.forEach((o) => seen.add(o.id));
    await scheduleOrderNotification(newOrders);
    const keep = Array.from(seen).slice(-300);
    await Storage.setItemAsync("obihub_seen_order_ids", JSON.stringify(keep));
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Provider → emoji map for notification title
const PROVIDER_EMOJI: Record<string, string> = {
  trendyol: "🟠",
  hepsiburada: "🟠",
  n11: "🔵",
  woo: "🟣",
  woocommerce: "🟣",
};

function providerEmoji(provider: string): string {
  const key = provider.toLowerCase();
  for (const [k, v] of Object.entries(PROVIDER_EMOJI)) {
    if (key.includes(k)) return v;
  }
  return "🛍️";
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

async function downloadImageToCache(url: string, key: string): Promise<string | null> {
  if (!url) return null;
  try {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "jpg";
    const localUri = `${FileSystem.cacheDirectory}notif_img_${key}.${ext}`;
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      await FileSystem.downloadAsync(url, localUri);
    }
    return localUri;
  } catch {
    return null;
  }
}

async function scheduleOrderNotification(orders: Order[]) {
  const first = orders[0];
  const count = orders.length;
  const firstProvider = String(first.integration_provider || first.provider || first.channel || "");
  const label = providerLabel(firstProvider);
  const emoji = providerEmoji(firstProvider);
  const amount = Number(first.total_amount || 0);
  const itemCount = Array.isArray(first.items) ? first.items.length : 0;
  const customerName = first.customer_name || "";

  let title: string;
  let body: string;
  let subtitle: string | undefined;

  if (count === 1) {
    title = `💰 Yeni Sipariş · ${emoji} ${label}`;
    subtitle = `${formatAmount(amount)}${itemCount > 0 ? ` · ${itemCount} ürün` : ""}`;
    body = [
      customerName && customerName,
      `#${displayOrderNo(first)}`,
      formatOrderDateTime(first),
    ].filter(Boolean).join(" · ");
  } else {
    // Group by provider
    const byProvider: Record<string, number> = {};
    let totalAmount = 0;
    for (const o of orders) {
      const p = providerLabel(String(o.integration_provider || o.provider || o.channel || ""));
      byProvider[p] = (byProvider[p] || 0) + 1;
      totalAmount += Number(o.total_amount || 0);
    }
    title = `💰 ${count} Yeni Sipariş`;
    body = Object.entries(byProvider).map(([p, n]) => `${p}: ${n}`).join(" · ");
    subtitle = `Toplam ${formatAmount(totalAmount)}`;
  }

  // Try to attach first product image (iOS only)
  const attachments: Notifications.NotificationContentAttachmentIos[] = [];
  if (Platform.OS === "ios" && count === 1) {
    const imageUrl = first.items?.[0]?.image_url || "";
    if (imageUrl) {
      const localUri = await downloadImageToCache(imageUrl, first.id);
      if (localUri) {
        attachments.push({ identifier: null, url: localUri, type: null });
      }
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      ...(subtitle ? { subtitle } : {}),
      body,
      sound: "cha_ching.wav",
      badge: 1,
      data: { order_id: first.id, provider: firstProvider },
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    trigger: null,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const safety = setTimeout(() => {
      if (!cancelled) setBootLoading(false);
    }, 4000);

    (async () => {
      try {
        const savedToken = await Storage.getItemAsync(TOKEN_KEY);
        const savedUserRaw = await Storage.getItemAsync(USER_KEY);
        if (cancelled) return;
        if (savedToken) {
          setToken(savedToken);
          if (savedUserRaw) {
            try { setUser(JSON.parse(savedUserRaw)); } catch {}
          }
          try {
            const me = await getMe(savedToken);
            if (cancelled) return;
            setUser(me);
            await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
          } catch (e: any) {
            // Token geçersiz/süresi dolmuş → temiz çıkış yap
            if (e?.status === 401 || e?.status === 403) {
              await Storage.deleteItemAsync(TOKEN_KEY);
              await Storage.deleteItemAsync(USER_KEY);
              if (!cancelled) {
                setToken(null);
                setUser(null);
              }
            }
          }
        }
      } catch {
      } finally {
        if (!cancelled) setBootLoading(false);
        clearTimeout(safety);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email.trim(), password);
    setToken(data.access_token);
    setUser(data.user);
    await Storage.setItemAsync(TOKEN_KEY, data.access_token);
    await Storage.setItemAsync(USER_KEY, JSON.stringify(data.user));
    try {
      const me = await getMe(data.access_token);
      setUser(me);
      await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    await Storage.deleteItemAsync(TOKEN_KEY);
    await Storage.deleteItemAsync(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const me = await getMe(token);
      setUser(me);
      await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
    } catch {}
  }, [token]);

  const clearNotifications = useCallback(() => {
    setUnreadNotifications(0);
    Notifications.setBadgeCountAsync(0).catch(() => {});
  }, []);

  // Foreground notification handler
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }, []);

  // Order polling + notification dispatch
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let seen = new Set<string>();

    const poll = async () => {
      if (stopped) return;
      try {
        const list = await getOrders(token, undefined, { page: 1, perPage: 40, sortBy: "-created_at" });
        const rows = Array.isArray(list) ? list : [];
        const newOrders = rows.filter((o) => {
          const provider = String(o.integration_provider || o.provider || o.channel || "");
          return isNewOrderStatus(o, provider) && !seen.has(o.id);
        });

        if (newOrders.length > 0) {
          newOrders.forEach((o) => seen.add(o.id));
          setUnreadNotifications((v) => v + newOrders.length);
          await scheduleOrderNotification(newOrders);
          const keep = Array.from(seen).slice(-300);
          await Storage.setItemAsync(SEEN_ORDER_IDS_KEY, JSON.stringify(keep));
        }
      } catch {}
    };

    (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL_ID, {
            name: "Yeni Siparişler",
            description: "Yeni sipariş geldiğinde bildirim",
            importance: Notifications.AndroidImportance.MAX,
            sound: "cha_ching.wav",
            vibrationPattern: [0, 300, 200, 300],
            enableLights: true,
            lightColor: "#22C55E",
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: false,
            showBadge: true,
          });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
              allowCriticalAlerts: false,
              provideAppNotificationSettings: false,
              allowProvisional: false,
            },
          });
          finalStatus = status;
        }

        // Register Expo Push Token with backend for server-side push delivery
        if (finalStatus === "granted") {
          try {
            const pushTokenData = await Notifications.getExpoPushTokenAsync({
              projectId: "90de2c08-4e66-4c91-a4f7-f5aa27669d82",
            });
            if (pushTokenData.data && token) {
              await registerPushToken(token, pushTokenData.data);
            }
          } catch {}
        }

        const rawSeen = await Storage.getItemAsync(SEEN_ORDER_IDS_KEY);
        const parsed = rawSeen ? JSON.parse(rawSeen) : [];
        if (Array.isArray(parsed)) {
          seen = new Set((parsed as unknown[]).map((x) => String(x)));
        }

        await poll();
        timer = setInterval(poll, 60_000);

        // Register background fetch so polling continues when app is suspended
        try {
          const bgStatus = await BackgroundFetch.getStatusAsync();
          if (
            bgStatus === BackgroundFetch.BackgroundFetchStatus.Available ||
            bgStatus === BackgroundFetch.BackgroundFetchStatus.Restricted
          ) {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
            if (!isRegistered) {
              await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
                minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
                stopOnTerminate: false,   // Android: keep running after app killed
                startOnBoot: true,        // Android: restart after device reboot
              });
            }
          }
        } catch {}
      } catch {}
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [token]);

  const value = useMemo(
    () => ({ token, user, bootLoading, login, logout, refreshMe, unreadNotifications, clearNotifications }),
    [token, user, bootLoading, login, logout, refreshMe, unreadNotifications, clearNotifications]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
