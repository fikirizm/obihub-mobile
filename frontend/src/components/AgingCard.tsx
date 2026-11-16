// Dalga 2 (P2.2): "Alacak özeti" — GET /reports/aging. Vade kovaları (vadesi gelmemiş, 1-30, 31-60, 61-90, 90+ gün), para birimi
// başına ayrı blok (asla tek sayı), en büyük 3 cari. Rapor izni yoksa (403) ya da açık kalem yoksa kart görünmez.
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { request } from "../api";
import { agingView } from "../followup";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { formatMoney } from "../utils";
import { SegmentedControl } from "../ui/Chip";
import { Card, SectionTitle } from "../ui/ListRow";

const TONE = ["success", "warning", "warning", "error", "error"] as const;

export function AgingCard({ token, refreshKey }: { token: string | null; refreshKey?: number }) {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);
  const [side, setSide] = useState<"receivable" | "payable">("receivable");
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await request<any>("/reports/aging", { method: "GET" }, token));
    } catch {
      setData(null);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!data) return null;
  const v = agingView(data, side);
  const other = agingView(data, side === "receivable" ? "payable" : "receivable");
  if (!v.blocks.length && !other.blocks.length) return null;
  const toneColor = (i: number) => ({ success: colors.success, warning: colors.amber, error: colors.error })[TONE[i]];

  return (
    <View testID="aging-card">
      <SectionTitle title={side === "receivable" ? "Alacak özeti" : "Borç özeti"} />
      <View style={styles.block}>
        <SegmentedControl
          options={[
            { value: "receivable", label: "Alacak" },
            { value: "payable", label: "Borç" },
          ]}
          value={side}
          onChange={setSide}
        />
      </View>
      {v.warning ? <Text style={[type.caption, styles.note, { color: colors.amber }]}>{v.warning}</Text> : null}
      {!v.blocks.length ? (
        <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>{side === "receivable" ? "Açık alacak yok." : "Açık borç yok."}</Text>
      ) : (
        v.blocks.map((b) => (
          <Card key={b.currency} padded style={[styles.block, { marginTop: spacing.sm, gap: spacing.sm }]}>
            <View style={styles.head}>
              <Text style={[type.title, tabular, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(b.total, b.currency)}
              </Text>
              {b.overdue > 0.004 ? (
                <Text testID={`aging-overdue-${b.currency}`} style={[type.footnote, tabular, { color: colors.error }]}>{`Gecikmiş ${formatMoney(b.overdue, b.currency)}`}</Text>
              ) : (
                <Text style={[type.footnote, { color: colors.success }]}>Gecikmiş yok</Text>
              )}
            </View>
            <View style={[styles.bar, { backgroundColor: colors.border }]}>
              {b.buckets.map((k, i) =>
                k.amount > 0 ? <View key={k.key} style={{ flex: k.amount, backgroundColor: toneColor(i) }} /> : null
              )}
            </View>
            {b.buckets.map((k, i) => (
              <View key={k.key} style={styles.line}>
                <View style={[styles.dot, { backgroundColor: toneColor(i) }]} />
                <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>{k.label}</Text>
                <Text style={[type.callout, tabular, { color: k.amount > 0 ? colors.textPrimary : colors.textTertiary }]}>{formatMoney(k.amount, b.currency)}</Text>
              </View>
            ))}
            {b.top.length ? (
              <View style={{ gap: 2, marginTop: spacing.xs }}>
                <Text style={[type.caption, { color: colors.textTertiary }]}>{side === "receivable" ? "En çok alacaklı olduğunuz" : "En çok borçlu olduğunuz"}</Text>
                {b.top.map((p) => (
                  <View key={p.name} style={styles.line}>
                    <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{`${p.name} · ${p.count} belge`}</Text>
                    <Text style={[type.footnote, tabular, { color: colors.textPrimary }]}>{formatMoney(p.total, b.currency)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  bar: { flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
