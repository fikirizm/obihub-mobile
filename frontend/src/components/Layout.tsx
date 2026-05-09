import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../theme/tokens";

export function ScreenHeader({
  title,
  subtitle,
  right,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{subtitle}</Text>
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  hint,
  style,
}: {
  title: string;
  action?: React.ReactNode;
  hint?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
        {hint ? <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>{hint}</Text> : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  testID,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID={testID}>
      {icon ? (
        <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
          {icon}
        </View>
      ) : null}
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {description ? <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.6,
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: fontWeight.medium,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
});
