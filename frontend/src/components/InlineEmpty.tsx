// Kart içi boş durum (cila turu): yumuşak halkalı simge, kısa başlık, yönlendirici açıklama ve isteğe bağlı eylem.
// Tam ekran EmptyState'in kart içindeki küçük kardeşi; eski ekranlardaki düz "… yok." metinlerinin yerine.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";

export function InlineEmpty({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID={testID} accessible accessibilityLabel={[title, description].filter(Boolean).join(". ")}>
      <View style={[styles.halo, { borderColor: colors.primarySoft }]}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>{icon}</View>
      </View>
      <Text style={[type.bodyStrong, { color: colors.textPrimary, textAlign: "center" }]}>{title}</Text>
      {description ? <Text style={[type.footnote, { color: colors.textSecondary, textAlign: "center" }]}>{description}</Text> : null}
      {actionLabel && onAction ? <Button size="sm" variant="secondary" label={actionLabel} onPress={onAction} style={{ marginTop: spacing.xs }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 6, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  halo: { borderWidth: 6, borderRadius: 40, marginBottom: spacing.xs },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
