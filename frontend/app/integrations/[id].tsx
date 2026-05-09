import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getIntegrations, getOrders, syncIntegrationOrders } from "../../src/api";
import {
  displayOrderNo,
  displayOrderStatus,
  formatTry,
  orderTimestamp,
  providerKey,
  providerLabel,
  providerColor,
  relativeDateLabel,
  statusKindFromOrder,
} from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { ArrowLeftIcon, RefreshIcon, SearchIcon } from "../../src/components/Icons";
import type { Integration, Order } from "../../src/types";

const SYNC_COOLDOWN_MS = 60_000;

export default function IntegrationOrders() {
  const params = useLocalSearchParams<{ id: string; provider?: string }>();
  const integrationId = String(params.id || "");
  const providerHint = String(params.provider || "");
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [tickNow, setTickNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async (silent = false) => {
    if (!token || !integrationId) return;
    if (!silent) setLoading(true);
    try {
      const [list, ints] = await Promise.all([
        getOrders(token, integrationId, { page: 1, perPage: 200, sortBy: "-created_at" }),
        getIntegrations(token).catch(() => [] as Integration[]),
      ]);
      setOrders(Array.isArray(list) ? list : []);
      const found = (ints || []).find((i) => i.id === integrationId) || null;
      setIntegration(found);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
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
  const accent = providerColor(provider, colors.primary);
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
      Alert.alert("Senkronizasyon", "Yeni siparişler güncellendi.");
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Senkronizasyon başarısız.");
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerRow}>
        <PressableScale
          testID="back-btn"
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
        >
          <ArrowLeftIcon size={18} color={colors.textPrimary} />
        </PressableScale>
        <View style={styles.headerCenter}>
          <PlatformLogo provider={provider} size="sm" />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {integration?.name || providerLabel(provider) || "Mağaza"}
            </Text>
            <Text style={[styles.headerSub, { color: colors.textTertiary }]} numberOfLines={1}>
              {filtered.length} sipariş
            </Text>
          </View>
        </View>
        <PressableScale
          testID="sync-btn"
          onPress={handleSync}
          disabled={syncBusy || remainingMs > 0}
          style={[
            styles.syncBtn,
            { backgroundColor: accent },
            shadows.primary,
            (syncBusy || remainingMs > 0) && { opacity: 0.6 },
          ]}
        >
          {syncBusy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <RefreshIcon size={14} color="#FFFFFF" />
              <Text style={styles.syncBtnText}>{cooldownText || "Senkron"}</Text>
            </>
          )}
        </PressableScale>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: searchFocus ? colors.primary : colors.borderSubtle }]}>
        <SearchIcon size={18} color={colors.textTertiary} />
        <TextInput
          testID="orders-search"
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          placeholder="Sipariş no veya müşteri ara..."
          placeholderTextColor={colors.textTertiary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
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
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Sipariş bulunamadı</Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                Arama veya senkronize işlemiyle güncel siparişleri çek.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const kind = statusKindFromOrder(item, provider);
            return (
              <SafeAnimatedView entering={FadeInDown.delay(index * 30).springify().damping(18)}>
                <PressableScale
                  testID={`order-${item.id}`}
                  onPress={() => router.push({ pathname: "/orders/[id]", params: { id: item.id, provider } })}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.orderNo, { color: colors.textPrimary }]} numberOfLines={1}>
                      #{displayOrderNo(item)}
                    </Text>
                    <StatusBadge label={displayOrderStatus(item, provider)} kind={kind} size="sm" />
                  </View>
                  <Text style={[styles.dateLine, { color: colors.textTertiary }]}>{relativeDateLabel(item)}</Text>
                  <View style={styles.bottomRow}>
                    <Text style={[styles.customer, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.customer_name || "Müşteri"}
                    </Text>
                    <Text style={[styles.amount, { color: colors.textPrimary }]}>{formatTry(item.total_amount || 0)}</Text>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 10,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  headerSub: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", marginTop: 2 },
  syncBtn: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  syncBtnText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "700", letterSpacing: -0.1 },
  searchWrap: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    height: 44,
    marginBottom: spacing.xs,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "500" },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  dateLine: { fontSize: 11.5, fontWeight: "600", letterSpacing: 0.2 },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  customer: { fontSize: 13, fontWeight: "600", flex: 1, paddingRight: 8 },
  amount: { fontSize: 14, fontWeight: "800" },
  emptyWrap: { alignItems: "center", padding: spacing.xl, marginTop: spacing.lg, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  emptyDesc: { fontSize: 12.5, textAlign: "center", paddingHorizontal: 28, fontWeight: "500" },
});
