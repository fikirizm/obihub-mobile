import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { BagIcon, ChartIcon, HomeIcon, MenuIcon, WalletIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";

type TabName = "dashboard" | "orders" | "finance" | "reports" | "menu";

const TABS: { name: TabName; label: string; Icon: typeof HomeIcon }[] = [
  { name: "dashboard", label: "Panel", Icon: HomeIcon },
  { name: "orders", label: "Siparişler", Icon: BagIcon },
  { name: "finance", label: "Finans", Icon: WalletIcon },
  { name: "reports", label: "Raporlar", Icon: ChartIcon },
  { name: "menu", label: "Menü", Icon: MenuIcon },
];

function CustomTabBar({ state, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}
    >
      {TABS.map(({ name, label, Icon }) => {
        const idx = state.routes.findIndex((r: any) => r.name === name);
        if (idx < 0) return null;
        const route = state.routes[idx];
        const active = state.index === idx;
        const color = active ? colors.primary : colors.textTertiary;
        return (
          <PressableScale
            key={name}
            testID={`tab-${name}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tabBtn}
          >
            <Icon size={24} color={color} strokeWidth={active ? 2.2 : 1.8} />
            <Text numberOfLines={1} style={[styles.label, { color, fontWeight: active ? "600" : "500" }]}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { token, bootLoading } = useAuth();

  useEffect(() => {
    if (!bootLoading && !token) router.replace("/");
  }, [bootLoading, token]);

  if (bootLoading || !token) return null;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <CustomTabBar {...props} />}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="finance" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingHorizontal: 4 },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, gap: 3 },
  label: { fontSize: 12, letterSpacing: 0.1 },
});
