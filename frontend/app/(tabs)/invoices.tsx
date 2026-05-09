import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getInvoices } from "../../src/api";
import { formatTry } from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { CheckIcon, ClockIcon, ReceiptIcon, SearchIcon } from "../../src/components/Icons";
import type { Invoice } from "../../src/types";

export default function InvoicesScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await getInvoices(token, { page: 1, perPage: 100 });
      setList(Array.isArray(data?.invoices) ? data.invoices : []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
    const q = search.trim().toLowerCase();
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
  }, [list, search, selectedMonth]);

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

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoices-screen">
      <AppTopBar />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>FATURALAR</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Paraşüt</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.sumCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.sumLabel, { color: colors.textTertiary }]}>Bu Ay</Text>
          <Text style={[styles.sumValue, { color: colors.textPrimary }]} numberOfLines={1}>{formatTry(monthTotals.total)}</Text>
        </View>
        <View style={[styles.sumCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.sumLabel, { color: colors.textTertiary }]}>Adet</Text>
          <Text style={[styles.sumValue, { color: colors.textPrimary }]}>{monthTotals.count}</Text>
        </View>
        <View style={[styles.sumCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.sumLabel, { color: colors.textTertiary }]}>Resmileşen</Text>
          <Text style={[styles.sumValue, { color: colors.success }]}>{monthTotals.officialized}</Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: searchFocus ? colors.primary : colors.borderSubtle }]}>
        <SearchIcon size={18} color={colors.textTertiary} />
        <TextInput
          testID="invoices-search"
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          placeholder="Fatura no, sipariş no, müşteri ara..."
          placeholderTextColor={colors.textTertiary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      <View style={styles.monthScrollWrap}>
        <FlatList
          data={monthOptions}
          horizontal
          keyExtractor={(m) => m}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
          renderItem={({ item }) => {
            const active = selectedMonth === item;
            return (
              <PressableScale
                testID={`invoice-month-${item}`}
                onPress={() => setSelectedMonth(item)}
                style={[
                  styles.monthChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.borderSubtle,
                  },
                ]}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#FFF" : colors.textSecondary }}>
                  {monthLabel(item)}
                </Text>
              </PressableScale>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                <ReceiptIcon size={26} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Fatura bulunamadı</Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                Bu dönem için Paraşüt'te fatura yok ya da filtreyi değiştirmen gerekebilir.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isOfficial = item.can_officialize === false;
            return (
              <SafeAnimatedView entering={FadeInDown.delay(index * 35).springify().damping(18)}>
                <PressableScale
                  testID={`invoice-${item.id}`}
                  onPress={() => router.push({ pathname: "/invoices/[id]", params: { id: item.id } })}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
                >
                  <View style={[styles.iconBox, { backgroundColor: isOfficial ? colors.successBg : colors.warningBg }]}>
                    {isOfficial ? <CheckIcon size={18} color={colors.success} /> : <ClockIcon size={18} color={colors.warning} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.invNo, { color: colors.textPrimary }]} numberOfLines={1}>
                      #{item.invoice_no || item.id}
                    </Text>
                    <Text style={[styles.invCust, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.contact_name || item.contact?.name || "-"}
                    </Text>
                    <Text style={[styles.invDate, { color: colors.textTertiary }]} numberOfLines={1}>
                      {item.issue_date || "-"} · {item.order_no ? `Sipariş #${item.order_no}` : "Manuel"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={[styles.invAmount, { color: colors.textPrimary }]}>
                      {formatTry(item.display_gross_total || item.gross_total || item.net_total || 0)}
                    </Text>
                    <StatusBadge
                      label={isOfficial ? "Resmileşti" : "Beklemede"}
                      kind={isOfficial ? "success" : "warning"}
                      size="sm"
                    />
                  </View>
                </PressableScale>
              </SafeAnimatedView>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: fontWeight.bold, letterSpacing: -0.6, marginTop: 2, marginBottom: spacing.sm },
  summaryRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sumCell: { flex: 1, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1 },
  sumLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  sumValue: { fontSize: 16, fontWeight: "800", marginTop: 4, letterSpacing: -0.3 },
  searchWrap: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "500" },
  monthScrollWrap: { paddingVertical: spacing.sm },
  monthChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  invNo: { fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  invCust: { fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  invDate: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  invAmount: { fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },
  emptyWrap: { alignItems: "center", padding: spacing.xl, marginTop: spacing.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptyDesc: { fontSize: 13, textAlign: "center", paddingHorizontal: 28, lineHeight: 18, fontWeight: "500" },
});
