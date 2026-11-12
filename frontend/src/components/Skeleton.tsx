import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme/tokens";

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

// Yükleme yer tutucusu: yumuşak bir nabız (opaklık döngüsü). "Hareketi azalt" açıksa sabit kalır.
export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { colors, mode } = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.75;
      return;
    }
    pulse.value = 1;
    pulse.value = withRepeat(withTiming(0.45, { duration: 950, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const base = mode === "dark" ? colors.surfaceElevated : colors.border;

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius, backgroundColor: base }, style, animated]}
    />
  );
}

// Kart kabuğu: gerçek satır kartlarıyla (RowCard / OrderRow) aynı ölçüler.
function CardShell({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors, shadows } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, style]}
    >
      {children}
    </View>
  );
}

// Sipariş satırı: solda kare logo, ortada iki satır, sağda tutar ve durum rozeti.
export function OrderCardSkeleton() {
  return (
    <CardShell>
      <Skeleton width={44} height={44} borderRadius={radius.md} />
      <View style={styles.lines}>
        <Skeleton width="58%" height={14} />
        <Skeleton width="82%" height={11} />
      </View>
      <View style={styles.trailing}>
        <Skeleton width={72} height={14} />
        <Skeleton width={56} height={20} borderRadius={10} />
      </View>
    </CardShell>
  );
}

// Panel: gradyan özet kartı, iki KPI kartı, bölüm başlığı ve liste.
export function DashboardSkeleton() {
  const { colors, shadows, mode } = useTheme();
  const heroBg = mode === "dark" ? colors.surface : colors.backgroundElevated;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.dashboard}
    >
      {/* Özet kartı */}
      <View style={[styles.hero, { backgroundColor: heroBg, borderColor: colors.borderSubtle }]}>
        <View style={styles.heroTop}>
          <Skeleton width={84} height={30} borderRadius={radius.pill} />
          <Skeleton width={132} height={30} borderRadius={radius.pill} />
        </View>
        <Skeleton width="62%" height={40} borderRadius={radius.md} />
        <Skeleton width="28%" height={13} style={{ marginTop: spacing.xs }} />
        <Skeleton height={64} borderRadius={radius.md} style={{ marginTop: spacing.md }} />
        <View style={[styles.heroFoot, { borderTopColor: colors.border }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.heroCell}>
              <Skeleton width={48} height={11} />
              <Skeleton width={64} height={15} />
            </View>
          ))}
        </View>
      </View>

      {/* İki KPI kartı */}
      <View style={styles.kpiRow}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={[styles.kpi, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          >
            <Skeleton width={40} height={40} borderRadius={12} />
            <Skeleton width="38%" height={30} style={{ marginTop: spacing.sm }} />
            <Skeleton width="60%" height={14} style={{ marginTop: spacing.xs }} />
            <Skeleton width="85%" height={11} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Liste */}
      <Skeleton width="40%" height={14} style={{ marginTop: spacing.xs }} />
      {[0, 1, 2].map((i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </View>
  );
}

// Fatura satırı: solda simge kutusu, ortada üç satır, sağda tutar ve durum rozeti.
export function InvoiceCardSkeleton() {
  return (
    <CardShell>
      <Skeleton width={44} height={44} borderRadius={radius.md} />
      <View style={styles.lines}>
        <Skeleton width="48%" height={14} />
        <Skeleton width="72%" height={11} />
        <Skeleton width="56%" height={10} />
      </View>
      <View style={styles.trailing}>
        <Skeleton width={78} height={14} />
        <Skeleton width={56} height={20} borderRadius={10} />
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 64,
  },
  lines: { flex: 1, minWidth: 0, gap: spacing.xs },
  trailing: { alignItems: "flex-end", gap: spacing.xs },
  dashboard: { paddingHorizontal: spacing.lg, gap: spacing.md },
  hero: { borderRadius: radius.xxl, borderWidth: 1, padding: spacing.lg },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  heroFoot: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  heroCell: { flex: 1, alignItems: "center", gap: 6 },
  kpiRow: { flexDirection: "row", gap: spacing.sm },
  kpi: { flex: 1, borderRadius: radius.xl, borderWidth: 1, padding: spacing.md },
  rowSk: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, minHeight: 64 },
});

// Cila turu: form ve detay ekranları için ortak yer tutucular (dönen gösterge yerine içeriğin biçimi).
// Form: özet kartı + etiketli alanlar + birincil düğme.
export function FormSkeleton({ fields = 4, label = "Yükleniyor" }: { fields?: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle }}>
        <Skeleton width="45%" height={12} />
        <Skeleton width="65%" height={28} />
      </View>
      {Array.from({ length: fields }).map((_, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Skeleton width={i % 2 ? "28%" : "36%"} height={11} />
          <Skeleton height={48} borderRadius={radius.md} />
        </View>
      ))}
      <Skeleton height={50} borderRadius={radius.md} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// Satır listesi (kart içinde): yuvarlak simge + iki satır + sağda değer.
export function RowsSkeleton({ rows = 5, label = "Yükleniyor" }: { rows?: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ marginHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.rowSk, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Skeleton width={36} height={36} borderRadius={10} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={i % 2 ? "52%" : "64%"} height={13} />
            <Skeleton width={i % 2 ? "34%" : "40%"} height={10} />
          </View>
          <Skeleton width={64} height={13} />
        </View>
      ))}
    </View>
  );
}

// Mesajlaşma (destek talebi): karşılıklı balonlar.
export function ThreadSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Mesajlar yükleniyor" style={{ padding: spacing.lg, gap: spacing.md }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ alignItems: i % 2 ? "flex-end" : "flex-start" }}>
          <Skeleton width={i % 2 ? "62%" : "74%"} height={i % 2 ? 44 : 64} borderRadius={radius.lg} />
        </View>
      ))}
    </View>
  );
}
