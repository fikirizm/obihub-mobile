// Kasa/Banka raporu (P6.2): GET /reports/cash-bank?date_from&date_to — hesap başına açılış / giriş / çıkış / net / kapanış; transfer
// ayrı gösterilir (giriş-çıkışa katılmaz). Para birimi blokları toplanmaz. Kurallar: src/finance-reports.ts (web CashBankReportPage).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { cashBankPath, cashBankView, isNeg, money, presetRange } from "../../src/finance-reports";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, WalletIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { CurrencyChips, FigureHero, RangeBar } from "../../src/components/reports/ReportParts";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";

const CASH_PRESETS: [string, string][] = [["month", "Bu ay"], ["prev", "Geçen ay"], ["year", "Bu yıl"]];

export default function CashBankReportScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [range, setRange] = useState(() => presetRange("month"));
  const [currency, setCurrency] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    try {
      const d = await request<any>(cashBankPath(range.from, range.to), { method: "GET" }, token);
      if (my !== seq.current) return;
      setData(d);
      setError("");
    } catch (e: any) {
      if (my !== seq.current) return;
      setError(Number(e?.status) === 403 ? "Raporları görme yetkiniz yok." : "Rapor şu anda okunamadı. Biraz sonra yeniden deneyin.");
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [token, range]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const v = data ? cashBankView(data, currency) : null;
  const t = v?.totals || {};
  const m = (x: unknown) => money(x ?? "0.00", v?.code || "TRY");
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="report-cash-bank">
      <StackHeader title="Kasa/Banka raporu" subtitle="Hesap başına giriş, çıkış ve bakiye" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
      >
        <View style={styles.block}>
          <RangeBar from={range.from} to={range.to} onChange={setRange} presets={CASH_PRESETS} />
        </View>
        {error ? (
          <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Kasa/Banka raporu yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={load} />
        ) : !v ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : !v.accounts.length ? (
          <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Hesap yok" description="Kasa ya da banka hesabı eklediğinizde burada görünür." />
        ) : (
          <>
            <View style={[styles.block, { gap: spacing.sm }]}>
              <CurrencyChips list={data.currencies || []} value={v.code} onChange={setCurrency} />
              <FigureHero
                testID="cash-bank-totals"
                title="Kapanış bakiyesi"
                value={m(t.closing)}
                hint={`Açılış ${m(t.opening)} · ${Number(t.account_count) || v.accounts.length} hesap`}
                cells={[
                  { label: "Giriş", value: m(t.in) },
                  { label: "Çıkış", value: m(t.out) },
                  { label: "Net", value: m(t.net) },
                  { label: "Transfer (giren / çıkan)", value: `${m(t.transfer_in)} / ${m(t.transfer_out)}` },
                ]}
              />
            </View>
            <SectionTitle title="Hesaplar" />
            {v.accounts.map((a: any) => (
              <Card key={a.id} style={styles.block}>
                <View style={styles.acc} testID={`cash-bank-${a.id}`}>
                  <View style={styles.top}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[type.caption, { color: colors.textTertiary }]}>{a.typeLabel}</Text>
                    </View>
                    {a.badge ? <StatusBadge label={a.badge} kind="neutral" size="sm" /> : null}
                  </View>
                  <View style={styles.grid}>
                    {[
                      ["Açılış", a.opening],
                      ["Giriş", a.in],
                      ["Çıkış", a.out],
                      ["Kapanış", a.closing],
                    ].map(([label, val]) => (
                      <View key={label} style={styles.cell}>
                        <Text style={[type.caption, { color: colors.textTertiary }]}>{label}</Text>
                        <Text style={[type.callout, tabular, { color: isNeg(val) ? colors.error : colors.textPrimary, fontWeight: label === "Kapanış" ? "700" : "500" }]}>{m(val)}</Text>
                      </View>
                    ))}
                  </View>
                  {a.hasTransfer ? (
                    <Text style={[type.caption, tabular, { color: colors.textSecondary }]}>{`Transfer: giren ${m(a.transfer_in)} · çıkan ${m(a.transfer_out)}`}</Text>
                  ) : null}
                  {Number(a.before_opening_count) > 0 ? (
                    <Text style={[type.caption, { color: colors.textTertiary }]}>{`${a.before_opening_count} hareket açılış tarihinden önce; bakiyeye katılmadı.`}</Text>
                  ) : null}
                </View>
              </Card>
            ))}
            <Text style={[type.caption, styles.block, { color: colors.textTertiary, marginTop: spacing.sm }]}>
              Hesaplar arası transferler giriş ve çıkışa katılmaz; ayrı gösterilir. Para birimleri toplanmaz.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  acc: { padding: spacing.md, gap: spacing.xs },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs },
  cell: { width: "50%" },
});
