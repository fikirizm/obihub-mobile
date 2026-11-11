import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, type } from "../theme/tokens";
import { getAccountingInvoices } from "../api";
import { formatDate, formatTry } from "../utils";
import { StatusBadge } from "../components/StatusBadge";
import { ReceiptIcon } from "../components/Icons";
import { InvoiceCardSkeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { NetworkErrorBanner } from "../components/NetworkErrorBanner";
import { saveCache, loadCache } from "../offlineCache";
import { useFocusLoad } from "../hooks/useFocusLoad";
import { useDebounce } from "../hooks/useDebounce";
import { Chip, ChipRow } from "../ui/Chip";
import { RowCard, StatCard } from "../ui/RowCard";
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
      setIsOffline(false);
      await saveCache(`invoices_list_${source}`, invoices);
    } catch {
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

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoices-screen">
      <NetworkErrorBanner visible={isOffline} offline />

      {totalOnServer > list.length ? (
        <Text style={[type.footnote, styles.notice, { color: colors.textSecondary }]}>
          En yeni {list.length} fatura gösteriliyor (toplam {totalOnServer}). Toplamlar yalnızca bu kayıtları içerir.
        </Text>
      ) : null}

      <View style={styles.summaryRow}>
        <StatCard label="Ay toplamı" value={formatTry(monthTotals.total)} />
        <StatCard label="Adet" value={String(monthTotals.count)} />
        <StatCard label="Resmileşen" value={String(monthTotals.officialized)} tone="success" />
      </View>

      <SearchField testID="invoices-search" value={search} onChangeText={setSearch} placeholder="Fatura no, sipariş no veya müşteri" />

      <ChipRow>
        {monthOptions.map((m) => (
          <Chip key={m} testID={`invoice-month-${m}`} label={monthLabel(m)} selected={selectedMonth === m} onPress={() => setSelectedMonth(m)} />
        ))}
      </ChipRow>

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
              icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
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
          renderItem={({ item }) => {
            const isOfficial = item.can_officialize === false;
            const card = (
              <RowCard
                testID={`invoice-${item.id}`}
                title={`#${item.invoice_no || item.id}`}
                subtitle={item.contact_name || item.contact?.name || "-"}
                meta={`${formatDate(item.issue_date)} · ${item.order_no ? `Sipariş #${item.order_no}` : "Manuel"}`}
                amount={formatTry(item.display_gross_total || item.gross_total || item.net_total || 0)}
                badge={<StatusBadge label={isOfficial ? "Resmileşti" : "Beklemede"} kind={isOfficial ? "success" : "warning"} />}
                onPress={source === "parasut" ? () => router.push({ pathname: "/invoices/[id]", params: { id: item.id } }) : undefined}
              />
            );
            // BizimHesap faturalarının detay ucu yoktur; kart basılamaz, testID sarmalayıcıda kalır.
            return source === "parasut" ? card : <View testID={`invoice-${item.id}`}>{card}</View>;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  notice: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  summaryRow: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: spacing.huge },
});
