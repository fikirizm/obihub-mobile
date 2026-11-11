import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { spacing } from "../../theme/tokens";

type Props = {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
};

export function InsightRow({ icon, label, value, hint, valueColor }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.textTertiary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.value, { color: valueColor || colors.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {hint ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  value: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  hint: { fontSize: 11, fontWeight: "500", maxWidth: 140, textAlign: "right" },
});
