import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { StatusKind } from "../utils";

export function StatusBadge({
  label,
  kind = "neutral",
  size = "md",
}: {
  label: string;
  kind?: StatusKind;
  size?: "sm" | "md";
}) {
  const { colors } = useTheme();

  const colorMap: Record<StatusKind, { bg: string; fg: string; dot: string }> = {
    success: { bg: colors.successBg, fg: colors.success, dot: colors.success },
    info: { bg: colors.infoBg, fg: colors.info, dot: colors.info },
    warning: { bg: colors.warningBg, fg: colors.warning, dot: colors.warning },
    error: { bg: colors.errorBg, fg: colors.error, dot: colors.error },
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, dot: colors.textTertiary },
  };

  const c = colorMap[kind];
  const pad = size === "sm" ? { px: 8, py: 3, fs: 11 } : { px: 10, py: 5, fs: 12 };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: c.bg,
          paddingHorizontal: pad.px,
          paddingVertical: pad.py,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: c.dot }]} />
      <Text style={{ color: c.fg, fontWeight: "600", fontSize: pad.fs, letterSpacing: 0.1 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 9999,
    gap: 6,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
