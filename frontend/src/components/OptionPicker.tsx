// Aranabilir seçim alanı: dokununca alttan açılan pencerede liste + arama. İl / ilçe / mahalle gibi uzun listeler için.
// Liste yüklenemezse alan serbest metne döner (çağıran `fallbackText` ile yönetir).
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../haptics";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { SearchField } from "../ui/SearchField";
import { ArrowRightIcon, CheckIcon, CloseIcon } from "./Icons";
import { PressableScale } from "./KPICard";

export type PickerOption = { id: string; label: string };

const norm = (v: string) => v.toLocaleLowerCase("tr-TR").trim();

export function OptionPicker({
  label,
  value,
  options,
  loading,
  disabled,
  placeholder,
  onSelect,
  testID,
  required,
}: {
  label: string;
  value: PickerOption | null;
  options: PickerOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onSelect: (o: PickerOption) => void;
  testID?: string;
  required?: boolean;
}) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = norm(q);
    return t ? options.filter((o) => norm(o.label).includes(t)) : options;
  }, [options, q]);

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600", marginBottom: 6 }]}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      <PressableScale
        testID={testID}
        disabled={disabled}
        onPress={() => {
          setQ("");
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value?.label || placeholder || "seçin"}`}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
      >
        <Text style={[type.body, { color: value ? colors.textPrimary : colors.textTertiary, flex: 1 }]} numberOfLines={1}>
          {value?.label || placeholder || "Seçin"}
        </Text>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <ArrowRightIcon size={14} color={colors.textTertiary} />}
      </PressableScale>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Kapat" />
        <View style={[styles.sheet, shadows.md, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.sheetHead}>
            <Text style={[type.headline, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
            <PressableScale onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={6} style={styles.close}>
              <CloseIcon size={18} color={colors.textSecondary} />
            </PressableScale>
          </View>
          <SearchField testID={testID ? `${testID}-search` : undefined} value={q} onChangeText={setQ} placeholder={`${label} ara`} />
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: spacing.xl }} />
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(o) => o.id}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              renderItem={({ item, index }) => {
                const sel = value?.id === item.id;
                return (
                  <PressableScale
                    testID={testID ? `${testID}-opt-${item.id}` : undefined}
                    onPress={() => {
                      haptic.select();
                      onSelect(item);
                      setOpen(false);
                    }}
                    style={[styles.opt, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <Text style={[type.body, { color: colors.textPrimary, flex: 1, fontWeight: sel ? "700" : "400" }]}>{item.label}</Text>
                    {sel ? <CheckIcon size={16} color={colors.primary} /> : null}
                  </PressableScale>
                );
              }}
              ListEmptyComponent={<Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.lg, textAlign: "center" }]}>Sonuç yok.</Text>}
              style={{ maxHeight: 420 }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, maxHeight: "80%" },
  sheetHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  opt: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, minHeight: 48, gap: spacing.sm },
});
