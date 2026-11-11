import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { ArrowRightIcon } from "../components/Icons";
import { PressableScale } from "../components/KPICard";

// Kart: ilişkili satırları tek yüzeyde toplar.
export function Card({ children, style, padded }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
        padded && { padding: spacing.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Text accessibilityRole="header" style={[type.headline, { color: colors.textPrimary, flex: 1 }]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  chevron,
  onPress,
  divider,
  destructive,
  testID,
  accessibilityLabel,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
  destructive?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.bodyStrong, { color: destructive ? colors.error : colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <ArrowRightIcon size={16} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || [title, subtitle].filter(Boolean).join(", ")}
    >
      {content}
    </PressableScale>
  );
}

// Menü ve ayar satırlarındaki yuvarlak köşeli simge kutusu.
export function IconTile({ children, tint }: { children: React.ReactNode; tint?: string }) {
  const { colors } = useTheme();
  return <View style={[styles.tile, { backgroundColor: tint || colors.primarySoft }]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  leading: { alignItems: "center", justifyContent: "center" },
  trailing: { alignItems: "flex-end", justifyContent: "center", gap: 4 },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
