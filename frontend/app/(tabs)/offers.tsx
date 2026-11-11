import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getSalesOffers } from "../../src/api";
import { formatTry } from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { FileTextIcon, SearchIcon } from "../../src/components/Icons";
import { InvoiceCardSkeleton } from "../../src/components/Skeleton";
import { EmptyState } from "../../src/components/EmptyState";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import { useDebounce } from "../../src/hooks/useDebounce";
import type { SalesOffer } from "../../src/types";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  accepted:  { bg: "#DCFCE7", text: "#16A34A", label: "Onaylı" },
  approved:  { bg: "#DCFCE7", text: "#16A34A", label: "Onaylı" },
  draft:     { bg: "#F1F5F9", text: "#64748B", label: "Taslak" },
  waiting:   { bg: "#FEF3C7", text: "#D97706", label: "Beklemede" },
  sent:      { bg: "#DBEAFE", text: "#2563EB", label: "Gönderildi" },
  cancelled: { bg: "#FEE2E2", text: "#DC2626", label: "İptal" },
  rejected:  { bg: "#FEE2E2", text: "#DC2626", label: "Reddedildi" },
};

function statusStyle(status?: string) {
  return STATUS_COLORS[status || ""] ?? { bg: "#F1F5F9", text: "#64748B", label: status || "—" };
}

export default function OffersScreen() {
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const [list, setList] = useState<SalesOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Normalize Paraşüt status variants to display groups
  const normalizeStatus = (s?: string) => {
    if (!s) return "other";
    if (s === "accepted" || s === "approved") return "accepted";
    return s;
  };

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      if (!silent) {
        const cached = await loadCache<SalesOffer[]>("offers_list");
        if (cached && cached.length > 0) {
          setList(cached);
          setIsOffline(true);
          setLoading(false);
        }
      }
      try {
        const data = await getSalesOffers(token, { page: 1, perPage: 200 });
        const offers: SalesOffer[] = Array.isArray(data?.offers)
          ? data.offers
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : [];
        setList(offers);
        setIsOffline(false);
        await saveCache("offers_list", offers);
      } catch {
        if (list.length === 0 && !silent) {
          const cached = await loadCache<SalesOffer[]>("offers_list");
          if (cached) {
            setList(cached);
            setIsOffline(true);
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  const debouncedSearch = useDebounce(search, 300);
  useFocusLoad(load, { hasData: list.length > 0 });
  useEffect(() => { load(); }, [token]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return list.filter((o) => {
      if (statusFilter !== "all" && normalizeStatus(o.status) !== statusFilter) return false;
      if (!q) return true;
      return (
        String(o.description || "").toLowerCase().includes(q) ||
        String(o.contact_name || "").toLowerCase().includes(q)
      );
    });
  }, [list, debouncedSearch, statusFilter]);

  const totals = useMemo(() => {
    let total = 0;
    filtered.forEach((o) => {
      total += Number((o as any).gross_total || o.net_total || 0);
    });
    return { total, count: filtered.length };
  }, [filtered]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <AppTopBar />
      <NetworkErrorBanner visible={isOffline} offline />

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
        <Text style={[styles.eyebrow, { color: "#D97706" }]}>TEKLİFLER</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Paraşüt</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.sumCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.sumLabel, { color: colors.textTertiary }]}>Toplam</Text>
          <Text style={[styles.sumValue, { color: colors.textPrimary }]} numberOfLines={1}>
            {formatTry(totals.total)}
          </Text>
        </View>
        <View style={[styles.sumCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.sumLabel, { color: colors.textTertiary }]}>Adet</Text>
          <Text style={[styles.sumValue, { color: colors.textPrimary }]}>{totals.count}</Text>
        </View>
      </View>

      <View
        style={[
          styles.searchWrap,
          { backgroundColor: colors.surface, borderColor: searchFocus ? "#D97706" : colors.borderSubtle },
        ]}
      >
        <SearchIcon size={18} color={colors.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          placeholder="Teklif başlığı veya müşteri ara..."
          placeholderTextColor={colors.textTertiary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      <View style={styles.filterScrollWrap}>
        <FlatList
          data={[
            { key: "all",      label: "Tümü" },
            { key: "waiting",  label: "Beklemede" },
            { key: "accepted", label: "Onaylı" },
            { key: "sent",     label: "Gönderildi" },
            { key: "draft",    label: "Taslak" },
            { key: "rejected", label: "Reddedildi" },
          ]}
          horizontal
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
          renderItem={({ item: f }) => {
            const active = statusFilter === f.key;
            return (
              <PressableScale
                onPress={() => setStatusFilter(f.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? "#D97706" : colors.surface,
                    borderColor: active ? "#D97706" : colors.borderSubtle,
                  },
                ]}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#FFF" : colors.textSecondary }}>
                  {f.label}
                </Text>
              </PressableScale>
            );
          }}
        />
      </View>

      {loading ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#D97706" />
          }
        >
          {[0, 1, 2, 3, 4].map((i) => <InvoiceCardSkeleton key={i} />)}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 }}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#D97706"
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<FileTextIcon size={30} color={colors.textTertiary} />}
              title={search.trim() ? "Sonuç bulunamadı" : "Henüz teklif yok"}
              description={
                search.trim()
                  ? `"${search.trim()}" için eşleşen teklif bulunamadı.`
                  : "Paraşüt'te oluşturulmuş teklif bulunmuyor."
              }
              actionLabel={search.trim() ? "Aramayı Temizle" : undefined}
              onAction={search.trim() ? () => setSearch("") : undefined}
            />
          }
          renderItem={({ item, index }) => {
            const st = statusStyle(item.status);
            return (
              <SafeAnimatedView entering={FadeInDown.delay(index * 35).springify().damping(18)}>
                <PressableScale
                  onPress={() =>
                    router.push({ pathname: "/offers/[id]", params: { id: item.id } })
                  }
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                    shadows.sm,
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: "#FEF3C7" }]}>
                    <FileTextIcon size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.offerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.description || `Teklif #${item.id}`}
                    </Text>
                    <Text style={[styles.offerContact, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.contact_name || "—"}
                    </Text>
                    {item.issue_date ? (
                      <Text style={[styles.offerDate, { color: colors.textTertiary }]}>
                        {item.issue_date}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={[styles.offerAmount, { color: colors.textPrimary }]}>
                      {formatTry(Number((item as any).gross_total || item.net_total || 0))}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
                    </View>
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
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "500" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  offerTitle: { fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  offerContact: { fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  offerDate: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  offerAmount: { fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999 },
  badgeText: { fontSize: 10.5, fontWeight: "700" },
  filterScrollWrap: { paddingVertical: spacing.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 1 },
});
