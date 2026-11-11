import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { useNotifications } from "../notifications/store";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, type } from "../theme/tokens";
import { ArrowLeftIcon, BellIcon } from "../components/Icons";
import { PressableScale } from "../components/KPICard";
import { DESTRUCTIVE_BG } from "./Button";

function initials(name?: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toLocaleUpperCase("tr-TR");
}

// Sekme ekranlarının başlığı: büyük başlık, bildirim zili ve profil.
export function TabHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { unread } = useNotifications();

  return (
    <View style={[styles.tabWrap, { paddingTop: Math.max(insets.top, 12) + 4, backgroundColor: colors.background }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <PressableScale
        testID="header-notifications"
        onPress={() => router.push("/notifications")}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
        style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      >
        <BellIcon size={20} color={colors.textPrimary} />
        {unread > 0 ? (
          <View style={[styles.badge, { backgroundColor: DESTRUCTIVE_BG, borderColor: colors.background }]}>
            <Text style={styles.badgeText}>{unread > 9 ? "9+" : String(unread)}</Text>
          </View>
        ) : null}
      </PressableScale>
      <PressableScale
        testID="header-profile"
        onPress={() => router.push("/settings")}
        accessibilityRole="button"
        accessibilityLabel="Profil ve ayarlar"
        style={[styles.avatar, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.avatarText}>{initials(user?.full_name)}</Text>
      </PressableScale>
    </View>
  );
}

// İçeri girilen ekranların başlığı: geri düğmesi ve ortalanmış başlık.
export function StackHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[styles.stackWrap, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.background }]}>
      <PressableScale
        testID="back-btn"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      >
        <ArrowLeftIcon size={20} color={colors.textPrimary} />
      </PressableScale>
      <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabWrap: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  stackWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  rightSlot: { minWidth: 44, alignItems: "flex-end" },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", lineHeight: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
});
