import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import * as FileSystem from "expo-file-system/legacy";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import * as Storage from "../storage";
import { getAccountingSettings, getMe, getOrders, getSupportNotifications, login as apiLogin, registerPushToken, setSessionHandlers } from "../api";
import { displayOrderNo, formatOrderDateTime, isNewOrderStatus, providerLabel } from "../utils";
import { clearCatalogCache } from "../catalogCache";
import { clearAllCache } from "../offlineCache";
import { addNotifications, clearNotificationsStore, hydrateNotifications } from "../notifications/store";
import type { Order, User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  bootLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  // Aboneliği kilitli hesapta backend'in döndürdüğü açıklama; kilit yoksa null.
  subscriptionLock: string | null;
  retrySubscription: () => Promise<void>;
  // Paraşüt bağlantısı: true/false bilinir, null henüz öğrenilemedi (ekranlar gizlenmez).
  parasutConnected: boolean | null;
  // Etkin muhasebe programı ("parasut", "bizimhesap" ...); bilinmiyorsa null.
  accountingProvider: string | null;
  // Muhasebe ayarı bu oturumda sunucudan okunabildi mi (false iken accountingProvider güvenilir değildir).
  accountingLoaded: boolean;
  reloadAccounting: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "obihub_token";
const USER_KEY = "obihub_user";
const SEEN_ORDER_IDS_KEY = "obihub_seen_order_ids";
const ORDERS_CHANNEL_ID = "orders";
const BG_TASK_NAME = "obihub-order-poll";
const PARASUT_CONNECTED_KEY = "obihub_parasut_connected";

// Sunucu push'u ile bildirimi zaten gösterilmiş siparişlerin kimlikleri.
// Aynı sipariş için uygulamanın kendi yoklaması ikinci bir bildirim üretmesin diye kullanılır.
async function presentedOrderIds(): Promise<string[]> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return presented
      .map((n) => String((n.request.content.data as Record<string, unknown> | null)?.order_id || ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Background task — runs even when app is suspended/killed (iOS ~15 min, Android more frequent)
TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    const tokenRaw = await Storage.getItemAsync("obihub_token");
    if (!tokenRaw) return BackgroundFetch.BackgroundFetchResult.NoData;

    const rawSeen = await Storage.getItemAsync("obihub_seen_order_ids");
    const parsed = rawSeen ? JSON.parse(rawSeen) : [];
    const seen = new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
    (await presentedOrderIds()).forEach((id) => seen.add(id));

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

// Yeni siparişleri bildirim merkezine yazar.
function recordOrderNotifications(orders: Order[]) {
  addNotifications(
    orders.map((o) => {
      const provider = String(o.integration_provider || o.provider || o.channel || "");
      return {
        id: `order-${o.id}`,
        kind: "order" as const,
        title: `Yeni sipariş · ${providerLabel(provider)}`,
        body: [o.customer_name, `#${displayOrderNo(o)}`, formatAmount(Number(o.total_amount || 0))].filter(Boolean).join(" · "),
        orderId: o.id,
        provider,
        ts: Date.now(),
      };
    })
  );
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
  const [subscriptionLock, setSubscriptionLock] = useState<string | null>(null);
  const [parasutConnected, setParasutConnected] = useState<boolean | null>(null);
  const [accountingProvider, setAccountingProvider] = useState<string | null>(null);
  const [accountingLoaded, setAccountingLoaded] = useState(false);
  // Ön plandaki yoklama ile push işleyicisinin ortak kullandığı "bildirimi verilmiş sipariş" kümesi.
  const seenOrderIdsRef = useRef<Set<string>>(new Set());

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
    await Storage.deleteItemAsync(PARASUT_CONNECTED_KEY);
    setToken(null);
    setUser(null);
    setSubscriptionLock(null);
    setParasutConnected(null);
    setAccountingProvider(null);
    setAccountingLoaded(false);
    // Önceki kullanıcının verisi sonraki girişte görünmesin.
    await clearAllCache().catch(() => {});
    clearCatalogCache();
    clearNotificationsStore();
    Notifications.setBadgeCountAsync(0).catch(() => {});
  }, []);

  // Oturumu sona eren (401) ve aboneliği kilitlenen (403) çağrıları tek yerden yakala.
  // Oturum 24 saatte dolar ve yenilenmez; uygulama açıkken dolarsa giriş ekranına dönülür.
  useEffect(() => {
    setSessionHandlers({
      onUnauthorized: () => {
        logout().catch(() => {});
      },
      onSubscriptionLocked: (message) => setSubscriptionLock(message),
    });
    return () => setSessionHandlers({});
  }, [logout]);

  const loadAccounting = useCallback(async (authToken: string) => {
    try {
      const settings = await getAccountingSettings(authToken);
      // Web panelindeki kuralla aynı: tercih edilen program bağlıysa o, değilse bağlı olan (önce BizimHesap).
      // BenimPOS muhasebe programı sayılmaz. Paraşüt kaydı bağlı kalsa bile etkin program BizimHesap olabilir.
      const pref = String(settings?.preferred_provider || settings?.provider || "").toLowerCase();
      const pc = Boolean(settings?.parasut?.connected);
      const bc = Boolean(settings?.bizimhesap?.connected);
      const active = pref === "bizimhesap" && bc ? "bizimhesap" : pref === "parasut" && pc ? "parasut" : bc ? "bizimhesap" : pc ? "parasut" : null;
      const connected = active === "parasut";
      setParasutConnected(connected);
      setAccountingProvider(active);
      setAccountingLoaded(true);
      await Storage.setItemAsync(PARASUT_CONNECTED_KEY, connected ? "1" : "0");
    } catch {
      // Öğrenilemedi: son bilinen değer kalır.
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const saved = await Storage.getItemAsync(PARASUT_CONNECTED_KEY).catch(() => null);
      if (!cancelled && (saved === "1" || saved === "0")) setParasutConnected(saved === "1");
      if (!cancelled) await loadAccounting(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadAccounting]);

  const reloadAccounting = useCallback(async () => {
    if (token) await loadAccounting(token);
  }, [token, loadAccounting]);

  const retrySubscription = useCallback(async () => {
    if (!token) return;
    try {
      // Kilit sürüyorsa bu çağrı yine 403 döner ve kilit ekranı açık kalır.
      await getOrders(token, undefined, { page: 1, perPage: 1 });
      setSubscriptionLock(null);
      await loadAccounting(token);
    } catch {}
  }, [token, loadAccounting]);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const me = await getMe(token);
      setUser(me);
      await Storage.setItemAsync(USER_KEY, JSON.stringify(me));
    } catch {}
  }, [token]);

  // Foreground notification handler
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // Sunucu push'u: sipariş için yoklama zaten bildirim verdiyse ikincisini gösterme;
        // vermediyse siparişi "görüldü" say ki yoklama tekrar bildirmesin.
        const isRemote = (notification.request.trigger as { type?: string } | null)?.type === "push";
        const orderId = String((notification.request.content.data as Record<string, unknown> | null)?.order_id || "");
        if (isRemote && orderId) {
          const seen = seenOrderIdsRef.current;
          if (seen.has(orderId)) {
            return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
          }
          seen.add(orderId);
          addNotifications([
            {
              id: `order-${orderId}`,
              kind: "order",
              title: String(notification.request.content.title || "Yeni sipariş").replace(/^💰\s*/, ""),
              body: String(notification.request.content.body || ""),
              orderId,
              provider: String((notification.request.content.data as Record<string, unknown> | null)?.provider || ""),
              ts: Date.now(),
            },
          ]);
          Storage.setItemAsync(SEEN_ORDER_IDS_KEY, JSON.stringify(Array.from(seen).slice(-300))).catch(() => {});
        }
        return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
      },
    });
  }, []);

  // Order polling + notification dispatch
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const seen = seenOrderIdsRef.current;
        // Uygulama arka plandayken sunucu push'u ile bildirilmiş siparişleri tekrar bildirme.
        (await presentedOrderIds()).forEach((id) => seen.add(id));
        const list = await getOrders(token, undefined, { page: 1, perPage: 40, sortBy: "-created_at" });
        const rows = Array.isArray(list) ? list : [];
        const newOrders = rows.filter((o) => {
          const provider = String(o.integration_provider || o.provider || o.channel || "");
          return isNewOrderStatus(o, provider) && !seen.has(o.id);
        });

        // Destek ekibinden gelen okunmamış yanıtlar bildirim merkezine eklenir (ayrıca sesli bildirim üretilmez).
        getSupportNotifications(token)
          .then((rows) =>
            addNotifications(
              rows
                .filter((r) => r.ticket_id)
                .map((r) => ({
                  id: `support-${r.ticket_id}-${r.last_super_message_at || ""}`,
                  kind: "support" as const,
                  title: `Destek yanıtı · ${r.subject || r.ticket_code || "Talep"}`,
                  body: String(r.preview || ""),
                  ticketId: r.ticket_id,
                  ts: r.last_super_message_at ? new Date(r.last_super_message_at).getTime() || Date.now() : Date.now(),
                }))
            )
          )
          .catch(() => {});

        if (newOrders.length > 0) {
          newOrders.forEach((o) => seen.add(o.id));
          recordOrderNotifications(newOrders);
          await scheduleOrderNotification(newOrders);
          const keep = Array.from(seen).slice(-300);
          await Storage.setItemAsync(SEEN_ORDER_IDS_KEY, JSON.stringify(keep));
        }
      } catch {}
    };

    (async () => {
      try {
        await hydrateNotifications();
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
          (parsed as unknown[]).forEach((x) => seenOrderIdsRef.current.add(String(x)));
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
    () => ({
      token,
      user,
      bootLoading,
      login,
      logout,
      refreshMe,
      subscriptionLock,
      retrySubscription,
      parasutConnected,
      accountingProvider,
      accountingLoaded,
      reloadAccounting,
    }),
    [
      token,
      user,
      bootLoading,
      login,
      logout,
      refreshMe,
      subscriptionLock,
      retrySubscription,
      parasutConnected,
      accountingProvider,
      accountingLoaded,
      reloadAccounting,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
