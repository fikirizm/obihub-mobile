import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { useNotifications } from "../notifications/store";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { ArrowLeftIcon, BellIcon, LogoutIcon, MoonIcon, SunIcon } from "../components/Icons";
import { PressableScale } from "../components/KPICard";
import { SafeAnimatedView } from "../components/SafeAnimatedView";
import { DESTRUCTIVE_BG } from "./Button";
import { useFeedback } from "./Feedback";

const ICO = require("../../assets/obihub/obihub-ico.png");

// Sekme ekranlarının üst çubuğu: logo ve karşılama solda; bildirim, tema ve çıkış sağda.
// Altında ekranın büyük başlığı yer alır.
export function TabHeader({ title, eyebrow, subtitle }: { title: string; eyebrow?: string; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  const { colors, mode, toggle, shadows } = useTheme();
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const { confirm } = useFeedback();
  const lead = eyebrow || subtitle;

  const onLogout = async () => {
    const ok = await confirm({ title: "Çıkış yapılsın mı?", message: "Hesabınıza tekrar giriş yapmanız gerekir.", confirmLabel: "Çıkış yap", destructive: true });
    if (ok) await logout();
  };

  const btn = [styles.iconBtn, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }];

  return (
    <View style={[styles.tabWrap, { paddingTop: Math.max(insets.top, 12) + 4, backgroundColor: colors.background }]}>
      <View style={styles.barRow}>
        <PressableScale
          testID="header-profile"
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel={`Profil ve ayarlar, ${user?.full_name || "kullanıcı"}`}
          style={styles.identity}
        >
          <View style={[styles.logoTile, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Image source={ICO} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
              Hoş geldiniz
            </Text>
            <Text style={[type.bodyStrong, { color: colors.textPrimary, fontWeight: "700" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {user?.full_name || "Kullanıcı"}
            </Text>
          </View>
        </PressableScale>

        <PressableScale
          testID="header-notifications"
          onPress={() => router.push("/notifications")}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
          hitSlop={2}
          style={btn}
        >
          <BellIcon size={20} color={colors.textPrimary} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: DESTRUCTIVE_BG, borderColor: colors.background }]}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : String(unread)}</Text>
            </View>
          ) : null}
        </PressableScale>
        <PressableScale
          testID="header-theme-toggle"
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={mode === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
          style={btn}
        >
          {mode === "dark" ? <SunIcon size={20} color={colors.amber} /> : <MoonIcon size={20} color={colors.textPrimary} />}
        </PressableScale>
        <PressableScale testID="header-logout" onPress={onLogout} accessibilityRole="button" accessibilityLabel="Çıkış yap" style={btn}>
          <LogoutIcon size={20} color={colors.textPrimary} />
        </PressableScale>
      </View>

      <SafeAnimatedView entering={FadeInDown.duration(350)} style={styles.titleBlock}>
        {lead ? (
          <Text style={[type.caption, styles.eyebrow, { color: colors.primary }]} numberOfLines={1}>
            {lead}
          </Text>
        ) : null}
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
      </SafeAnimatedView>
    </View>
  );
}

// İçeri girilen ekranların başlığı: geri düğmesi ve ortalanmış başlık.
export function StackHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.stackWrap, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.background }]}>
      <PressableScale
        testID="back-btn"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        style={[styles.iconBtn, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
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
  tabWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  logoTile: { width: 42, height: 42, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 28, height: 28 },
  titleBlock: { marginTop: spacing.md },
  eyebrow: { fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 },
  stackWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  iconBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  rightSlot: { minWidth: 44, alignItems: "flex-end" },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700", lineHeight: 14 },
});
