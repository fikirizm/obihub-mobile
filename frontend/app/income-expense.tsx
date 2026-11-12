// F1 — Gelir-gider özeti. Veri sunucunun ortak defterinden tek uçla gelir (GET /finance/income-expense-summary);
// istemci yeniden hesaplamaz, para birimlerini toplamaz. Dönem ön ayarları + özel aralık; tahakkuk / nakit esası.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { canAccess } from "../src/auth/permissions";
import { excludedText, getIncomeExpenseSummary, num, sourceLabel, type CurrencySummary, type IncomeExpenseSummary, type SummaryBasis } from "../src/api-rapor";
import { EmptyState } from "../src/components/EmptyState";
import { InlineEmpty } from "../src/components/InlineEmpty";
import { AlertIcon, ChartIcon, DownloadIcon, TrendUpIcon } from "../src/components/Icons";
import { FadeInDown, SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { Skeleton } from "../src/components/Skeleton";
import { DateRangeModal } from "../src/components/reports/DateRangeModal";
import { localDateKey, presetRanges, rangeLabel, type RangeT } from "../src/components/reports/reportUtils";
import { haptic } from "../src/haptics";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../src/theme/tokens";
import { Chip, ChipRow } from "../src/ui/Chip";
import { StackHeader } from "../src/ui/Header";
import { HeroCard, ON_HERO } from "../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../src/ui/ListRow";
import { formatDate, formatMoney } from "../src/utils";

const PRESET_KEYS = ["thisMonth", "lastMonth", "ytd"] as const;
const BASES: { key: SummaryBasis; label: string; hint: string }[] = [
  { key: "accrual", label: "Tahakkuk", hint: "Kesilen faturalar ve kayıtlar, belge tarihine göre" },
  { key: "cash", label: "Nakit", hint: "Kasa ve bankaya giren / çıkan para" },
];

export default function IncomeExpenseScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  // Web authz: finans okuma fatura izni ya da rapor izniyle açılır.
  if (!canAccess(user, "billing") && !canAccess(user, "reports")) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Gelir-gider" />
        <EmptyState icon={<ChartIcon size={30} color={colors.textTertiary} />} title="Bu rapora yetkiniz yok" description="Gelir-gider özeti fatura ya da rapor izni olan kullanıcılara açıktır." />
      </View>
    );
  }
  return <IncomeExpenseContent />;
}

