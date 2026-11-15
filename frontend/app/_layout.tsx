import { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useRootNavigationState, useSegments } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { SubscriptionLockOverlay } from "../src/components/SubscriptionLockOverlay";
import { FeedbackProvider, useFeedback } from "../src/ui/Feedback";
import { canOpenRoute } from "../src/auth/permissions";
import { AppLockProvider } from "../src/security/AppLock";
import { notificationRoute } from "../src/push-ui";
import { DataCacheProvider } from "../src/context/DataCacheContext";

function navigateToOrder(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown>
) {
  // Sipariş kimliği ya da uygulama içi bağlantı yolu (sözleşme: docs/pm/tasarim/mobil-oturum-push.md).
  const route = notificationRoute(data);
  const provider = data?.provider || "";
  if (route && route.pathname === "/(tabs)/orders") {
    router.push("/(tabs)/orders");
  } else if (route) {
    router.push({
      pathname: "/orders/[id]",
      params: { id: route.params.id, provider: String(provider) },
    });
  }
}

function useNotificationTapHandler() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const { token, bootLoading } = useAuth();
  const coldStartRequested = useRef(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  const [pendingTick, setPendingTick] = useState(0);

  // Uygulama açıkken (ön planda veya arka planda) bildirime dokunma.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateToOrder(router, response.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, [router]);

  // Soğuk açılış: bildirim hedefi hemen açılmaz, oturum doğrulanana kadar bekletilir.
  // Aksi halde giriş ekranının Panel'e yönlendirmesi sipariş ekranını ezer.
  useEffect(() => {
    if (Platform.OS === "web" || coldStartRequested.current) return;
    coldStartRequested.current = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
        if (data && notificationRoute(data)) {
          pending.current = data;
          setPendingTick((n) => n + 1);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pending.current || !rootNavState?.key || bootLoading) return;
    const data = pending.current;
    pending.current = null;
    if (!token) return;
    router.replace("/(tabs)/dashboard");
    // Sekmeler yerleştikten sonra sipariş ekranını üstüne aç.
    setTimeout(() => navigateToOrder(router, data), 0);
  }, [pendingTick, rootNavState?.key, bootLoading, token, router]);
}

// Oturum uygulama açıkken sona ererse (24 saatlik süre) detay ekranlarından da giriş ekranına dön.
// Sekmeli ekranlar kendi yönlendirmesini (tabs)/_layout içinde yapar.
function useSessionGuard() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavState = useRootNavigationState();
  const { token, bootLoading } = useAuth();
  const first = String(segments[0] ?? "");

  useEffect(() => {
    if (!rootNavState?.key || bootLoading || token) return;
    // verify-code: yeni cihazda ilk girişte e-posta kodu ekranı (oturum henüz yok).
    const isPublic = first === "" || first === "index" || first === "forgot-password" || first === "verify-code";
    if (isPublic || first === "(tabs)") return;
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  }, [rootNavState?.key, bootLoading, token, first, router]);
}

// Rolün izin vermediği ekran bağlantıyla veya bildirimle açılırsa Panel'e geri döner.
function useRoleGuard() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavState = useRootNavigationState();
  const { token, user, bootLoading } = useAuth();
  const { toast } = useFeedback();
  const first = String(segments[0] ?? "");
  // Sekme ekranlarında rota adı ikinci parçadır.
  const routeKey = first === "(tabs)" ? String((segments as string[])[1] ?? "") : first;

  useEffect(() => {
    if (!rootNavState?.key || bootLoading || !token || !user) return;
    if (canOpenRoute(user, routeKey)) return;
    toast("Bu ekrana erişim yetkiniz yok.", "error");
    router.replace("/(tabs)/dashboard");
  }, [rootNavState?.key, bootLoading, token, user, routeKey, router, toast]);
}

function RootInner() {
  const { mode, colors } = useTheme();
  useNotificationTapHandler();
  useSessionGuard();
  useRoleGuard();

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {/* İçeri girilen ekranlar sağdan kayarak açılır (iOS'ta kenardan geri kaydırma çalışır);
          giriş ve sekmeler arasındaki geçiş yumuşak solmadır. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="forgot-password" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="verify-code" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="products/scan" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="pos" options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
        {/* Cila turu: kayıt oluşturan / para işleyen formlar alttan açılır (detay ve listeler sağdan kayar). */}
        <Stack.Screen name="products/new" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="customers/new" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="local-invoices/new" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="expenses/new" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="expenses/pay" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="collections/edit" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="customers/collect" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="customers/allocate" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="customers/transfer" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="offers/new" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="cash/new" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="cash/transfer" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="support/new" options={{ animation: "slide_from_bottom" }} />
      </Stack>
      <SubscriptionLockOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <DataCacheProvider>
              <FeedbackProvider>
                <AppLockProvider>
                  <RootInner />
                </AppLockProvider>
              </FeedbackProvider>
            </DataCacheProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
