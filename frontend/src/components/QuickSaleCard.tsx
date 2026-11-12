// D1 — Panel'deki "Hızlı satış" kısayolu (PM kararı 12 Kas 2026). Yalnız fatura/kasa yönetme yetkisinde görünür.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { ArrowRightIcon, WalletIcon } from "./Icons";
import { PressableScale } from "./KPICard";

export function QuickSaleCard() {
  const { colors, shadows } = useTheme();
  return (
    <PressableScale
      testID="quick-sale-card"
      onPress={() => router.push("/pos")}
      accessibilityRole="button"
      accessibilityLabel="Hızlı satış: barkod okut, sepete ekle, tahsil et"
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.emerald }]}>
        <WalletIcon size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Hızlı satış</Text>
        <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          Barkod okut, sepete ekle, tahsil et
        </Text>
      </View>
      <ArrowRightIcon size={18} color={colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
