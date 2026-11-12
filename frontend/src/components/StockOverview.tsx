// Dalga 2 / B2 — web "Stok" sayfasının mobil karşılığı (Ürünler ekranının başında, liste içi; gezinme değişmez).
// GET /stock/summary toplamları: Elde / Ayrılmış / Satılabilir. Altında açılır "Son stok hareketleri" (tüm ürünler).
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { getStockSummary, type StockTotals } from "../api-urun-stok";
import { haptic } from "../haptics";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { ArrowRightIcon, PackageIcon } from "./Icons";
import { Skeleton } from "./Skeleton";
import { StockMovements } from "./StockMovements";

const fmt = (n: number) => Number(n || 0).toLocaleString("tr-TR");

export function StockOverview({ refreshKey = 0 }: { refreshKey?: number }) {
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const [totals, setTotals] = useState<StockTotals | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");
  const [open, setOpen] = useState(false);
  const [moveKey, setMoveKey] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const t = await getStockSummary(token);
      setTotals(t);
      setState(t ? "ready" : "hidden");
    } catch {
      // Web gibi: özet alınamazsa alan gösterilmez.
      setState((s) => (s === "ready" ? "ready" : "hidden"));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useFocusEffect(
    useCallback(() => {
      load();
      setMoveKey((k) => k + 1);
    }, [load])
  );

  if (state === "hidden") return null;

  const cells: { key: string; label: string; value: number; tone?: string }[] = totals
    ? [
        { key: "onhand", label: "Elde", value: totals.onHand },
        { key: "reserved", label: "Ayrılmış", value: totals.reserved, tone: totals.reserved > 0 ? colors.amber : undefined },
        { key: "sellable", label: "Satılabilir", value: totals.sellable, tone: colors.primary },
      ]
    : [];

  return (
    <View style={styles.wrap} testID="stock-overview">
      <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        <View style={styles.head}>
          <View style={[styles.iconTile, { backgroundColor: colors.primarySoft }]}>
            <PackageIcon size={16} color={colors.primary} />
          </View>
          <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>Stok özeti</Text>
          {totals ? (
            <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${fmt(totals.products)} ürün`}</Text>
          ) : null}
        </View>
        <View style={styles.cells}>
          {state === "loading"
            ? [0, 1, 2].map((i) => (
                <View key={i} style={[styles.cell, { backgroundColor: colors.surfaceMuted }]}>
                  <Skeleton width={48} height={11} />
                  <Skeleton width={64} height={22} style={{ marginTop: 6 }} />
                </View>
              ))
            : cells.map((c) => (
                <View key={c.key} style={[styles.cell, { backgroundColor: colors.surfaceMuted }]} testID={`stock-total-${c.key}`}>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{c.label}</Text>
                  <Text
                    style={[styles.big, tabular, { color: c.tone || colors.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {fmt(c.value)}
                  </Text>
                </View>
              ))}
        </View>
        {totals && totals.reserved > 0 ? (
          <Text style={[type.caption, styles.hint, { color: colors.textTertiary }]}>
            Ayrılmış: stoğu düşülmüş, henüz kargoya verilmemiş siparişler.
          </Text>
        ) : null}
        <Pressable
          testID="stock-moves-toggle"
          onPress={() => {
            haptic.select();
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={[styles.toggle, { borderTopColor: colors.border }]}
        >
          <Text style={[type.callout, { color: colors.primary, fontWeight: "600", flex: 1 }]}>
            {open ? "Son hareketleri gizle" : "Son stok hareketleri"}
          </Text>
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <ArrowRightIcon size={16} color={colors.primary} />
          </View>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.moves}>
          <StockMovements
            token={token}
            productId=""
            title="Son stok hareketleri"
            pageSize={10}
            refreshKey={moveKey}
            onOpenProduct={(pid) => router.push({ pathname: "/products/[id]", params: { id: pid } })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  iconTile: { width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  cells: { flexDirection: "row", gap: spacing.xs, padding: spacing.md },
  cell: { flex: 1, minWidth: 0, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  big: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  hint: { paddingHorizontal: spacing.md, marginTop: -spacing.xs, paddingBottom: spacing.sm },
  toggle: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  moves: { marginTop: spacing.sm, marginHorizontal: -spacing.lg },
});
