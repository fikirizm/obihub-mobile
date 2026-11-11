import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/auth/AuthProvider";
import { canAccess } from "../../src/auth/permissions";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { Palette } from "../../src/theme/tokens";
import { BagIcon, HomeIcon, MenuIcon, PlugIcon, TruckIcon, WalletIcon } from "../../src/components/Icons";

type TabName = "dashboard" | "integrations" | "orders" | "finance" | "hepsijet" | "menu";

const TABS: { name: TabName; label: string; Icon: typeof HomeIcon; accent: (c: Palette) => string }[] = [
  { name: "dashboard", label: "Panel", Icon: HomeIcon, accent: (c) => c.primary },
  { name: "integrations", label: "Mağaza", Icon: PlugIcon, accent: (c) => c.info },
  { name: "orders", label: "Sipariş", Icon: BagIcon, accent: (c) => c.amber },
  { name: "finance", label: "Finans", Icon: WalletIcon, accent: (c) => c.emerald },
  { name: "hepsijet", label: "HepsiJet", Icon: TruckIcon, accent: (c) => c.hepsijet },
  { name: "menu", label: "Menü", Icon: MenuIcon, accent: (c) => c.violet },
];

function TabButton({ label, Icon, accent, active, onPress, testID }: { label: string; Icon: typeof HomeIcon; accent: string; active: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(active ? 1.06 : 1, { damping: 16, stiffness: 220 });
  }, [active, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPressIn={() => (scale.value = withTiming(0.92, { duration: 90 }))}
      onPressOut={() => (scale.value = withSpring(active ? 1.06 : 1, { damping: 16 }))}
      onPress={onPress}
      style={styles.tabBtn}
    >
      <Animated.View
        style={[
          styles.pill,
          active && { backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
          animated,
        ]}
      >
        <Icon size={22} color={active ? "#FFFFFF" : colors.textSecondary} strokeWidth={active ? 2.2 : 1.8} />
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color: active ? colors.textPrimary : colors.textTertiary, fontWeight: active ? "700" : "500" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const { colors, shadows } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Mağaza sekmesi entegrasyon yetkisi olmayan rollerde gösterilmez.
  const hidden: TabName[] = canAccess(user, "integrations") ? [] : ["integrations"];

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, shadows.lg, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}
    >
      {TABS.filter((t) => !hidden.includes(t.name)).map(({ name, label, Icon, accent }) => {
        const idx = state.routes.findIndex((r: any) => r.name === name);
        if (idx < 0) return null;
        const route = state.routes[idx];
        const active = state.index === idx;
        return (
          <TabButton
            key={name}
            testID={`tab-${name}`}
            label={label}
            Icon={Icon}
            accent={accent(colors)}
            active={active}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(route.name);
              }
            }}
          />
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
      <Tabs.Screen name="integrations" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="finance" />
      <Tabs.Screen name="hepsijet" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 6 },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, gap: 4 },
  pill: { width: 48, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, letterSpacing: 0.1 },
});
