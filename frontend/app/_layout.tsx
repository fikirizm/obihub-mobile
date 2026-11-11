import { useEffect, useRef } from "react";
import { Stack, useRouter, useRootNavigationState, useSegments } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { SubscriptionLockOverlay } from "../src/components/SubscriptionLockOverlay";
import { FeedbackProvider } from "../src/ui/Feedback";
import { AppLockProvider } from "../src/security/AppLock";
import { DataCacheProvider } from "../src/context/DataCacheContext";

function navigateToOrder(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown>
) {
  const orderId = data?.order_id;
  const provider = data?.provider || "";
  if (orderId) {
    router.push({
      pathname: "/orders/[id]",
      params: { id: String(orderId), provider: String(provider) },
    });
  }
}

function useNotificationTapHandler() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const coldStartHandled = useRef(false);

  // Live listener — works when app is foregrounded or backgrounded
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateToOrder(router, response.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, [router]);

  // Cold start — app opened by tapping a notification while killed
  // Must wait until Expo Router navigation is fully mounted
  useEffect(() => {
    if (!rootNavState?.key) return; // Router not ready yet
    if (coldStartHandled.current) return;
    coldStartHandled.current = true;

    // Web'de bu yöntem yoktur ve hata fırlatır; yalnızca cihazda çağrılır.
    if (Platform.OS === "web") return;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        navigateToOrder(router, response.notification.request.content.data as Record<string, unknown>);
      })
      .catch(() => {});
  }, [rootNavState?.key, router]);
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
    const isPublic = first === "" || first === "index" || first === "forgot-password";
    if (isPublic || first === "(tabs)") return;
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  }, [rootNavState?.key, bootLoading, token, first, router]);
}

function RootInner() {
  const { mode, colors } = useTheme();
  useNotificationTapHandler();
  useSessionGuard();

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      />
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
