import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { spacing, tabular, type } from "../../theme/tokens";
import { IconTile } from "../../ui/ListRow";

type Props = {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
  divider?: boolean;
};

// Rapor özetindeki tek satır: solda simge ve başlık, altında değer, sağda açıklama.
export function InsightRow({ icon, label, value, hint, valueColor, divider }: Props) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={[label, value, hint].filter(Boolean).join(", ")}
      style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
    >
      <IconTile tint={colors.surfaceMuted}>{icon}</IconTile>
      <View style={styles.main}>
        <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[type.bodyStrong, tabular, { color: valueColor || colors.textPrimary, marginTop: 1 }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {hint ? (
        <Text style={[type.caption, tabular, styles.hint, { color: colors.textSecondary }]} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  main: { flex: 1, minWidth: 0 },
  hint: { maxWidth: "42%", textAlign: "right" },
});
