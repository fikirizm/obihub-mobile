import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme/tokens";
import { CloseIcon, SearchIcon } from "../components/Icons";
import { PressableScale } from "../components/KPICard";

export function SearchField({
  value,
  onChangeText,
  placeholder,
  testID,
  inset = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  testID?: string;
  // false: kendi kenar boşluğu olan bir bölümün içinde (ör. POS ödeme bölümü) kenarlara hizalı durur.
  inset?: boolean;
}) {
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[styles.wrap, !inset && { marginHorizontal: 0 }, { backgroundColor: colors.surface, borderColor: focus ? colors.primary : colors.border }]}>
      <SearchIcon size={18} color={colors.textTertiary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        style={[styles.input, { color: colors.textPrimary }]}
      />
      {value ? (
        <PressableScale onPress={() => onChangeText("")} accessibilityRole="button" accessibilityLabel="Aramayı temizle" style={styles.clear}>
          <CloseIcon size={16} color={colors.textTertiary} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingLeft: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 8, minHeight: 44 },
  clear: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
