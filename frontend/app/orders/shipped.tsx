import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { getOrders } from "../../src/api";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { ArrowLeftIcon, TruckIcon } from "../../src/components/Icons";
import { displayOrderNo, displayOrderStatus, formatTry, getOrderTrackingNo, orderTimestamp, relativeDateLabel, statusKindFromOrder } from "../../src/utils";
import { radius, spacing } from "../../src/theme/tokens";
import { OrderCardSkeleton } from "../../src/components/Skeleton";
import { EmptyState } from "../../src/components/EmptyState";
import { useLastUpdated } from "../../src/hooks/useLastUpdated";
import { saveCache, loadCache } from "../../src/offlineCache";
import type { Order } from "../../src/types";

export default function ShippedOrdersScreen() {
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const { markUpdated, label: lastUpdatedLabel } = useLastUpdated();

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const list = await getOrders(token, undefined, { page: 1, perPage: 300, sortBy: "-created_at" });
      const data = Array.isArray(list) ? list : [];
      setOrders(data);
      setIsOffline(false);
      await saveCache("shipped_orders", data);
    } catch {
      const cached = await loadCache<Order[]>("shipped_orders");
      if (cached && cached.length > 0) {
        setOrders(cached);
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      markUpdated();
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const filtered = useMemo(
    () =>
      orders
        .filter((o) => {
          const provider = String(o.integration_provider || o.provider || o.channel || "");
          return statusKindFromOrder(o, provider) === "info";
        })
        .sort((a, b) => orderTimestamp(b) - orderTimestamp(a)),
    [orders]
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
        >
          <ArrowLeftIcon size={18} color={colors.textPrimary} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Kargodaki Siparişler</Text>
          <Text style={{ color: isOffline ? colors.warning : colors.textTertiary, fontSize: 12 }}>
            {filtered.length} kayıt{isOffline ? " · Çevrimdışı (önbellek)" : lastUpdatedLabel ? ` · ${lastUpdatedLabel}` : ""}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[0, 1, 2, 3, 4].map((i) => <OrderCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 32 }}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={<TruckIcon size={30} color={colors.textTertiary} />}
              title="Kargoda sipariş yok"
              description="Şu an kargoya verilmiş sipariş bulunmuyor. Kargolanan siparişler burada listelenir."
            />
          }
          renderItem={({ item, index }) => {
            const provider = String(item.integration_provider || item.provider || item.channel || "");
            const trackingNo = getOrderTrackingNo(item);
            const isNewest = index === 0;
            return (
              <PressableScale
                onPress={() => router.push({ pathname: "/orders/[id]", params: { id: item.id, provider } })}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: isNewest ? colors.info : colors.borderSubtle },
                  isNewest ? shadows.md : shadows.sm,
                ]}
              >
                {isNewest && <View style={[styles.newestAccent, { backgroundColor: colors.info }]} />}
                <PlatformLogo provider={provider} size="sm" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>#{displayOrderNo(item)}</Text>
                    {isNewest && (
                      <View style={[styles.newBadge, { backgroundColor: colors.info }]}>
                        <Text style={styles.newBadgeText}>SON</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{item.customer_name || "-"} · {relativeDateLabel(item)}</Text>
                  {trackingNo ? (
                    <Text style={{ color: colors.textTertiary, fontSize: 11.5, fontWeight: "600", marginTop: 4 }} numberOfLines={1}>
                      Kargo Takip: {trackingNo}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>{formatTry(item.total_amount || 0)}</Text>
                  <StatusBadge label={displayOrderStatus(item, provider)} kind="info" size="sm" />
                </View>
              </PressableScale>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 10 },
  title: { fontSize: 17, fontWeight: "800" },
  iconBtn: { width: 40, height: 40, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  newestAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  newBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  newBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
});

