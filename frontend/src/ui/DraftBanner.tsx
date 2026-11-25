// KABUK-2: "Kaydedilmemiş bir taslağınız var · <zaman> · Devam et · At" şeridi (web formDraft taslak bandı).
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatDraftTime } from "../form-draft";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { ClockIcon } from "../components/Icons";
import { Button } from "./Button";

export function DraftBanner({ at, onRestore, onDiscard, style }: { at: number; onRestore: () => void; onDiscard: () => void; style?: any }) {
  const { colors } = useTheme();
  return (
    <View testID="draft-banner" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.infoBg, borderColor: colors.borderSubtle }, style]}>
      <View style={styles.head}>
        <ClockIcon size={18} color={colors.info} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Kaydedilmemiş bir taslağınız var</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>{`Son düzenleme ${formatDraftTime(at)}`}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button testID="draft-restore" size="sm" label="Devam et" onPress={onRestore} style={{ flex: 1 }} />
        <Button testID="draft-discard" size="sm" variant="secondary" label="At" onPress={onDiscard} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Formlarda kartlar kenar boşluğunu kendisi verir (HeroCard marginHorizontal lg); şerit de aynı hizada.
  box: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
});
