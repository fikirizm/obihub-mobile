import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PressableScale } from "./KPICard";
import { FadeInDown, SafeAnimatedView } from "./SafeAnimatedView";
import { radius, spacing, type } from "../theme/tokens";

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

// Boş liste ve "kayıt yok" durumları: yumuşak renkli simge, tek net cümle, isteğe bağlı eylem.
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors, shadows } = useTheme();
  return (
    <SafeAnimatedView entering={FadeInDown.duration(380)} style={styles.wrap}>
      <View style={[styles.halo, { borderColor: colors.primarySoft }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>{icon}</View>
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {title}
      </Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>{description}</Text>
      {actionLabel && onAction ? (
        // Gölge dış sarmalayıcıda; düğmenin kendisi kırpma yapmaz.
        <View style={[styles.actionShadow, shadows.primary]}>
          <PressableScale
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {actionLabel}
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </SafeAnimatedView>
  );
}

const ICON = 80;
const HALO = ICON + 20;

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xxl },
  halo: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.headline, marginBottom: spacing.xs, textAlign: "center" },
  desc: { ...type.callout, textAlign: "center", maxWidth: 300 },
  actionShadow: { marginTop: spacing.lg, borderRadius: radius.md, maxWidth: "100%" },
  actionBtn: {
    height: 48,
    minWidth: 180,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  // colors.primary zemin üzerinde beyaz metin (tasarım sistemi istisnası).
  actionText: { ...type.bodyStrong, color: "#FFFFFF" },
});
