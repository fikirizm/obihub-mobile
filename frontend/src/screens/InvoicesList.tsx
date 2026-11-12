import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { getAccountingInvoices } from "../api";
import { formatDate, formatTry } from "../utils";
import { StatusBadge } from "../components/StatusBadge";
import { AlertIcon, CheckIcon, ClockIcon, ReceiptIcon } from "../components/Icons";
import { InvoiceCardSkeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { SummaryHero } from "../ui/SummaryHero";
import { NetworkErrorBanner } from "../components/NetworkErrorBanner";
import { SafeAnimatedView } from "../components/SafeAnimatedView";
import { saveCache, loadCache } from "../offlineCache";
import { useFocusLoad } from "../hooks/useFocusLoad";
import { useDebounce } from "../hooks/useDebounce";
import { Chip, ChipRow } from "../ui/Chip";
import { IconTile } from "../ui/ListRow";
import { RowCard } from "../ui/RowCard";
import { SearchField } from "../ui/SearchField";
import type { Invoice } from "../types";

// Muhasebe programı fatura listesi; başlığı çağıran ekran çizer.
export function InvoicesList({ source = "parasut" }: { source?: "parasut" | "bizimhesap" }) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [totalOnServer, setTotalOnServer] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    if (!silent) {
      const cached = await loadCache<Invoice[]>(`invoices_list_${source}`);
      if (cached && cached.length > 0) {
        setList(cached);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const res = await getAccountingInvoices(token, source);
      const invoices = res.invoices;
      setList(invoices);
      setTotalOnServer(res.total);
      setLoadError(null);
      setIsOffline(false);
      await saveCache(`invoices_list_${source}`, invoices);
    } catch (e: any) {
      // Gösterilecek kayıt yoksa ekran "fatura yok" yerine bu hatayı gösterir.
      setLoadError(e?.message || "Faturalar yüklenemedi.");
      if (list.length === 0 && !silent) {
        const cached = await loadCache<Invoice[]>(`invoices_list_${source}`);
        if (cached) { setList(cached); setIsOffline(true); }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, source]);

  const debouncedSearch = useDebounce(search, 300);

  useFocusLoad(load, { hasData: list.length > 0 });

  useEffect(() => {
    load();
  }, [token]);

  // Satır giriş animasyonu yalnızca ilk yüklemede oynar; sanallaştırma ya da süzgeç değişimiyle
  // yeniden bağlanan satırlar beklemeden görünür.
  const animateRows = useRef(true);
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      animateRows.current = false;
    }, 700);
    return () => clearTimeout(t);
  }, [loading]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    list.forEach((i) => {
      const d = i.issue_date ? new Date(i.issue_date) : null;
      if (d && !Number.isNaN(d.getTime())) {
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    });
    if (!months.size) {
      const d = new Date();
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(months).sort().reverse();
  }, [list]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return list
      .filter((i) => {
        const d = i.issue_date ? new Date(i.issue_date) : null;
        if (!d || Number.isNaN(d.getTime())) return true;
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return month === selectedMonth;
      })
      .filter((i) => {
        if (!q) return true;
        return (
          String(i.invoice_no || "").toLowerCase().includes(q) ||
          String(i.order_no || "").toLowerCase().includes(q) ||
          String(i.contact_name || i.contact?.name || "").toLowerCase().includes(q)
        );
      });
  }, [list, debouncedSearch, selectedMonth]);

  const monthTotals = useMemo(() => {
    let total = 0;
    let officialized = 0;
    filtered.forEach((i) => {
      total += Number(i.display_gross_total || i.gross_total || i.net_total || 0);
      if (i.can_officialize === false) officialized += 1;
    });
    return { total, officialized, count: filtered.length };
  }, [filtered]);

  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-");
    const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    return `${months[Number(mm) - 1] || mm} ${y}`;
  };

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };
  const query = search.trim();
  const pendingCount = monthTotals.count - monthTotals.officialized;
  const officialRatio = monthTotals.count > 0 ? monthTotals.officialized / monthTotals.count : 0;

  // İstek başarısız ve gösterilecek kayıt yok: sıfırlı özet ve "fatura yok" yerine hata gösterilir.
  if (!loading && loadError && list.length === 0) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.list}
        testID="invoices-screen"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <EmptyState
          icon={<AlertIcon size={30} color={colors.error} />}
          title="Faturalar yüklenemedi"
          description={loadError}
          actionLabel="Tekrar dene"
          onAction={() => load()}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoices-screen">
      <NetworkErrorBanner visible={isOffline} offline />

      {!isOffline && totalOnServer > list.length ? (
        <View style={[styles.notice, { backgroundColor: colors.infoBg }]}>
          <AlertIcon size={16} color={colors.info} />
          <Text style={[type.footnote, styles.noticeText, { color: colors.textSecondary }]}>
            En yeni {list.length} fatura gösteriliyor (toplam {totalOnServer}). Toplamlar yalnızca bu kayıtları içerir.
          </Text>
        </View>
      ) : null}

      <SafeAnimatedView entering={FadeInDown.duration(380)}>
        <SummaryHero
          testID="invoices-summary"
          tone="emerald"
          label="Ay toplamı"
          value={formatTry(monthTotals.total)}
          facts={[
            { label: "Fatura", value: String(monthTotals.count) },
            { label: "Resmileşen", value: String(monthTotals.officialized), tone: "good" },
            { label: "Bekleyen", value: String(pendingCount), tone: pendingCount > 0 ? "warn" : undefined },
          ]}
          style={styles.hero}
        />
        {monthTotals.count > 0 ? (
          <View
            style={styles.progressWrap}
            accessible
            accessibilityLabel={`${monthTotals.officialized} fatura resmileşti, ${pendingCount} fatura beklemede`}
          >
            <View style={[styles.progressTrack, { backgroundColor: pendingCount > 0 ? colors.warningBg : colors.successBg }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.success, width: `${Math.round(officialRatio * 100)}%` }]} />
            </View>
            <View style={styles.progressLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={[type.caption, tabular, { color: colors.textSecondary }]} numberOfLines={1}>
                  {monthTotals.officialized} resmileşti
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                <Text style={[type.caption, tabular, { color: colors.textSecondary }]} numberOfLines={1}>
                  {pendingCount} beklemede
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </SafeAnimatedView>

      <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
        <SearchField testID="invoices-search" value={search} onChangeText={setSearch} placeholder="Fatura no, sipariş no veya müşteri" />
      </SafeAnimatedView>

      <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
        <ChipRow>
          {monthOptions.map((m) => (
            <Chip key={m} testID={`invoice-month-${m}`} label={monthLabel(m)} selected={selectedMonth === m} onPress={() => setSelectedMonth(m)} />
          ))}
        </ChipRow>
      </SafeAnimatedView>

      {loading ? (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <InvoiceCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={<ReceiptIcon size={30} color={colors.emerald} />}
              title={query ? "Sonuç bulunamadı" : "Bu ayda fatura yok"}
              description={
                query
                  ? `"${query}" için eşleşen fatura bulunamadı. Farklı bir arama deneyin.`
                  : "Bu dönemde muhasebe programında fatura bulunmuyor. Başka bir ay seçin."
              }
              actionLabel={query ? "Aramayı temizle" : undefined}
              onAction={query ? () => setSearch("") : undefined}
            />
          }
          renderItem={({ item, index }) => {
            const isOfficial = item.can_officialize === false;
            const card = (
              <RowCard
                accent={isOfficial ? colors.success : colors.warning}
                leading={
                  <IconTile tint={isOfficial ? colors.successBg : colors.warningBg}>
                    {isOfficial ? <CheckIcon size={18} color={colors.success} /> : <ClockIcon size={18} color={colors.warning} />}
                  </IconTile>
                }
                testID={`invoice-${item.id}`}
                title={`#${item.invoice_no || item.id}`}
                subtitle={item.contact_name || item.contact?.name || "-"}
                // Dar ekranda kesilen kısım tarih olsun diye sipariş numarası öne alınır.
                meta={`${item.order_no ? `Sipariş #${item.order_no}` : "Manuel"} · ${formatDate(item.issue_date)}`}
                amount={formatTry(item.display_gross_total || item.gross_total || item.net_total || 0)}
                badge={<StatusBadge label={isOfficial ? "Resmileşti" : "Beklemede"} kind={isOfficial ? "success" : "warning"} />}
                onPress={source === "parasut" ? () => router.push({ pathname: "/invoices/[id]", params: { id: item.id } }) : undefined}
              />
            );
            // BizimHesap faturalarının detay ucu yoktur; kart basılamaz, testID sarmalayıcıda kalır.
            const row = source === "parasut" ? card : <View testID={`invoice-${item.id}`}>{card}</View>;
            // Sarmalayıcı her satırda aynı kalır (tip değişimi yeniden bağlamaya yol açmasın);
            // yalnızca ilk yüklemede ilk ekrandaki satırlar sırayla kayarak gelir.
            return (
              <SafeAnimatedView entering={animateRows.current && index < 8 ? FadeInDown.delay(index * 35).duration(320) : undefined}>
                {row}
              </SafeAnimatedView>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  wrap: { flex: 1 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1, minWidth: 0 },
  summaryRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  progressWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressLegend: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: spacing.huge },
});
