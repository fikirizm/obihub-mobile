import React, { useEffect, useMemo, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing } from "../../theme/tokens";
import { PressableScale } from "../KPICard";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "../Icons";
import { endOfDay, formatDateInput, presetRanges, startOfDay, type RangeT } from "./reportUtils";

type Props = {
  visible: boolean;
  onClose: () => void;
  currentRange: RangeT;
  onSelect: (r: RangeT) => void;
};

export function DateRangeModal({ visible, onClose, currentRange, onSelect }: Props) {
  const { colors, shadows } = useTheme();
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <PressableScale onPress={onClose} style={StyleSheet.absoluteFill as object}>
          <View style={{ flex: 1 }} />
        </PressableScale>
        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadows.lg]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Tarih Aralığı</Text>
            <PressableScale onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceMuted }]}>
              <CloseIcon size={16} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <Text style={[styles.section, { color: colors.textTertiary }]}>HIZLI SEÇİMLER</Text>
            <View style={styles.presetGrid}>
              {presets.map((p) => {
                const active = currentRange.key === p.key;
                return (
                  <PressableScale
                    key={p.key}
                    testID={`preset-${p.key}`}
                    onPress={() => onSelect(p)}
                    style={[
                      styles.presetCell,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceMuted,
                        borderColor: active ? colors.primary : colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text style={[styles.presetText, { color: active ? "#FFFFFF" : colors.textPrimary }]}>
                      {p.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <Text style={[styles.section, { color: colors.textTertiary, marginTop: spacing.md }]}>ÖZEL ARALIK</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
              {(["start", "end"] as const).map((target) => {
                const date = target === "start" ? startDate : endDate;
                return (
                  <View key={target} style={{ flex: 1 }}>
                    <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
                      {target === "start" ? "BAŞLANGIÇ" : "BİTİŞ"}
                    </Text>
                    <View style={[styles.dateInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                      <PressableScale onPress={() => shiftDate(target, -1)} style={styles.arrowBtn}>
                        <ArrowLeftIcon size={14} color={colors.textSecondary} />
                      </PressableScale>
                      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
                        {formatDateInput(date)}
                      </Text>
                      <PressableScale onPress={() => shiftDate(target, 1)} style={styles.arrowBtn}>
                        <ArrowRightIcon size={14} color={colors.textSecondary} />
                      </PressableScale>
                    </View>
                  </View>
                );
              })}
            </View>
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
              <PressableScale
                testID="apply-custom-range"
                onPress={applyCustom}
                style={[styles.applyBtn, { backgroundColor: colors.primary }, shadows.primary]}
              >
                <Text style={styles.applyBtnText}>Uygula</Text>
              </PressableScale>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,17,32,0.55)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 32 : 16 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.4, flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: 8 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: 8 },
  presetCell: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  presetText: { fontSize: 13, fontWeight: "700", letterSpacing: -0.1 },
  dateLabel: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 },
  dateInput: { height: 46, borderRadius: 12, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  arrowBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 12, fontWeight: "600", paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  applyBtn: { height: 50, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  applyBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
});
