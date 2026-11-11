import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, type } from "../theme/tokens";
import { PressableScale } from "../components/KPICard";

export function Chip({
  label,
  selected,
  onPress,
  count,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  count?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      hitSlop={4}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.textPrimary : colors.surface,
          borderColor: selected ? colors.textPrimary : colors.border,
        },
      ]}
    >
      <Text style={[type.callout, { color: selected ? colors.background : colors.textSecondary, fontWeight: "600" }]}>{label}</Text>
      {typeof count === "number" ? (
        <Text style={[type.caption, { color: selected ? colors.background : colors.textTertiary, fontVariant: ["tabular-nums"] }]}>{count}</Text>
      ) : null}
    </PressableScale>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {children}
      </ScrollView>
    </View>
  );
}

// İki-üç seçenekli görünüm değiştirici.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.segWrap, { backgroundColor: colors.backgroundElevated }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            testID={`segment-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            hitSlop={4}
            style={[styles.seg, active && [{ backgroundColor: colors.surface }, shadows.sm]]}
          >
            <Text style={[type.callout, { color: active ? colors.textPrimary : colors.textSecondary, fontWeight: active ? "600" : "500" }]}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 9999,
    borderWidth: 1,
  },
  row: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  segWrap: { flexDirection: "row", borderRadius: 12, padding: 3, marginHorizontal: spacing.lg },
  seg: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
