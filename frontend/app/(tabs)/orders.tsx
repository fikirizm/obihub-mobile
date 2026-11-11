import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { getIntegrations, getOrdersPage } from "../../src/api";
import { providerLabel } from "../../src/utils";
import { InboxIcon, PrinterIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { printOrderLabel } from "../../src/labels";
import { useFeedback } from "../../src/ui/Feedback";
import { EmptyState } from "../../src/components/EmptyState";
import { OrderRow, orderProvider } from "../../src/components/OrderRow";
import { OrderCardSkeleton } from "../../src/components/Skeleton";
import { useDebounce } from "../../src/hooks/useDebounce";
import { TabHeader } from "../../src/ui/Header";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { SearchField } from "../../src/ui/SearchField";
import type { Integration, Order } from "../../src/types";

type FilterKey = "all" | "pending" | "shipped" | "delivered" | "cancelled";

// Sunucudaki iç sipariş durumları: pending, processing, shipped, delivered, cancelled.
const FILTERS: { key: FilterKey; label: string; statuses: string[] }[] = [
  { key: "all", label: "Tümü", statuses: [] },
  { key: "pending", label: "Bekleyen", statuses: ["pending", "processing"] },
  { key: "shipped", label: "Kargoda", statuses: ["shipped"] },
  { key: "delivered", label: "Teslim edildi", statuses: ["delivered"] },
  { key: "cancelled", label: "İptal", statuses: ["cancelled"] },
];

const PER_PAGE = 30;

// Sipariş satırını sola kaydırınca "Etiket" eylemi açılır (yalnızca cihazda).
function SwipeableOrder({ order, divider, onPrint, busy }: { order: Order; divider: boolean; onPrint: (o: Order) => void; busy: boolean }) {
  const { colors } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  if (Platform.OS === "web") return <OrderRow order={order} divider={divider} />;
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={() => (
        <PressableScale
          testID={`order-print-${order.id}`}
          accessibilityRole="button"
          accessibilityLabel="Etiketi yazdır"
          disabled={busy}
          onPress={() => {
            ref.current?.close();
            onPrint(order);
          }}
          style={[styles.swipeAction, { backgroundColor: colors.primary }]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <PrinterIcon size={20} color="#FFFFFF" />}
          <Text style={styles.swipeText}>Etiket</Text>
        </PressableScale>
      )}
    >
      <View style={{ backgroundColor: colors.surface }}>
        <OrderRow order={order} divider={divider} />
      </View>
    </ReanimatedSwipeable>
  );
}

export default function OrdersScreen() {
  const params = useLocalSearchParams<{ filter?: string; t?: string }>();
  const { token } = useAuth();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [integrationId, setIntegrationId] = useState<string>("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.trim(), 350);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const { toast } = useFeedback();
  const [printingId, setPrintingId] = useState<string | null>(null);

  const printLabel = useCallback(
    async (order: Order) => {
      if (!token) return;
      if (printingId) {
        toast("Bir etiket hazırlanıyor, lütfen bekleyin.");
        return;
      }
      setPrintingId(order.id);
      toast("Etiket hazırlanıyor…");
      try {
        const printed = await printOrderLabel(token, order.id, orderProvider(order));
        if (printed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e: any) {
        toast(e?.message || "Etiket alınamadı.", "error");
      } finally {
        setPrintingId(null);
      }
    },
    [token, printingId, toast]
  );

  // Panel'deki kısayollar süzgeçle gelir (ör. bekleyen siparişler).
  useEffect(() => {
    const f = String(params.filter || "");
    if (FILTERS.some((x) => x.key === f)) setFilter(f as FilterKey);
    // `t` her gelişte değişir; aynı süzgeçle ikinci kez gelindiğinde de uygulanır.
  }, [params.filter, params.t]);

  useEffect(() => {
    if (!token) return;
    getIntegrations(token)
      .then((list) => setIntegrations(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [token]);

  const fetchPage = useCallback(
    async (nextPage: number, mode: "reset" | "more" | "refresh") => {
      if (!token) return;
      const id = ++requestId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const statuses = FILTERS.find((f) => f.key === filter)?.statuses ?? [];
        const res = await getOrdersPage(token, {
          page: nextPage,
          perPage: PER_PAGE,
          search: debouncedSearch || undefined,
          statuses,
          integrationId: integrationId || undefined,
        });
        if (id !== requestId.current) return; // Daha yeni bir istek var.
        setOrders((prev) => {
          if (mode !== "more") return res.items;
          const known = new Set(prev.map((o) => o.id));
          return [...prev, ...res.items.filter((o) => !known.has(o.id))];
        });
        setTotal(res.total);
        setPage(nextPage);
        setHasMore(nextPage < res.totalPages);
        setError(null);
      } catch (e: any) {
        if (id !== requestId.current) return;
        setError(e?.message || "Siparişler yüklenemedi.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [token, filter, debouncedSearch, integrationId]
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="orders-screen">
      <TabHeader title="Siparişler" subtitle={loading ? undefined : `${total} sipariş`} />
      <SearchField testID="orders-search" value={search} onChangeText={setSearch} placeholder="Müşteri veya sipariş no ara" />
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} testID={`orders-filter-${f.key}`} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipRow>
      {integrations.length > 1 ? (
        <ChipRow>
          <Chip label="Tüm mağazalar" selected={!integrationId} onPress={() => setIntegrationId("")} />
          {integrations.map((i) => (
            <Chip
              key={i.id}
              label={i.name || providerLabel(String(i.provider || ""))}
              selected={integrationId === i.id}
              onPress={() => setIntegrationId(i.id)}
            />
          ))}
        </ChipRow>
      ) : null}

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={7}
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore && !loading) fetchPage(page + 1, "more");
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPage(1, "refresh"); }} tintColor={colors.primary} />}
          renderItem={({ item, index }) => (
            <View
              style={[
                { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderLeftWidth: 1, borderRightWidth: 1 },
                index === 0 && styles.first,
                index === 0 && { borderTopWidth: 1 },
                index === orders.length - 1 && styles.last,
                index === orders.length - 1 && { borderBottomWidth: 1 },
              ]}
            >
              <SwipeableOrder order={item} divider={index > 0} onPrint={printLabel} busy={printingId === item.id} />
            </View>
          )}
          ListEmptyComponent={
            error ? (
              <EmptyState icon={<InboxIcon size={30} color={colors.textTertiary} />} title="Siparişler yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={() => fetchPage(1, "reset")} />
            ) : (
              <EmptyState
                icon={<InboxIcon size={30} color={colors.textTertiary} />}
                title={debouncedSearch ? "Sonuç bulunamadı" : "Sipariş yok"}
                description={debouncedSearch ? "Arama ifadesini veya süzgeci değiştirin." : "Bu süzgece uyan sipariş bulunmuyor."}
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : orders.length > 0 && !hasMore ? (
              <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center", marginVertical: spacing.lg }]}>Listenin sonu</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  swipeAction: { width: 88, alignItems: "center", justifyContent: "center", gap: 4 },
  swipeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: "hidden" },
});
