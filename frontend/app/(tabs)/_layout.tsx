import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSpring } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { ChartIcon, HomeIcon, PlugIcon, ReceiptIcon, TruckIcon } from "../../src/components/Icons";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";

type TabName = "dashboard" | "integrations" | "invoices" | "reports" | "hepsijet";

const TAB_ORDER: TabName[] = ["dashboard", "integrations", "invoices", "reports", "hepsijet"];

const TAB_ACCENTS: Record<TabName, string> = {
  dashboard: "#0F172A",
  integrations: "#2563EB",
  invoices: "#16A34A",
  reports: "#7C3AED",
  hepsijet: "#F97316",
};

const TAB_LABELS: Record<TabName, string> = {
  dashboard: "Panel",
  integrations: "Mağaza",
  invoices: "Fatura",
  reports: "Rapor",
  hepsijet: "HepsiJet",
};

function TabButton({
  name,
  active,
  onPress,
  testID,
}: {
  name: TabName;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const accent = TAB_ACCENTS[name];

  useEffect(() => {
    scale.value = withSpring(active ? 1.04 : 1, { damping: 18, stiffness: 220 });
  }, [active, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const iconColor = active ? "#FFFFFF" : colors.textSecondary;
  const Icon =
    name === "dashboard"
      ? HomeIcon
      : name === "integrations"
        ? PlugIcon
        : name === "invoices"
          ? ReceiptIcon
          : name === "reports"
            ? ChartIcon
            : TruckIcon;

  return (
    <Pressable
      testID={testID}
      onPressIn={() => (scale.value = withTiming(0.94, { duration: 90 }))}
      onPressOut={() => (scale.value = withSpring(active ? 1.04 : 1, { damping: 18 }))}
      onPress={onPress}
      style={styles.tabBtn}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          { backgroundColor: active ? accent : "transparent" },
          animatedStyle,
        ]}
      >
        <Icon size={22} color={iconColor} strokeWidth={active ? 2.2 : 1.8} />
      </Animated.View>
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          { color: active ? colors.textPrimary : colors.textTertiary, fontWeight: active ? "700" : "500" },
        ]}
      >
        {TAB_LABELS[name]}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.barWrap,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
        },
        shadows.lg,
      ]}
    >
      <View style={styles.bar}>
        {state.routes.map((route: any, idx: number) => {
          const isActive = state.index === idx;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);
          };
          const tabName = route.name as TabName;
          if (!TAB_ORDER.includes(tabName)) return null;
          return (
            <TabButton
              key={route.key}
              name={tabName}
              active={isActive}
              onPress={onPress}
              testID={`tab-${tabName}`}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { token, bootLoading } = useAuth();

  useEffect(() => {
    // Only redirect after bootstrap; allow demo viewing if token is "demo-token"
    if (!bootLoading && !token) {
      router.replace("/");
    }
  }, [bootLoading, token]);

  if (bootLoading) return null;
  // If no real token AND no demo token, return null (will redirect)
  if (!token) return null;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="integrations" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="hepsijet" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: 8,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingTop: 4,
    gap: 4,
  },
  iconWrap: {
    width: 46,
    height: 30,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.1,
  },
});
