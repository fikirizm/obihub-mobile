import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAnimatedView } from "./SafeAnimatedView";
import { useTheme } from "../theme/ThemeProvider";
import { TrendDownIcon, TrendUpIcon } from "./Icons";
import { fontWeight, radius, spacing } from "../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => (scale.value = withTiming(0.97, { duration: 90 }))}
      onPressOut={() => (scale.value = withTiming(1, { duration: 140 }))}
      style={[animatedStyle, style as any, disabled && { opacity: 0.55 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function KPICard({
  label,
  value,
  hint,
  trendPct,
  index = 0,
  accent,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  hint?: string;
  trendPct?: number;
  index?: number;
  accent?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, shadows } = useTheme();
  const hasTrend = typeof trendPct === "number" && !Number.isNaN(trendPct);
  const trendUp = (trendPct ?? 0) >= 0;

  return (
    <SafeAnimatedView
      entering={FadeInDown.delay(index * 70).springify().damping(18)}
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
    >
      <PressableScale onPress={onPress} testID={testID} style={{ flex: 1 }}>
        <View style={styles.cardHead}>
          <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
          {hasTrend ? (
            <View
              style={[
                styles.trendPill,
                { backgroundColor: trendUp ? colors.successBg : colors.errorBg },
              ]}
            >
              {trendUp ? <TrendUpIcon size={12} color={colors.success} /> : <TrendDownIcon size={12} color={colors.error} />}
              <Text style={{ color: trendUp ? colors.success : colors.error, fontSize: 11, fontWeight: "700" }}>
                {`${trendUp ? "+" : ""}${(trendPct ?? 0).toFixed(1)}%`}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
        {hint ? (
          <Text style={[styles.hint, { color: colors.textTertiary }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
        {accent ? <View style={[styles.accentBar, { backgroundColor: accent }]} /> : null}
      </PressableScale>
    </SafeAnimatedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 96,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    flex: 1,
    paddingRight: spacing.xs,
  },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  value: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  hint: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: fontWeight.medium,
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
});
