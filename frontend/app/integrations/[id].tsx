import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getIntegrations, getOrders, syncIntegrationOrders } from "../../src/api";
import {
  displayOrderNo,
  displayOrderStatus,
  formatTry,
  getOrderTrackingNo,
  orderTimestamp,
  providerLabel,
  relativeDateLabel,
  statusKindFromOrder,
} from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { EmptyState } from "../../src/components/EmptyState";
import { InboxIcon, RefreshIcon } from "../../src/components/Icons";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { SearchField } from "../../src/ui/SearchField";
import { saveCache, loadCache } from "../../src/offlineCache";
import type { Integration, Order } from "../../src/types";

type IntegDetailCache = { orders: Order[]; integration: Integration | null };

const SYNC_COOLDOWN_MS = 60_000;

export default function IntegrationOrders() {
  const params = useLocalSearchParams<{ id: string; provider?: string }>();
  const integrationId = String(params.id || "");
  const providerHint = String(params.provider || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [search, setSearch] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [tickNow, setTickNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cacheKey = `integration_detail_${integrationId}`;

  const load = async (silent = false) => {
    if (!token || !integrationId) return;
    if (!silent) {
      setLoading(true);
      const cached = await loadCache<IntegDetailCache>(cacheKey);
      if (cached) {
        setOrders(cached.orders);
        setIntegration(cached.integration);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const [list, ints] = await Promise.all([
        getOrders(token, integrationId, { page: 1, perPage: 200, sortBy: "-created_at" }),
        getIntegrations(token).catch(() => [] as Integration[]),
      ]);
      const fetchedOrders = Array.isArray(list) ? list : [];
      const found = (ints || []).find((i) => i.id === integrationId) || null;
      setOrders(fetchedOrders);
      setIntegration(found);
      setIsOffline(false);
      await saveCache(cacheKey, { orders: fetchedOrders, integration: found });
    } catch {
      // Yüklenemezse eldeki (önbellekteki) kayıtlar kalır.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, integrationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? orders
      : orders.filter((o) => {
          const no = String(o.channel_order_id || "").toLowerCase();
          const customer = String(o.customer_name || "").toLowerCase();
          return no.includes(q) || customer.includes(q);
        });
    return [...list].sort((a, b) => orderTimestamp(b) - orderTimestamp(a));
  }, [orders, search]);

  const provider = providerHint || integration?.provider || integration?.name || "";
  const remainingMs = Math.max(0, cooldownEnd - tickNow);
  const cooldownText = useMemo(() => {
    if (remainingMs <= 0) return "";
    const totalSec = Math.ceil(remainingMs / 1000);
    return `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
  }, [remainingMs]);

  const handleSync = async () => {
    if (!token || !integration || syncBusy || remainingMs > 0) return;
    setSyncBusy(true);
    try {
      await syncIntegrationOrders(token, integration.id, integration.provider || integration.name || "", 7);
      setCooldownEnd(Date.now() + SYNC_COOLDOWN_MS);
      await load(true);
      toast("Yeni siparişler güncellendi.", "success");
    } catch (e: any) {
      toast(e?.message || "Senkronizasyon başarısız oldu.", "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const storeName = integration?.name || providerLabel(provider) || "Mağaza";
  const lastIndex = filtered.length - 1;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <StackHeader title={storeName} subtitle={`${filtered.length} sipariş`} />
      <NetworkErrorBanner visible={isOffline} offline />

      <View style={styles.storeRow}>
        <PlatformLogo provider={provider} size="sm" />
        <View style={styles.storeText}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
            {providerLabel(provider) || storeName}
          </Text>
        </View>
        <Button
          testID="sync-btn"
          label="Senkronize et"
          size="sm"
          onPress={handleSync}
          busy={syncBusy}
          disabled={remainingMs > 0}
          icon={<RefreshIcon size={16} color="#FFFFFF" />}
          style={remainingMs > 0 ? styles.syncDisabled : undefined}
        />
      </View>
      {/* Tam genişlikte: düğmenin yanında dar kalıp süre kesilmesin. */}
      <Text style={[type.caption, tabular, styles.syncNote, { color: colors.textTertiary }]} accessibilityLiveRegion="none">
        {cooldownText ? `Yeniden senkronizasyon: ${cooldownText}` : "Son 7 günün siparişleri çekilir."}
      </Text>

      <SearchField testID="orders-search" value={search} onChangeText={setSearch} placeholder="Sipariş no veya müşteri ara" />

      {loading ? (
        <ScrollView
          contentContainerStyle={styles.loading}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <ActivityIndicator color={colors.primary} />
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={<InboxIcon size={30} color={colors.textTertiary} />}
              title="Sipariş bulunamadı"
              description="Arama ifadesini değiştirin veya senkronize ederek güncel siparişleri çekin."
            />
          }
          renderItem={({ item, index }) => {
            const status = displayOrderStatus(item, provider);
            const amount = formatTry(item.total_amount || 0);
            const trackingNo = getOrderTrackingNo(item);
            return (
              <View
                style={[
                  styles.rowShell,
                  { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                  index === 0 && styles.first,
                  index === lastIndex && styles.last,
                ]}
              >
                <PressableScale
                  testID={`order-${item.id}`}
                  onPress={() => router.push({ pathname: "/orders/[id]", params: { id: item.id, provider } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Sipariş ${displayOrderNo(item)}, ${item.customer_name || "müşteri"}, ${amount}, ${status}`}
                >
                  <View style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={styles.rowMain}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.customer_name || "Müşteri"}
                      </Text>
                      <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
                        #{displayOrderNo(item)} · {relativeDateLabel(item)}
                      </Text>
                      {trackingNo ? (
                        <Text style={[type.caption, tabular, { color: colors.textTertiary }]} numberOfLines={1}>
                          Kargo takip: {trackingNo}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.trailing}>
                      <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{amount}</Text>
                      <StatusBadge label={status} kind={statusKindFromOrder(item, provider)} size="sm" />
                    </View>
                  </View>
                </PressableScale>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  storeText: { flex: 1, minWidth: 0 },
  syncNote: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  syncDisabled: { opacity: 0.6 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.huge },
  rowShell: { borderLeftWidth: 1, borderRightWidth: 1, overflow: "hidden" },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 68,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 1 },
  trailing: { alignItems: "flex-end", gap: 4 },
});