function IncomeExpenseContent() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeT>(() => presetRanges().find((p) => p.key === "thisMonth")!);
  const [basis, setBasis] = useState<SummaryBasis>("accrual");
  const [data, setData] = useState<IncomeExpenseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await getIncomeExpenseSummary(token, { from: localDateKey(range.start), to: localDateKey(range.end), basis });
      if (my !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e: any) {
      if (my !== seq.current) return;
      setData(null);
      setError(e?.message || "Gelir-gider özeti yüklenemedi.");
    } finally {
      if (my === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, range, basis]);

  useEffect(() => {
    load();
  }, [load]);

  const presets = presetRanges().filter((p) => (PRESET_KEYS as readonly string[]).includes(p.key));
  const isCustom = !presets.some((p) => p.key === range.key);
  const basisHint = BASES.find((b) => b.key === basis)?.hint;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="income-expense-screen">
      <StackHeader title="Gelir-gider" subtitle={rangeLabel(range)} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <ChipRow>
          {presets.map((p) => (
            <Chip key={p.key} testID={`ie-period-${p.key}`} label={p.label} selected={range.key === p.key} onPress={() => setRange(p)} />
          ))}
          <Chip testID="ie-period-custom" label={isCustom ? rangeLabel(range) : "Özel"} selected={isCustom} onPress={() => setPickerOpen(true)} />
        </ChipRow>
        <View style={[styles.segment, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} accessibilityRole="tablist">
          {BASES.map((b) => {
            const on = basis === b.key;
            return (
              <Text
                key={b.key}
                testID={`ie-basis-${b.key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (!on) haptic.select();
                  setBasis(b.key);
                }}
                style={[
                  type.callout,
                  styles.segmentItem,
                  { color: on ? colors.textPrimary : colors.textSecondary, fontWeight: on ? "700" : "500", backgroundColor: on ? colors.surface : "transparent" },
                ]}
              >
                {b.label}
              </Text>
            );
          })}
        </View>
        {basisHint ? <Text style={[type.caption, styles.hint, { color: colors.textTertiary }]}>{basisHint}</Text> : null}

        {loading && !data ? (
          <View style={{ gap: spacing.sm, marginHorizontal: spacing.lg }} accessible accessibilityRole="progressbar" accessibilityLabel="Gelir-gider özeti yükleniyor">
            <Skeleton height={176} borderRadius={28} />
            <Skeleton width="40%" height={14} style={{ marginTop: spacing.sm }} />
            <Skeleton height={150} borderRadius={radius.lg} />
          </View>
        ) : error ? (
          <Card style={styles.block}>
            <InlineEmpty
              testID="ie-error"
              icon={<AlertIcon size={22} color={colors.error} />}
              title="Özet yüklenemedi"
              description={error}
              actionLabel="Tekrar dene"
              onAction={load}
            />
          </Card>
        ) : data && data.currencies.length === 0 ? (
          <Card style={styles.block}>
            <InlineEmpty
              testID="ie-empty"
              icon={<ChartIcon size={22} color={colors.textTertiary} />}
              title="Bu dönemde hareket yok"
              description={basis === "cash" ? "Seçili dönemde kasa ya da bankaya para girişi veya çıkışı yok." : "Seçili dönemde kesilmiş fatura, gelir ya da gider kaydı yok."}
            />
          </Card>
        ) : data ? (
          <View style={{ opacity: loading ? 0.6 : 1 }}>
            {data.currencies.map((c, i) => (
              <CurrencyBlock key={c.currency} c={c} basis={data.basis} index={i} />
            ))}
            <ScopeNotes data={data} />
          </View>
        ) : null}
      </ScrollView>
      <DateRangeModal visible={pickerOpen} onClose={() => setPickerOpen(false)} currentRange={range} onSelect={(r) => { setRange(r); setPickerOpen(false); }} />
    </View>
  );
}

function CurrencyBlock({ c, basis, index }: { c: CurrencySummary; basis: SummaryBasis; index: number }) {
  const { colors } = useTheme();
  const income = num(c.income.net);
  const expense = num(c.expense.net);
  const result = num(c.result);
  const total = Math.abs(income) + Math.abs(expense);
  const incomeShare = total > 0 ? Math.abs(income) / total : 0.5;
  const sources = (side: "income" | "expense") =>
    Object.entries(c[side].sources || {})
      .filter(([, s]) => num(s.net) !== 0 || s.count > 0)
      .sort((a, b) => Math.abs(num(b[1].net)) - Math.abs(num(a[1].net)));
  const expenseCats = c.categories.filter((k) => k.kind === "expense" && num(k.net) !== 0).slice(0, 8);
  const vatUnknown = num(c.expense.vat_unknown);

  return (
    <SafeAnimatedView entering={FadeInDown.delay(60 * index).duration(380)}>
      <HeroCard tone={result >= 0 ? "emerald" : "violet"} style={{ marginTop: spacing.xs }}>
        <Text style={{ color: ON_HERO.soft, fontSize: 13, fontWeight: "600" }}>
          {`${basis === "cash" ? "Nakit sonuç" : "Dönem sonucu"}${c.currency !== "TRY" ? ` · ${c.currency}` : ""}`}
        </Text>
        <Text
          testID={`ie-result-${c.currency}`}
          style={[tabular, styles.heroValue, { color: result >= 0 ? ON_HERO.live : ON_HERO.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {`${result > 0 ? "+" : result < 0 ? "−" : ""}${formatMoney(Math.abs(result), c.currency)}`}
        </Text>
        <Text style={{ color: ON_HERO.soft, fontSize: 12, marginTop: 2 }}>{basis === "cash" ? "Giren − çıkan" : "Gelir − gider (KDV hariç)"}</Text>
        <View style={[styles.bar, { backgroundColor: ON_HERO.faint }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={{ flex: incomeShare, backgroundColor: ON_HERO.live, borderRadius: 4 }} />
          <View style={{ flex: 1 - incomeShare, backgroundColor: "#F87171", borderRadius: 4 }} />
        </View>
        <View style={styles.heroFoot}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{basis === "cash" ? "Giren" : "Gelir"}</Text>
            <Text testID={`ie-income-${c.currency}`} style={[tabular, styles.heroSub, { color: ON_HERO.live }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(income, c.currency)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{basis === "cash" ? "Çıkan" : "Gider"}</Text>
            <Text testID={`ie-expense-${c.currency}`} style={[tabular, styles.heroSub, { color: ON_HERO.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(expense, c.currency)}
            </Text>
          </View>
        </View>
        {basis === "accrual" ? (
          <Text style={{ color: ON_HERO.soft, fontSize: 12, marginTop: spacing.sm }}>
            {`KDV dahil: gelir ${formatMoney(num(c.income.gross), c.currency)} · gider ${formatMoney(num(c.expense.gross), c.currency)}`}
          </Text>
        ) : null}
      </HeroCard>

      {(["income", "expense"] as const).map((side) => {
        const rows = sources(side);
        if (!rows.length) return null;
        return (
          <View key={side}>
            <SectionTitle title={`${side === "income" ? (basis === "cash" ? "Girişler" : "Gelir") : basis === "cash" ? "Çıkışlar" : "Gider"}${c.currency !== "TRY" ? ` · ${c.currency}` : ""}`} />
            <Card style={styles.block}>
              {rows.map(([key, s], i) => (
                <ListRow
                  key={key}
                  testID={`ie-src-${c.currency}-${side}-${key}`}
                  divider={i > 0}
                  leading={
                    <IconTile tint={side === "income" ? colors.successBg : colors.errorBg}>
                      {side === "income" ? <TrendUpIcon size={18} color={colors.success} /> : <DownloadIcon size={18} color={colors.error} />}
                    </IconTile>
                  }
                  title={sourceLabel(key, side, basis)}
                  subtitle={[`${s.count} kayıt`, s.origin === "parasut" ? "Paraşüt" : null, basis === "accrual" && num(s.vat) !== 0 ? `KDV ${formatMoney(num(s.vat), c.currency)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    <Text style={[type.bodyStrong, tabular, { color: num(s.net) < 0 ? colors.error : colors.textPrimary }]}>{formatMoney(num(s.net), c.currency)}</Text>
                  }
                />
              ))}
            </Card>
          </View>
        );
      })}

      {expenseCats.length ? (
        <>
          <SectionTitle title={`Gider kategorileri${c.currency !== "TRY" ? ` · ${c.currency}` : ""}`} />
          <Card padded style={styles.block}>
            {expenseCats.map((k, i) => {
              const share = expense > 0 ? Math.max(0, Math.min(1, num(k.net) / expense)) : 0;
              return (
                <View key={`${k.category_id}-${i}`} style={[styles.catRow, i > 0 && { marginTop: spacing.md }]} testID={`ie-cat-${k.category_id}`}>
                  <View style={styles.catHead}>
                    <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                      {k.name || "Kategorisiz"}
                    </Text>
                    <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "600" }]}>{formatMoney(num(k.net), c.currency)}</Text>
                  </View>
                  <View style={[styles.catTrack, { backgroundColor: colors.border }]}>
                    <View style={{ width: `${Math.round(share * 100)}%`, height: "100%", backgroundColor: colors.error, borderRadius: 3 }} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {vatUnknown > 0 ? (
        <Note testID={`ie-vat-unknown-${c.currency}`} text={`KDV ayrımı yapılamayan ${formatMoney(vatUnknown, c.currency)} gider var; bu tutar gidere KDV dahil girmiştir.`} />
      ) : null}
    </SafeAnimatedView>
  );
}

function ScopeNotes({ data }: { data: IncomeExpenseSummary }) {
  const s = data.scope || {};
  const notes: { id: string; text: string }[] = [];
  if (num(s.refund_split_unknown) > 0) notes.push({ id: "refund", text: `İade ayrımı yapılamayan ${num(s.refund_split_unknown)} Paraşüt belgesi gelire dahil.` });
  if (num(s.unsplit_pos_mixed) > 0) notes.push({ id: "pos", text: `${num(s.unsplit_pos_mixed)} karma ödemeli POS satışı nakit/kart olarak ayrılmadı.` });
  const exc = excludedText(s.excluded);
  if (exc) notes.push({ id: "scope", text: exc });
  if (s.parasut_last_import) notes.push({ id: "parasut", text: `Paraşüt'ten son aktarım: ${formatDate(s.parasut_last_import)}.` });
  if (!notes.length) return null;
  return (
    <View style={{ marginTop: spacing.sm }}>
      {notes.map((n) => (
        <Note key={n.id} testID={`ie-note-${n.id}`} text={n.text} />
      ))}
    </View>
  );
}

function Note({ text, testID }: { text: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.note, { backgroundColor: colors.infoBg }]}>
      <AlertIcon size={16} color={colors.info} />
      <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.xs, padding: 3, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  segmentItem: { flex: 1, textAlign: "center", paddingVertical: 9, borderRadius: radius.md - 2, overflow: "hidden" },
  hint: { marginHorizontal: spacing.lg, marginTop: 6, marginBottom: spacing.sm },
  heroValue: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, marginTop: 2 },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, marginTop: spacing.md, gap: 3, overflow: "hidden" },
  heroFoot: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  heroLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  heroSub: { fontSize: 17, fontWeight: "700", marginTop: 2 },
  catRow: {},
  catHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  catTrack: { height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md },
});
