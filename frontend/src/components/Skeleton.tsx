import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme/tokens";

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { colors, mode } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
  const base = mode === "dark" ? colors.surfaceElevated : colors.border;

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: base, opacity },
        style,
      ]}
    />
  );
}

export function OrderCardSkeleton() {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
      <Skeleton width={40} height={40} borderRadius={12} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="80%" height={11} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <Skeleton width={64} height={14} />
        <Skeleton width={52} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      {/* Hero card placeholder */}
      <Skeleton height={200} borderRadius={20} style={{ marginBottom: spacing.sm }} />
      {/* KPI row */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Skeleton height={88} borderRadius={16} style={{ flex: 1 }} />
        <Skeleton height={88} borderRadius={16} style={{ flex: 1 }} />
        <Skeleton height={88} borderRadius={16} style={{ flex: 1 }} />
      </View>
      {/* Recent orders */}
      <Skeleton width="40%" height={13} style={{ marginTop: spacing.xs }} />
      {[0, 1, 2].map((i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </View>
  );
}

export function InvoiceCardSkeleton() {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
      <Skeleton width={38} height={38} borderRadius={12} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="70%" height={11} />
        <Skeleton width="60%" height={10} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <Skeleton width={70} height={14} />
        <Skeleton width={56} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
