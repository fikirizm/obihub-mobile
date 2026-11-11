import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getIntegrations, getOrders } from "../../src/api";
import { providerKey, providerLabel, providerColor, isNewOrderStatus, statusKindFromOrder } from "../../src/utils";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { PressableScale } from "../../src/components/KPICard";
import { ArrowRightIcon, PlugIcon, SparkleIcon, InboxIcon, TruckIcon } from "../../src/components/Icons";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import type { Integration, Order } from "../../src/types";

type IntegCache = { list: Integration[]; orderCounts: Record<string, { all: number; pending: number; shipped: number }> };

export default function IntegrationsScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
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

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="integrations-screen">
      <AppTopBar />
      <NetworkErrorBanner visible={isOffline} offline />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>BAĞLI MAĞAZALAR</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Entegrasyonlar</Text>
      </View>

      {/* Premium hero overview */}
      <SafeAnimatedView entering={FadeInDown.duration(400)} style={[styles.heroCard, shadows.lg]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%" viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <LinearGradient id="intHero" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#0F172A" stopOpacity="1" />
                <Stop offset="1" stopColor="#1E3A8A" stopOpacity="0.95" />
              </LinearGradient>
              <LinearGradient id="intGlow" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#60A5FA" stopOpacity="0.3" />
                <Stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d="M0,0 L360,0 L360,140 L0,140Z" fill="url(#intHero)" />
            <Path d="M0,0 L360,0 L360,90 L0,140 Z" fill="url(#intGlow)" />
          </Svg>
        </View>
        <View style={styles.heroContent}>
          <View style={styles.heroLeft}>
            <View style={styles.heroChip}>
              <SparkleIcon size={11} color="#93C5FD" />
              <Text style={styles.heroChipText}>HEPSİ TEK PANELDE</Text>
            </View>
            <Text style={styles.heroTitle}>{totalConnected} Aktif Mağaza</Text>
            <Text style={styles.heroSub}>Sipariş yönetmek için bir mağaza seç ve detaya in.</Text>
          </View>
          <View style={styles.heroLogos}>
            {(["trendyol", "hepsiburada", "n11", "woo"] as const).slice(0, 4).map((p, i) => (
              <View key={p} style={[styles.heroLogoWrap, { transform: [{ translateX: i * -10 }] }]}>
                <PlatformLogo provider={p} size="sm" />
              </View>
            ))}
          </View>
        </View>
      </SafeAnimatedView>

      {loading ? (
        <ScrollView
          contentContainerStyle={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        >
          <ActivityIndicator color={colors.primary} />
        </ScrollView>
      ) : list.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        >
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
            <PlugIcon size={26} color={colors.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Entegrasyon bulunamadı</Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            Trendyol, Hepsiburada, n11 veya WooCommerce mağazalarını ObiHub web panelinden bağla.
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(it) => it.id}
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
          renderItem={({ item, index }) => {
            const provider = String(item.provider || item.name || "");
            const accent = providerColor(provider, colors.primary);
            const counts = orderCounts[item.id] || { all: 0, pending: 0, shipped: 0 };
            return (
              <SafeAnimatedView entering={FadeInDown.delay(index * 50).springify().damping(18)}>
                <PressableScale
                  testID={`integration-${item.id}`}
                  onPress={() => router.push({ pathname: "/integrations/[id]", params: { id: item.id, provider } })}
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                    shadows.sm,
                  ]}
                >
                  <View style={[styles.cardAccent, { backgroundColor: accent }]} />
                  <View style={styles.cardLeft}>
                    <PlatformLogo provider={provider} size="md" />
                    <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                      <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name || providerLabel(provider)}
                      </Text>
                      <View style={styles.cardMetaRow}>
                        <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                        <Text style={[styles.cardMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                          {providerLabel(provider)} · Bağlı
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.countsWrap}>
                    <View style={[styles.countPill, { backgroundColor: colors.warningBg }]}>
                      <InboxIcon size={12} color={colors.warning} />
                      <Text style={[styles.countPillText, { color: colors.warning }]}>{counts.pending}</Text>
                    </View>
                    <View style={[styles.countPill, { backgroundColor: colors.primarySoft }]}>
                      <TruckIcon size={12} color={colors.primary} />
                      <Text style={[styles.countPillText, { color: colors.primary }]}>{counts.shipped}</Text>
                    </View>
                  </View>
                  <ArrowRightIcon size={18} color={colors.textTertiary} />
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
  title: { fontSize: 28, fontWeight: fontWeight.bold, letterSpacing: -0.7, marginTop: 2, marginBottom: spacing.sm },
  heroCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    overflow: "hidden",
    minHeight: 130,
  },
  heroContent: {
    padding: spacing.md,
    paddingVertical: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  heroLeft: { flex: 1 },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(96,165,250,0.18)",
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  heroChipText: { color: "#BFDBFE", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  heroTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.7 },
  heroSub: { color: "#94A3B8", fontSize: 12, fontWeight: "500", marginTop: 4 },
  heroLogos: { flexDirection: "row", alignItems: "center", paddingLeft: 30 },
  heroLogoWrap: {
    borderWidth: 2,
    borderColor: "#0F172A",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    gap: 8,
  },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  cardName: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cardMeta: { fontSize: 12, fontWeight: "500" },
  countsWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  countPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 4 },
  countPillText: { fontSize: 11.5, fontWeight: "800", letterSpacing: -0.1, minWidth: 14, textAlign: "center" },
  emptyWrap: { alignItems: "center", padding: spacing.xl, marginTop: spacing.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptyDesc: { fontSize: 13, textAlign: "center", paddingHorizontal: 28, lineHeight: 18, fontWeight: "500" },
});
