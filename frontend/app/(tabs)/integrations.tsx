import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { TabHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getIntegrations, getOrders } from "../../src/api";
import { providerLabel, isNewOrderStatus, statusKindFromOrder } from "../../src/utils";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { PressableScale } from "../../src/components/KPICard";
import { ArrowRightIcon, PlugIcon, InboxIcon, TruckIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import type { Integration, Order } from "../../src/types";

type IntegCache = { list: Integration[]; orderCounts: Record<string, { all: number; pending: number; shipped: number }> };

export default function IntegrationsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [list, setList] = useState<Integration[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, { all: number; pending: number; shipped: number }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    if (!silent) {
      const cached = await loadCache<IntegCache>("integrations_cache");
      if (cached) {
        setList(cached.list);
        setOrderCounts(cached.orderCounts);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const [data, orders] = await Promise.all([
        getIntegrations(token),
        getOrders(token, undefined, { page: 1, perPage: 200, sortBy: "-created_at" }).catch(() => [] as Order[]),
      ]);
      const intList = Array.isArray(data) ? data : [];
      setList(intList);
      const counts: Record<string, { all: number; pending: number; shipped: number }> = {};
      for (const o of (orders || [])) {
        const intId = String(o.integration_id || "");
        if (!intId) continue;
        if (!counts[intId]) counts[intId] = { all: 0, pending: 0, shipped: 0 };
        counts[intId].all += 1;
        const provider = String(o.integration_provider || o.provider || o.channel || "");
        if (isNewOrderStatus(o, provider)) counts[intId].pending += 1;
        if (statusKindFromOrder(o, provider) === "info") counts[intId].shipped += 1;
      }
      setOrderCounts(counts);
      setIsOffline(false);
      await saveCache("integrations_cache", { list: intList, orderCounts: counts });
    } catch {
      if (list.length === 0 && !silent) {
        const cached = await loadCache<IntegCache>("integrations_cache");
        if (cached) { setList(cached.list); setOrderCounts(cached.orderCounts); setIsOffline(true); }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusLoad(load, { hasData: list.length > 0 });

  useEffect(() => {
    load();
  }, [token]);

  const totalConnected = list.length;
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="integrations-screen">
      <TabHeader title="Mağazalar" eyebrow={`${totalConnected} bağlı mağaza`} />
      <NetworkErrorBanner visible={isOffline} offline />

      {loading ? (
        <ScrollView contentContainerStyle={styles.center} refreshControl={refreshControl}>
          <ActivityIndicator color={colors.primary} />
        </ScrollView>
      ) : list.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyWrap} refreshControl={refreshControl}>
          <EmptyState
            icon={<PlugIcon size={30} color={colors.textTertiary} />}
            title="Bağlı mağaza bulunamadı"
            description="Trendyol, Hepsiburada, n11 veya WooCommerce mağazalarınızı ObiHub web panelinden bağlayın."
          />
        </ScrollView>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          renderItem={({ item, index }) => {
            const provider = String(item.provider || item.name || "");
            const counts = orderCounts[item.id] || { all: 0, pending: 0, shipped: 0 };
            const name = item.name || providerLabel(provider);
            return (
              <SafeAnimatedView entering={FadeInDown.delay(index * 50).springify().damping(18)}>
                <PressableScale
                  testID={`integration-${item.id}`}
                  onPress={() => router.push({ pathname: "/integrations/[id]", params: { id: item.id, provider } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${providerLabel(provider)}, bağlı, ${counts.pending} bekleyen, ${counts.shipped} kargoda`}
                >
                  <Card style={styles.card}>
                    <PlatformLogo provider={provider} size="md" />
                    <View style={styles.cardBody}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <View style={styles.metaRow}>
                        <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                        <Text style={[type.footnote, styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                          {providerLabel(provider)} · Bağlı
                        </Text>
                      </View>
                      <View style={styles.badgeRow}>
                        <View style={[styles.badge, { backgroundColor: colors.warningBg }]}>
                          <InboxIcon size={12} color={colors.warning} />
                          <Text style={[type.caption, tabular, { color: colors.textPrimary }]} numberOfLines={1}>
                            {counts.pending} bekleyen
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                          <TruckIcon size={12} color={colors.primary} />
                          <Text style={[type.caption, tabular, { color: colors.textPrimary }]} numberOfLines={1}>
                            {counts.shipped} kargoda
                          </Text>
                        </View>
                      </View>
                    </View>
                    <ArrowRightIcon size={16} color={colors.textTertiary} />
                  </Card>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { paddingTop: spacing.lg, paddingBottom: spacing.huge },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: spacing.huge },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, minHeight: 64 },
  cardBody: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  metaText: { flex: 1, minWidth: 0 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.xs },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 3 },
});
