// B: kategori / etiket filtresi (web components/classification/ClassFilter.jsx). Alttan açılan sayfa: tek kategori, birden çok etiket,
// etiket kuralı (herhangi biri / hepsi / etiketsiz). "Uygula" ile listeye geçer; sunucu parametreleri src/classification.ts.
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EMPTY_FILTER, type ClassFilter, type ClassItem } from "../classification";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { ArrowRightIcon, TagIcon } from "./Icons";
import { PressableScale } from "./KPICard";

const MODES: [ClassFilter["tagMode"], string][] = [
  ["any", "Herhangi biri"],
  ["all", "Hepsi"],
  ["untagged", "Etiketsiz"],
];

export function ClassFilterSheet({
  open,
  value,
  categories,
  tags,
  onApply,
  onClose,
}: {
  open: boolean;
  value: ClassFilter;
  categories: ClassItem[];
  tags: ClassItem[];
  onApply: (f: ClassFilter) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ClassFilter>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const toggleTag = (id: string) =>
    setDraft((d) => ({ ...d, tagMode: d.tagMode === "untagged" ? "any" : d.tagMode, tagIds: d.tagIds.includes(id) ? d.tagIds.filter((x) => x !== id) : [...d.tagIds, id] }));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={styles.end} pointerEvents="box-none">
        <View testID="class-filter-sheet" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary }]}>
            Kategori ve etiket
          </Text>
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: spacing.md }}>
            {categories.length ? (
              <View style={styles.group}>
                <Text style={[type.caption, styles.groupTitle, { color: colors.textSecondary }]}>Kategori</Text>
                <View style={styles.wrap}>
                  <Chip testID="class-f-cat-any" label="Tümü" selected={!draft.categoryId} onPress={() => setDraft((d) => ({ ...d, categoryId: null }))} />
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      testID={`class-f-cat-${c.id}`}
                      label={c.name}
                      selected={draft.categoryId === c.id}
                      onPress={() => setDraft((d) => ({ ...d, categoryId: d.categoryId === c.id ? null : c.id }))}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.group}>
              <Text style={[type.caption, styles.groupTitle, { color: colors.textSecondary }]}>Etiket kuralı</Text>
              <View style={styles.wrap}>
                {MODES.map(([m, l]) => (
                  <Chip key={m} testID={`class-f-mode-${m}`} label={l} selected={draft.tagMode === m} onPress={() => setDraft((d) => ({ ...d, tagMode: m, tagIds: m === "untagged" ? [] : d.tagIds }))} />
                ))}
              </View>
            </View>
            {tags.length && draft.tagMode !== "untagged" ? (
              <View style={styles.group}>
                <Text style={[type.caption, styles.groupTitle, { color: colors.textSecondary }]}>Etiketler</Text>
                <View style={styles.wrap}>
                  {tags.map((t) => (
                    <Chip key={t.id} testID={`class-f-tag-${t.id}`} label={`#${t.name}`} selected={draft.tagIds.includes(t.id)} onPress={() => toggleTag(t.id)} />
                  ))}
                </View>
              </View>
            ) : null}
            {!categories.length && !tags.length ? <Text style={[type.footnote, { color: colors.textTertiary }]}>Henüz kategori ya da etiket tanımlanmamış.</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button testID="class-f-clear" variant="secondary" label="Temizle" onPress={() => setDraft(EMPTY_FILTER)} style={{ flex: 1 }} />
            <Button testID="class-f-apply" label="Uygula" onPress={() => (onApply(draft), onClose())} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  end: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.lg, gap: spacing.md },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginTop: -spacing.xs },
  group: { gap: 6 },
  groupTitle: { fontWeight: "700", letterSpacing: 0.3 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", gap: spacing.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginHorizontal: spacing.lg, marginTop: 2, marginBottom: spacing.xs },
  barBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, maxWidth: "75%" },
});

// Liste üstündeki tek satır: "Kategori / etiket: Tümü ›"; etkinken seçimin özeti ve "Temizle". Dokununca pencere açılır.
export function ClassFilterBar({ label, active, onOpen, onClear, testID }: { label: string; active: boolean; onOpen: () => void; onClear: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.bar}>
      <PressableScale testID={testID} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Kategori ve etiket filtresi: ${active ? label : "Tümü"}`} style={[styles.barBtn, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
        <TagIcon size={14} color={active ? colors.primary : colors.textSecondary} />
        <Text style={[type.caption, { color: active ? colors.primary : colors.textSecondary, fontWeight: "600", flexShrink: 1 }]} numberOfLines={1}>
          {active ? label : "Kategori / etiket: Tümü"}
        </Text>
        <ArrowRightIcon size={12} color={active ? colors.primary : colors.textTertiary} />
      </PressableScale>
      {active ? <Button variant="ghost" size="sm" label="Temizle" onPress={onClear} /> : null}
    </View>
  );
}
