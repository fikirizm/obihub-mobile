import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { getSalesOffers } from "../api";
import { formatDate, formatTry, type StatusKind } from "../utils";
import { FileTextIcon } from "../components/Icons";
import { InvoiceCardSkeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { NetworkErrorBanner } from "../components/NetworkErrorBanner";
import { StatusBadge } from "../components/StatusBadge";
import { saveCache, loadCache } from "../offlineCache";
import { useFocusLoad } from "../hooks/useFocusLoad";
import { useDebounce } from "../hooks/useDebounce";
import { Chip, ChipRow } from "../ui/Chip";
import { RowCard, StatCard } from "../ui/RowCard";
import { SearchField } from "../ui/SearchField";
import type { SalesOffer } from "../types";

const STATUS: Record<string, { kind: StatusKind; label: string }> = {
  accepted: { kind: "success", label: "Onaylı" },
  approved: { kind: "success", label: "Onaylı" },
  draft: { kind: "neutral", label: "Taslak" },
  waiting: { kind: "warning", label: "Beklemede" },
  sent: { kind: "info", label: "Gönderildi" },
  cancelled: { kind: "error", label: "İptal" },
  rejected: { kind: "error", label: "Reddedildi" },
};

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "waiting", label: "Beklemede" },
  { key: "accepted", label: "Onaylı" },
  { key: "sent", label: "Gönderildi" },
  { key: "draft", label: "Taslak" },
  { key: "rejected", label: "Reddedildi" },
];

function offerStatus(status?: string) {
  return STATUS[status || ""] ?? { kind: "neutral" as StatusKind, label: status || "—" };
}

// Paraşüt durum çeşitlerini süzgeç gruplarına indirger.
function normalizeStatus(s?: string) {
  if (!s) return "other";
  if (s === "accepted" || s === "approved") return "accepted";
  return s;
}

function offerTotal(o: SalesOffer) {
  return Number(o.gross_total || o.net_total || 0);
}

// Teklifler ekranına gömülen Paraşüt teklif listesi.
export function OffersList() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [list, setList] = useState<SalesOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token]
  );

  const debouncedSearch = useDebounce(search, 300);
  useFocusLoad(load, { hasData: list.length > 0 });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      total += offerTotal(o);
    });
    return { total, count: filtered.length };
  }, [filtered]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load(true);
      }}
      tintColor={colors.primary}
    />
  );
  const query = search.trim();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <NetworkErrorBanner visible={isOffline} offline />

      <View style={styles.stats}>
        <StatCard label="Toplam" value={formatTry(totals.total)} />
        <StatCard label="Adet" value={String(totals.count)} />
      </View>

      <SearchField value={search} onChangeText={setSearch} placeholder="Teklif başlığı veya müşteri ara" />

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={statusFilter === f.key} onPress={() => setStatusFilter(f.key)} />
        ))}
      </ChipRow>

      {loading ? (
        <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
          {[0, 1, 2, 3, 4].map((i) => (
            <InvoiceCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={refreshControl}
          ListEmptyComponent={
            <EmptyState
              icon={<FileTextIcon size={30} color={colors.textTertiary} />}
              title={query ? "Sonuç bulunamadı" : "Henüz teklif yok"}
              description={
                query ? `"${query}" için eşleşen teklif bulunamadı.` : "Paraşüt'te oluşturulmuş teklif bulunmuyor."
              }
              actionLabel={query ? "Aramayı temizle" : undefined}
              onAction={query ? () => setSearch("") : undefined}
            />
          }
          renderItem={({ item }) => {
            const st = offerStatus(item.status);
            return (
              <RowCard
                title={item.description || `Teklif #${item.id}`}
                subtitle={item.contact_name || "—"}
                meta={item.issue_date ? formatDate(item.issue_date) : undefined}
                amount={formatTry(offerTotal(item))}
                badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
                onPress={() => router.push({ pathname: "/offers/[id]", params: { id: item.id } })}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: spacing.huge },
});
