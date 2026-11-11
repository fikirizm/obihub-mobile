import { useEffect, useRef } from "react";
import { Stack, useRouter, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { AuthProvider } from "../src/auth/AuthProvider";
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

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      navigateToOrder(router, response.notification.request.content.data as Record<string, unknown>);
    });
  }, [rootNavState?.key, router]);
}

function RootInner() {
  const { mode, colors } = useTheme();
  useNotificationTapHandler();

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
              <RootInner />
            </DataCacheProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
