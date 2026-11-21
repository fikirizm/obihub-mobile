// Nakit akışı (P6.2): GET /reports/cashflow?view=week|month — 12 dönem; girişler (alacak, alınan çek, tekrarlayan, ileri tarihli) ve
// çıkışlar (borç, verilen çek, tekrarlayan, ileri tarihli). Vadesi geçmiş ayrı gösterilir, bakiyeye eklenmez; başlangıç bakiyesi etkin
// hesapların bugünkü bakiyesi. Mobilde dönem dönem kart: giriş, çıkış, net, bakiye; satıra dokununca kalemler açılır.
// Kurallar: src/finance-reports.ts (web CashflowReportPage).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { cashflowPath, cellItems, dateTr, flowGroups, flowLabel, flowLinkLabel, hasFlow, isNeg, money, pickCurrency, STARTING_NOTE, VIEWS } from "../../src/finance-reports";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, ChartIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { CurrencyChips, FigureHero, InfoNote } from "../../src/components/reports/ReportParts";
import { OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";

type Pick = { row: string; col: number | "overdue" | "later" } | null;

export default function CashflowReportScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [view, setView] = useState("week");
  const [currency, setCurrency] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<number | "overdue">(0);
  const [pick, setPick] = useState<Pick>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    try {
      const d = await request<any>(cashflowPath(view), { method: "GET" }, token);
      if (my !== seq.current) return;
      setData(d);
      setError("");
    } catch (e: any) {
      if (my !== seq.current) return;
      setError(Number(e?.status) === 403 ? "Raporları görme yetkiniz yok." : "Rapor şu anda okunamadı. Biraz sonra yeniden deneyin.");
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [token, view]);
  useEffect(() => {
    setData(null);
    setPeriod(0);
    setPick(null);
    load();
  }, [load]);

  const b = pickCurrency<any>(data?.currencies, currency);
  const code = b?.currency || "TRY";
  const m = (x: unknown) => money(x ?? "0.00", code);
  const periods: any[] = Array.isArray(data?.periods) ? data.periods : [];
  const col = period;
  const valueOf = (r: any) => (col === "overdue" ? r.overdue : r.values?.[col as number]) ?? "0.00";
  const items = cellItems(b, pick);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="report-cashflow">
      <StackHeader title="Nakit akışı" subtitle={data?.as_of ? `${dateTr(data.as_of)} itibarıyla` : "Beklenen giriş ve çıkışlar"} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
      >
        <View style={styles.block}>
          <OptionChips testIDPrefix="cashflow-view" options={VIEWS.map(([value, label]) => ({ value, label }))} value={view} onChange={setView} />
        </View>
        {error ? (
          <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Nakit akışı yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={load} />
        ) : !data ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : !b || !hasFlow(b) ? (
          <EmptyState icon={<ChartIcon size={30} color={colors.textTertiary} />} title="Beklenen hareket yok" description="Açık fatura, çek, tekrarlayan plan ya da kasa bakiyesi olduğunda burada görünür." />
        ) : (
          <>
            <View style={[styles.block, { gap: spacing.sm }]}>
              <CurrencyChips list={data.currencies || []} value={code} onChange={(c) => (setCurrency(c), setPick(null))} />
              <FigureHero
                testID="cashflow-totals"
                title={`Dönem sonu bakiye (${view === "month" ? "12 ay" : "12 hafta"})`}
                value={m(b.ending_balance)}
                hint={`Başlangıç ${m(b.starting_balance)}`}
                cells={[
                  { label: "Beklenen giriş", value: m(b.totals?.in) },
                  { label: "Beklenen çıkış", value: m(b.totals?.out) },
                  { label: "Vadesi geçmiş giriş", value: m(b.overdue?.in) },
                  { label: "Vadesi geçmiş çıkış", value: m(b.overdue?.out) },
                ]}
              />
              <InfoNote>{STARTING_NOTE}</InfoNote>
            </View>

            <SectionTitle title="Dönem" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
              {[...(Number(b.overdue?.in) || Number(b.overdue?.out) ? [{ key: "overdue", label: "Vadesi geçmiş" }] : []), ...periods.map((p, i) => ({ key: i, label: flowLabel(p, data.view) }))].map((p) => {
                const on = period === p.key;
                return (
                  <PressableScale
                    key={String(p.key)}
                    testID={`cashflow-period-${p.key}`}
                    onPress={() => (setPeriod(p.key as any), setPick(null))}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[styles.pchip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }]}
                  >
                    <Text style={[type.callout, { color: on ? colors.primary : colors.textSecondary, fontWeight: "600" }]}>{p.label}</Text>
                    {p.key !== "overdue" ? (
                      <Text style={[type.caption, tabular, { color: isNeg(b.balance?.[p.key as number]) ? colors.error : colors.textTertiary }]}>{m(b.balance?.[p.key as number])}</Text>
                    ) : null}
                  </PressableScale>
                );
              })}
            </ScrollView>
            {period === "overdue" ? (
              <View style={styles.block}>
                <InfoNote tone="warning">Vadesi geçmiş kalemler ayrı gösterilir ve bakiyeye eklenmez.</InfoNote>
              </View>
            ) : (
              <Text style={[type.caption, tabular, styles.block, { color: colors.textTertiary }]}>{`Net ${m(b.net?.[period as number])} · Dönem sonu bakiye ${m(b.balance?.[period as number])}`}</Text>
            )}

            {flowGroups(b).map((g) => (
              <React.Fragment key={g.title}>
                <SectionTitle title={g.title} />
                <Card style={styles.block}>
                  {g.rows.map((r: any, i: number) => {
                    const val = valueOf(r);
                    const open = pick?.row === r.key && pick?.col === col;
                    return (
                      <View key={r.key}>
                        <PressableScale
                          testID={`cashflow-row-${r.key}`}
                          onPress={() => setPick(open ? null : { row: r.key, col })}
                          style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                        >
                          <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>{r.label}</Text>
                          <Text style={[type.bodyStrong, tabular, { color: Number(val) ? colors.textPrimary : colors.textTertiary }]}>{m(val)}</Text>
                        </PressableScale>
                        {open ? (
                          <View style={[styles.items, { backgroundColor: colors.surfaceMuted }]}>
                            {items.length ? (
                              items.map((it: any) => (
                                <View key={it.id} style={styles.item}>
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[type.footnote, { color: colors.textPrimary }]} numberOfLines={1}>{it.party || it.label || it.number || flowLinkLabel(it)}</Text>
                                    <Text style={[type.caption, { color: colors.textTertiary }]}>{[flowLinkLabel(it), it.number, dateTr(it.date)].filter(Boolean).join(" · ")}</Text>
                                  </View>
                                  <Text style={[type.footnote, tabular, { color: colors.textPrimary }]}>{m(it.amount)}</Text>
                                </View>
                              ))
                            ) : (
                              <Text style={[type.caption, { color: colors.textTertiary }]}>Bu dönemde kalem yok.</Text>
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </Card>
              </React.Fragment>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  periods: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  pchip: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, minWidth: 96, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  items: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.xs },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36 },
});
