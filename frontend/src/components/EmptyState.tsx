import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PressableScale } from "./KPICard";
import { spacing, radius } from "../theme/tokens";

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
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.desc, { color: colors.textTertiary }]}>{description}</Text>
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          style={[styles.actionBtn, { backgroundColor: colors.primary }, shadows.primary]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "800", marginBottom: 8, textAlign: "center", letterSpacing: -0.3 },
  desc: { fontSize: 13.5, textAlign: "center", lineHeight: 20, fontWeight: "500", maxWidth: 280 },
  actionBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  actionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
