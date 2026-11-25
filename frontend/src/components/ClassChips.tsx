// Kategori/etiket çipleri (salt okuma; web ClassChips CategoryCell + TagCells). Kategori renk noktalı; arşivli soluk.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { chipsView, classOf, type Names } from "../classification";
import { useTheme } from "../theme/ThemeProvider";
import { radius, type } from "../theme/tokens";

export function ClassChips({ row, names, hidden, max = 3, style, testID }: { row: any; names: Names; hidden?: boolean; max?: number; style?: any; testID?: string }) {
  const { colors } = useTheme();
  if (hidden) return null;
  const v = chipsView(names, classOf(row), max);
  if (!v.chips.length) return null;
  return (
    <View style={[styles.row, style]} testID={testID || "class-chips"} accessibilityLabel={`Kategori ve etiketler: ${v.chips.map((c) => c.label).join(", ")}`}>
      {v.chips.map((c) => (
        <View
          key={c.key}
          style={[styles.chip, { backgroundColor: c.kind === "category" ? colors.surfaceMuted : colors.backgroundElevated, borderColor: colors.borderSubtle, opacity: c.archived ? 0.55 : 1 }]}
        >
          {c.color ? <View style={[styles.dot, { backgroundColor: c.color }]} /> : c.kind === "category" ? <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} /> : null}
          <Text style={[type.caption, { color: colors.textSecondary, fontWeight: c.kind === "category" ? "600" : "500" }]} numberOfLines={1}>
            {c.kind === "tag" ? `#${c.label}` : c.label}
          </Text>
        </View>
      ))}
      {v.more ? (
        <View style={[styles.chip, { backgroundColor: colors.backgroundElevated, borderColor: colors.borderSubtle }]}>
          <Text style={[type.caption, { color: colors.textTertiary }]}>{`+${v.more}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: 180 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
