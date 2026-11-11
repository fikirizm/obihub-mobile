import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, tabular, type } from "../theme/tokens";
import { displayOrderNo, displayOrderStatus, formatTry, providerLabel, relativeDateLabel, statusKindFromOrder } from "../utils";
import type { Order } from "../types";
import { PressableScale } from "./KPICard";
import { PlatformLogo } from "./PlatformLogo";
import { StatusBadge } from "./StatusBadge";

export function orderProvider(o: Order) {
  return String(o.integration_provider || o.provider || o.channel || "");
}

// Tüm sipariş listelerinde kullanılan satır.
export function OrderRow({ order, divider }: { order: Order; divider?: boolean }) {
  const { colors } = useTheme();
  const provider = orderProvider(order);
  const status = displayOrderStatus(order, provider);
  const amount = formatTry(order.total_amount || 0);
  return (
    <PressableScale
      testID={`order-row-${order.id}`}
      onPress={() => router.push({ pathname: "/orders/[id]", params: { id: order.id, provider } })}
      accessibilityRole="button"
      accessibilityLabel={`${providerLabel(provider)} siparişi ${displayOrderNo(order)}, ${order.customer_name || "müşteri"}, ${amount}, ${status}`}
    >
      <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <PlatformLogo provider={provider} size="sm" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
            {order.customer_name || "Müşteri"}
          </Text>
          <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
            #{displayOrderNo(order)} · {relativeDateLabel(order)}
          </Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{amount}</Text>
          <StatusBadge label={status} kind={statusKindFromOrder(order, provider)} size="sm" />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 68 },
  trailing: { alignItems: "flex-end", gap: 4 },
});
