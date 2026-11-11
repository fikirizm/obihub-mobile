// Tam ekran formların ortak parçaları: etiketli metin alanı, tek seçimli seçenek şeridi ve özet satırı.
import React, { useState } from "react";
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { PressableScale } from "../components/KPICard";

export function FormField({
  label,
  error,
  hint,
  suffix,
  style,
  inputStyle,
  ...input
}: {
  label: string;
  error?: string;
  hint?: string;
  // Alanın sağında gösterilen kısa birim (ör. para birimi).
  suffix?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps["style"];
} & Omit<TextInputProps, "style">) {
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={style}>
      <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.surface, borderColor: error ? colors.error : focus ? colors.primary : colors.border },
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocus(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            input.onBlur?.(e);
          }}
          style={[styles.input, { color: colors.textPrimary }, input.multiline && styles.multiline, inputStyle]}
        />
        {suffix ? <Text style={[type.callout, { color: colors.textTertiary, fontWeight: "600" }]}>{suffix}</Text> : null}
      </View>
      {error ? (
        <Text style={[type.caption, { color: colors.error, marginTop: 4 }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.caption, { color: colors.textTertiary, marginTop: 4 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

// Tek seçimli seçenek şeridi; seçenekler satıra sığmazsa alt satıra geçer.
export function OptionChips<T extends string | number>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.options} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={String(o.value)}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            hitSlop={4}
            style={[styles.option, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface }]}
          >
            <Text style={[type.callout, { color: active ? colors.primary : colors.textSecondary, fontWeight: "600" }]}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// Özet kartlarındaki "etiket … değer" satırı.
export function SummaryLine({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.summaryLine}>
      <Text style={[strong ? type.bodyStrong : type.callout, { color: strong ? colors.textPrimary : colors.textSecondary, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[strong ? type.headline : type.callout, tabular, { color: color || colors.textPrimary, fontWeight: strong ? "700" : "600" }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: spacing.sm },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  option: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  summaryLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 28 },
});
