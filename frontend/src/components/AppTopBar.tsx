import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../theme/tokens";
import { LogoutIcon, MoonIcon, SunIcon } from "./Icons";
import { PressableScale } from "./KPICard";

const ICO = require("../../assets/obihub/obihub-ico.png");

export function AppTopBar() {
  const insets = useSafeAreaInsets();
  const { colors, mode, toggle, shadows } = useTheme();
  const { user, logout } = useAuth();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) + 4, backgroundColor: colors.background }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={[styles.icoWrap, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <Image source={ICO} style={styles.ico} resizeMode="contain" />
          </View>
          <View>
            <Text style={[styles.greeting, { color: colors.textTertiary }]} numberOfLines={1}>
              Hoş geldin
            </Text>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {user?.full_name || "Kullanıcı"}
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <PressableScale
            onPress={toggle}
            testID="header-theme-toggle"
            style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          >
            {mode === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </PressableScale>
          <PressableScale
            onPress={logout}
            testID="header-logout"
            style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          >
            <LogoutIcon size={18} color={colors.textSecondary} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  icoWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  ico: { width: 26, height: 26 },
  greeting: { fontSize: 11, fontWeight: fontWeight.medium, letterSpacing: 0.4, textTransform: "uppercase" },
  name: { fontSize: 16, fontWeight: fontWeight.bold, letterSpacing: -0.3, marginTop: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
