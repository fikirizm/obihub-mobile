import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PressableScale } from "./KPICard";
import { hitTarget, radius, spacing, type } from "../theme/tokens";

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors, shadows } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
        {icon}
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>{description}</Text>
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          style={[styles.actionBtn, { backgroundColor: colors.primary }, shadows.primary]}
        >
          <Text style={styles.actionText} numberOfLines={1}>
            {actionLabel}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.xxxl + spacing.xs, paddingHorizontal: spacing.xxl },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  title: { ...type.headline, marginBottom: spacing.xs, textAlign: "center" },
  desc: { ...type.footnote, textAlign: "center", maxWidth: 280 },
  actionBtn: {
    marginTop: spacing.lg,
    minHeight: hitTarget,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  // colors.primary zemin üzerinde beyaz metin (tasarım sistemi istisnası).
  actionText: { ...type.bodyStrong, color: "#FFFFFF" },
});
