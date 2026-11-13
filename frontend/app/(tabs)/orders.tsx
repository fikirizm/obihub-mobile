import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { getIntegrations, getOrdersPage, getOrderStats, type OrderStats } from "../../src/api";
import { groupCount, ORDER_GROUPS, type OrderGroupKey } from "../../src/order-filters";
import { bulkDeleteOrders, canCreateHepsiJetShipment } from "../../src/api-siparis";
import { createHepsiJetShipment } from "../../src/api";
import { canManage } from "../../src/auth/permissions";
import { Button } from "../../src/ui/Button";
import { isStoreIntegration, providerLabel } from "../../src/utils";
import { InboxIcon, PrinterIcon, TrashIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { printOrderLabel } from "../../src/labels";
import { useFeedback } from "../../src/ui/Feedback";
import { EmptyState } from "../../src/components/EmptyState";
import { OrderRow, orderProvider } from "../../src/components/OrderRow";
import { Skeleton } from "../../src/components/Skeleton";
import { useDebounce } from "../../src/hooks/useDebounce";
import { TabHeader } from "../../src/ui/Header";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { SearchField } from "../../src/ui/SearchField";
import type { Integration, Order } from "../../src/types";

// Durum grupları ortak modülde (src/order-filters.ts): süzgeç sunucuda, sayılar /orders/stats'tan (mağaza seçiliyse o mağaza).
type FilterKey = OrderGroupKey;
const FILTERS = ORDER_GROUPS;

const PER_PAGE = 30;
// Panel'deki "3 gündür bekliyor" uyarısı sunucuda bu eşikle sayılır: durumu "pending", kaydı 3 günden eski.
const STALE_MS = 3 * 24 * 3600 * 1000;

// Yüklenirken gerçek listeyle aynı biçim: tek yuvarlak kart, içinde iki satırlı sipariş satırları.
function OrdersSkeleton() {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      accessibilityLabel="Siparişler yükleniyor"
    >
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View
          key={i}
          style={[styles.skeletonRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
        >
          <Skeleton width={36} height={36} borderRadius={10} />
          <View style={{ flex: 1, gap: 9 }}>
            <View style={styles.skeletonLine}>
              <Skeleton width={i % 2 ? "48%" : "58%"} height={14} />
              <Skeleton width={72} height={14} />
            </View>
            <View style={styles.skeletonLine}>
              <Skeleton width={i % 2 ? "44%" : "36%"} height={11} />
              <Skeleton width={78} height={20} borderRadius={10} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

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
  const params = useLocalSearchParams<{ filter?: string; stale?: string; t?: string }>();
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  // Panel uyarısından gelindiğinde yalnızca 3 günden eski bekleyen siparişler, en eskiden yeniye listelenir.
  const [staleOnly, setStaleOnly] = useState(false);
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
  const { toast, confirm } = useFeedback();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  // A6: toplu HepsiJet gönderisi — seçim kipi (yalnız gönderisi açılabilen siparişler seçilebilir).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

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
        // Kanalın varsayılan şablonu (web ile aynı); n11/Idefix kargo kodu ön koşulu satırdan denetlenir.
        const { printed, notice } = await printOrderLabel(token, order.id, orderProvider(order), { order });
        if (notice) toast(notice);
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
    if (params.t) setStaleOnly(params.stale === "1");
    // `t` her gelişte değişir; aynı süzgeçle ikinci kez gelindiğinde de uygulanır.
  }, [params.filter, params.stale, params.t]);

  useEffect(() => {
    if (!token) return;
    getIntegrations(token)
      // Kargo ve muhasebe bağlantıları sipariş döndürmez; mağaza çiplerinde yer almaz.
      .then((list) => setIntegrations((Array.isArray(list) ? list : []).filter(isStoreIntegration)))
      .catch(() => {});
  }, [token]);

  const fetchPage = useCallback(
    async (nextPage: number, mode: "reset" | "more" | "refresh") => {
      if (!token) return;
      const id = ++requestId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const statuses = staleOnly ? ["pending"] : FILTERS.find((f) => f.key === filter)?.statuses ?? [];
        const res = await getOrdersPage(token, {
          page: nextPage,
          perPage: PER_PAGE,
          search: debouncedSearch || undefined,
          statuses,
          integrationId: integrationId || undefined,
          sortBy: staleOnly ? "created_at" : undefined,
        });
        if (id !== requestId.current) return; // Daha yeni bir istek var.
        if (staleOnly) {
          // Liste en eskiden yeniye gelir; eşiği aşmayan ilk kayıtta eski siparişler bitmiştir.
          const cutoff = Date.now() - STALE_MS;
          const stale = res.items.filter((o) => {
            const ts = o.created_at ? Date.parse(String(o.created_at)) : NaN;
            return !Number.isNaN(ts) && ts <= cutoff;
          });
          const more = stale.length === res.items.length && nextPage < res.totalPages;
          setOrders((prev) => {
            if (mode !== "more") return stale;
            const known = new Set(prev.map((o) => o.id));
            return [...prev, ...stale.filter((o) => !known.has(o.id))];
          });
          // Bu kipte kesin toplam yalnızca son sayfa yüklenince bilinir; başlık o zamana dek "30+" yazar.
          setTotal((prev) => (mode === "more" ? prev + stale.length : stale.length));
          setPage(nextPage);
          setHasMore(more);
          setError(null);
          return;
        }
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
    [token, filter, staleOnly, debouncedSearch, integrationId]
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  // Süzgeç çiplerindeki sayılar: tüm siparişler üzerinden (yüklenen sayfa değil); mağaza seçiliyse yalnız o mağaza.
  const [stats, setStats] = useState<OrderStats | null>(null);
  const loadStats = useCallback(() => {
    if (!token) return;
    getOrderStats(token, integrationId || undefined)
      .then(setStats)
      .catch(() => setStats(null));
  }, [token, integrationId]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Web "Silinmişleri sil": yalnız "deleted" durumundaki siparişler kalıcı silinir; sunucu bir sonraki senkronda
  // yeniden içeri almaz (mezar kaydı). Ekranda yüklü olanlar silinir; liste sonra yeniden okunur.
  const deletedIds = filter === "deleted" && !staleOnly ? orders.filter((o) => o.status === "deleted").map((o) => o.id) : [];
  const canPurge = deletedIds.length > 0 && canManage(user, "orders");
  const purgeDeleted = async () => {
    if (!token || purging || deletedIds.length === 0) return;
    const ok = await confirm({
      title: `${deletedIds.length} silinmiş sipariş kalıcı olarak kaldırılsın mı?`,
      message: "Bu siparişler ObiHub'dan tamamen silinir ve mağaza senkronunda yeniden gelmez. Geri alınamaz.",
      confirmLabel: "Kalıcı olarak sil",
      destructive: true,
    });
    if (!ok) return;
    setPurging(true);
    try {
      const r = await bulkDeleteOrders(token, deletedIds);
      toast(`${r?.deleted_count ?? deletedIds.length} sipariş silindi.`, "success");
      await fetchPage(1, "refresh");
    } catch (e: any) {
      toast(e?.message || "Toplu silme başarısız.", "error");
    } finally {
      setPurging(false);
    }
  };

  const canBulk = canManage(user, "orders");
  const eligibleCount = orders.filter((o) => canCreateHepsiJetShipment(o as any, orderProvider(o))).length;
  const runBulk = async () => {
    if (!token || bulkBusy || selected.size === 0) return;
    const ids = orders.filter((o) => selected.has(o.id)).map((o) => o.id);
    const ok = await confirm({
      title: `${ids.length} siparişe HepsiJet gönderisi açılsın mı?`,
      message: "Her sipariş için HepsiJet'te gönderi açılır ve barkod üretilir. İşlem sırayla yapılır.",
      confirmLabel: "Gönderileri oluştur",
    });
    if (!ok) return;
    setBulkBusy(true);
    let done = 0;
    let inProgress = 0;
    const failed: string[] = [];
    for (const id of ids) {
      setBulkProgress(`${done + inProgress + failed.length + 1}/${ids.length}`);
      try {
        const r: any = await createHepsiJetShipment(token, id);
        if (r?.success) done += 1;
        else if (r?.in_progress) inProgress += 1;
        else failed.push(r?.message || "Gönderi oluşturulamadı");
      } catch (e: any) {
        failed.push(e?.message || "Gönderi oluşturulamadı");
      }
    }
    setBulkBusy(false);
    setBulkProgress("");
    setSelected(new Set());
    setSelectMode(false);
    const parts = [`${done} gönderi oluşturuldu`, inProgress ? `${inProgress} zaten sürüyor` : null, failed.length ? `${failed.length} başarısız (${failed[0]})` : null].filter(Boolean);
    toast(parts.join(" · ") + ".", failed.length ? "error" : "success");
    fetchPage(1, "refresh");
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="orders-screen">
      <TabHeader title="Siparişler" subtitle={loading ? undefined : `${total}${staleOnly && hasMore ? "+" : ""} sipariş`} />
      <SearchField testID="orders-search" value={search} onChangeText={setSearch} placeholder="Müşteri veya sipariş no ara" />
      {canBulk && (selectMode || eligibleCount > 0) ? (
        <View style={styles.bulkToggle}>
          <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
            {selectMode ? "Gönderi açılacak siparişleri seçin" : `${eligibleCount} siparişe toplu HepsiJet gönderisi açılabilir`}
          </Text>
          <Button
            testID="orders-bulk-toggle"
            size="sm"
            variant={selectMode ? "secondary" : "ghost"}
            label={selectMode ? "Vazgeç" : "Toplu gönderi"}
            disabled={bulkBusy}
            onPress={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
          />
        </View>
      ) : null}
      <ChipRow>
        {staleOnly ? (
          <Chip testID="orders-filter-stale" label="3 günden eski bekleyenler" selected onPress={() => setStaleOnly(false)} />
        ) : null}
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            testID={`orders-filter-${f.key}`}
            label={f.label}
            count={groupCount(stats, f.key)}
            selected={!staleOnly && filter === f.key}
            onPress={() => {
              setStaleOnly(false);
              setFilter(f.key);
            }}
          />
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
        <View style={styles.list}>
          <OrdersSkeleton />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStats(); fetchPage(1, "refresh"); }} tintColor={colors.primary} />}
          ListHeaderComponent={
            canPurge ? (
              <View style={[styles.purgeCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]} testID="orders-purge-card">
                <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>
                  Mağazada silinen siparişler. Kalıcı olarak kaldırabilirsiniz.
                </Text>
                <Button
                  testID="orders-purge-btn"
                  size="sm"
                  variant="destructive"
                  label={`${deletedIds.length} siparişi sil`}
                  icon={<TrashIcon size={14} color="#FFFFFF" />}
                  busy={purging}
                  onPress={purgeDeleted}
                />
              </View>
            ) : null
          }
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
              {selectMode ? (
                (() => {
                  const ok = canCreateHepsiJetShipment(item as any, orderProvider(item));
                  const sel = selected.has(item.id);
                  return (
                    <PressableScale
                      testID={`order-select-${item.id}`}
                      disabled={!ok || bulkBusy}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: sel, disabled: !ok }}
                      style={[styles.selectRow, { opacity: ok ? 1 : 0.4 }]}
                    >
                      <View style={[styles.check, { borderColor: sel ? colors.primary : colors.textTertiary, backgroundColor: sel ? colors.primary : "transparent" }]}>
                        {sel ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                      <View style={{ flex: 1 }} pointerEvents="none">
                        <OrderRow order={item} divider={false} />
                      </View>
                    </PressableScale>
                  );
                })()
              ) : (
                <SwipeableOrder order={item} divider={index > 0} onPrint={printLabel} busy={printingId === item.id} />
              )}
            </View>
          )}
          ListEmptyComponent={
            error ? (
              <EmptyState icon={<InboxIcon size={30} color={colors.error} />} title="Siparişler yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={() => fetchPage(1, "reset")} />
            ) : (
              <EmptyState
                icon={<InboxIcon size={30} color={colors.primary} />}
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
      {selectMode && selected.size > 0 ? (
        <View style={[styles.bulkBar, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}>
          <Button
            testID="orders-bulk-run"
            label={bulkBusy ? `Oluşturuluyor ${bulkProgress}` : `${selected.size} siparişe gönderi oluştur`}
            busy={false}
            disabled={bulkBusy}
            onPress={runBulk}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bulkToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  bulkBar: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  selectRow: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.md },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  wrap: { flex: 1 },
  purgeCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  // Kaydırma eylemi satırın tam yüksekliğini kaplar (satır iki satıra çıksa da).
  swipeAction: { width: 88, alignSelf: "stretch", minHeight: 68, alignItems: "center", justifyContent: "center", gap: 4 },
  skeletonCard: { borderWidth: 1, borderRadius: radius.lg },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 68 },
  skeletonLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  swipeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden" },
  last: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: "hidden" },
});
