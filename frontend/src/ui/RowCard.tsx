import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { PressableScale } from "../components/KPICard";

// Listelerde tek kayıt kartı: solda başlık ve alt bilgi, sağda tutar ve durum.
export function RowCard({
  title,
  subtitle,
  meta,
  amount,
  amountColor,
  badge,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  amount?: string;
  amountColor?: string;
  badge?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, shadows } = useTheme();
  const body = (
    <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {amount ? <Text style={[type.bodyStrong, tabular, { color: amountColor || colors.textPrimary }]}>{amount}</Text> : null}
        {badge}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={[title, subtitle, amount].filter(Boolean).join(", ")}>
      {body}
    </PressableScale>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: "error" | "success" }) {
  const { colors, shadows } = useTheme();
  const color = tone === "error" ? colors.error : tone === "success" ? colors.success : colors.textPrimary;
  return (
    <View style={[styles.stat, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.headline, tabular, { color, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, minHeight: 64 },
  stat: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
});
