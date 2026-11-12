// B5 — ürün detayında satış özeti (web ProductDetailPage satış raporu sekmesi): dönem seçimi, ciro / adet / sipariş ve kanal kırılımı.
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getProductInsights, type ProductInsights } from "../api-urun-stok";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { formatTry } from "../utils";
import { Chip, ChipRow } from "../ui/Chip";
import { Card, SectionTitle } from "../ui/ListRow";
import { PlatformLogo } from "./PlatformLogo";
import { Skeleton } from "./Skeleton";

const RANGES = [
  { key: "week" as const, label: "Son 7 gün" },
  { key: "month" as const, label: "Son 30 gün" },
  { key: "year" as const, label: "Son 1 yıl" },
];

export function ProductInsightsCard({ token, productId, refreshKey = 0 }: { token: string; productId: string; refreshKey?: number }) {
  const { colors } = useTheme();
  const [range, setRange] = useState<"week" | "month" | "year">("month");
  const [data, setData] = useState<ProductInsights | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    getProductInsights(token, productId, range)
      .then((d) => {
        if (!live) return;
        setData(d);
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [token, productId, range, refreshKey]);

  // Uç yoksa (eski sunucu / yetki) bölüm sessizce gizlenir.
  if (state === "error" && !data) return null;

  const cells = data
    ? [
        { k: "Ciro", v: formatTry(data.revenue) },
        { k: "Adet", v: data.quantity.toLocaleString("tr-TR") },
        { k: "Sipariş", v: data.orders.toLocaleString("tr-TR") },
      ]
    : [];

  return (
    <View testID="product-insights">
      <SectionTitle title="Satış" />
      <ChipRow>
        {RANGES.map((r) => (
          <Chip key={r.key} testID={`insights-${r.key}`} label={r.label} selected={range === r.key} onPress={() => setRange(r.key)} />
        ))}
      </ChipRow>
      <Card style={styles.card}>
        <View style={styles.cells}>
          {state === "loading" && !data
            ? [0, 1, 2].map((i) => (
                <View key={i} style={[styles.cell, { backgroundColor: colors.surfaceMuted }]}>
                  <Skeleton width={40} height={11} />
                  <Skeleton width={60} height={20} style={{ marginTop: 6 }} />
                </View>
              ))
            : cells.map((c) => (
                <View key={c.k} style={[styles.cell, { backgroundColor: colors.surfaceMuted, opacity: state === "loading" ? 0.5 : 1 }]}>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{c.k}</Text>
                  <Text style={[styles.big, tabular, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {c.v}
                  </Text>
                </View>
              ))}
        </View>
        {data && data.byProvider.length ? (
          data.byProvider.map((p, i) => (
            <View key={`${p.provider}-${i}`} style={[styles.row, { borderTopColor: colors.border }]}>
              <PlatformLogo provider={p.provider} size="xs" />
              <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                {p.label}
              </Text>
              <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${p.quantity} adet`}</Text>
              <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "700", minWidth: 80, textAlign: "right" }]}>{formatTry(p.revenue)}</Text>
            </View>
          ))
        ) : data && state === "ready" ? (
          <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md, paddingTop: 0 }]}>Bu dönemde satış yok.</Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, overflow: "hidden" },
  cells: { flexDirection: "row", gap: spacing.xs, padding: spacing.md },
  cell: { flex: 1, minWidth: 0, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.md },
  big: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
