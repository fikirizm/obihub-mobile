import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, tabular, type } from "../theme/tokens";
import { displayOrderNo, displayOrderStatus, formatTry, providerLabel, relativeDateLabel, statusKindFromOrder } from "../utils";
import type { Order } from "../types";
import type { StatusKind } from "../utils";
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
  const kind = statusKindFromOrder(order, provider);
  const stripe: Record<StatusKind, string> = {
    warning: colors.warning,
    info: colors.info,
    success: colors.success,
    error: colors.error,
    neutral: colors.border,
  };
  return (
    <PressableScale
      testID={`order-row-${order.id}`}
      onPress={() => router.push({ pathname: "/orders/[id]", params: { id: order.id, provider } })}
      accessibilityRole="button"
      accessibilityLabel={`${providerLabel(provider)} siparişi ${displayOrderNo(order)}, ${order.customer_name || "müşteri"}, ${amount}, ${status}`}
    >
      <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        {/* Durum rengi: bekleyen sarı, kargoda mavi, teslim yeşil, iptal kırmızı. */}
        <View pointerEvents="none" style={[styles.stripe, { backgroundColor: stripe[kind] }]} />
        <PlatformLogo provider={provider} size="sm" />
        <View style={styles.body}>
          {/* 1. satır: müşteri adı esner, tutar hiç kısalmaz. */}
          <View style={styles.line}>
            <Text style={[type.bodyStrong, styles.grow, { color: colors.textPrimary }]} numberOfLines={1}>
              {order.customer_name || "Müşteri"}
            </Text>
            <Text style={[type.bodyStrong, tabular, styles.fixed, { color: colors.textPrimary }]} numberOfLines={1}>
              {amount}
            </Text>
          </View>
          {/* 2. satır: sipariş no ve tarih esner, durum rozeti hiç kısalmaz. */}
          <View style={styles.line}>
            <Text style={[type.footnote, tabular, styles.grow, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="middle">
              #{displayOrderNo(order)} · {relativeDateLabel(order)}
            </Text>
            <View style={styles.fixed}>
              <StatusBadge label={status} kind={kind} size="sm" />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    minHeight: 68,
  },
  stripe: { position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  body: { flex: 1, minWidth: 0, gap: 5 },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  grow: { flex: 1, minWidth: 0 },
  fixed: { flexShrink: 0 },
});
