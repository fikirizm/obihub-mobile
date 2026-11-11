import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { PressableScale } from "../KPICard";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "../Icons";
import { endOfDay, formatDateInput, presetRanges, startOfDay, type RangeT } from "./reportUtils";

type Props = {
  visible: boolean;
  onClose: () => void;
  currentRange: RangeT;
  onSelect: (r: RangeT) => void;
};

const TARGETS = [
  { key: "start", label: "Başlangıç" },
  { key: "end", label: "Bitiş" },
] as const;

export function DateRangeModal({ visible, onClose, currentRange, onSelect }: Props) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [startDate, setStartDate] = useState<Date>(currentRange.start);
  const [endDate, setEndDate] = useState<Date>(currentRange.end);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStartDate(startOfDay(currentRange.start));
      setEndDate(endOfDay(currentRange.end));
      setError(null);
    }
  }, [visible, currentRange]);

  const presets = useMemo(() => presetRanges(), []);

  const applyCustom = () => {
    const s = startOfDay(startDate);
    const e = endOfDay(endDate);
    if (s > e) {
      setError("Başlangıç tarihi bitişten sonra olamaz.");
      return;
    }
    onSelect({ key: "custom", label: "Özel", start: s, end: e });
  };

  const shiftDate = (target: "start" | "end", delta: number) => {
    if (target === "start") {
      const n = new Date(startDate);
      n.setDate(n.getDate() + delta);
      setStartDate(startOfDay(n));
      return;
    }
    const n = new Date(endDate);
    n.setDate(n.getDate() + delta);
    setEndDate(endOfDay(n));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xs }, shadows.lg]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[type.headline, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
              Tarih aralığı
            </Text>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={[styles.closeBtn, { backgroundColor: colors.surfaceMuted }]}
            >
              <CloseIcon size={18} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <Text accessibilityRole="header" style={[type.caption, styles.section, { color: colors.textTertiary }]}>
              Hızlı seçimler
            </Text>
            <View style={styles.presetGrid}>
              {presets.map((p) => (
                <Chip key={p.key} testID={`preset-${p.key}`} label={p.label} selected={currentRange.key === p.key} onPress={() => onSelect(p)} />
              ))}
            </View>

            <Text accessibilityRole="header" style={[type.caption, styles.section, { color: colors.textTertiary, marginTop: spacing.lg }]}>
              Özel aralık
            </Text>
            <View style={styles.dateList}>
              {TARGETS.map((t) => {
                const date = t.key === "start" ? startDate : endDate;
                return (
                  <View key={t.key} style={[styles.dateRow, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                    <Text style={[type.callout, { color: colors.textSecondary, flex: 1, paddingLeft: spacing.sm }]} numberOfLines={1}>
                      {t.label}
                    </Text>
                    <PressableScale
                      onPress={() => shiftDate(t.key, -1)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.label} tarihini bir gün geri al`}
                      style={styles.arrowBtn}
                    >
                      <ArrowLeftIcon size={18} color={colors.textPrimary} />
                    </PressableScale>
                    <Text
                      style={[type.bodyStrong, tabular, styles.dateValue, { color: colors.textPrimary }]}
                      accessibilityLabel={`${t.label} tarihi ${formatDateInput(date)}`}
                      accessibilityLiveRegion="polite"
                    >
                      {formatDateInput(date)}
                    </Text>
                    <PressableScale
                      onPress={() => shiftDate(t.key, 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.label} tarihini bir gün ileri al`}
                      style={styles.arrowBtn}
                    >
                      <ArrowRightIcon size={18} color={colors.textPrimary} />
                    </PressableScale>
                  </View>
                );
              })}
            </View>
            {error ? (
              <Text accessibilityRole="alert" style={[type.footnote, styles.error, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
            <Button testID="apply-custom-range" label="Uygula" onPress={applyCustom} style={styles.apply} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingTop: spacing.sm },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: spacing.xs },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.xxs },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.xs },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: spacing.xs, rowGap: spacing.sm },
  dateList: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  dateRow: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xxs },
  dateValue: { minWidth: 92, textAlign: "center" },
  arrowBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  error: { paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  apply: { marginHorizontal: spacing.lg, marginTop: spacing.md },
});
