// Mağaza düzeyinde duran stok gönderimi (sunucu stock_push_warning; ör. Amazon SP-API Listings yetkisi yok).
// Web karşılığı: ProductStockListPage.js "stock-push-warnings". Her mağaza bir kez, adıyla.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { storeStockWarnings } from "../amazon-stock-push";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import type { ChannelRef } from "../types";
import { AlertIcon } from "./Icons";

export function StockPushWarnings({ channels, style }: { channels: ChannelRef[]; style?: any }) {
  const { colors } = useTheme();
  const items = storeStockWarnings(channels);
  if (!items.length) return null;
  return (
    <View testID="stock-push-warnings" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.warningBg }, style]}>
      {items.map((w) => (
        <View key={w.id} testID={`stock-push-warning-${w.id}`} style={styles.row}>
          <AlertIcon size={16} color={colors.amber} />
          <Text style={[type.caption, { color: colors.textPrimary, flex: 1 }]}>{w.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
});
