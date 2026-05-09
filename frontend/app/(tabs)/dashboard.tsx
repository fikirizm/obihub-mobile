import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getOrders, getProductStock, getSalesReportsOverview } from "../../src/api";
import {
  formatTry,
  formatCompact,
  displayOrderNo,
  displayOrderStatus,
  statusKindFromOrder,
  relativeDateLabel,
} from "../../src/utils";
import { KPICard, PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { Sparkline } from "../../src/components/Charts";
import { ArrowRightIcon, InboxIcon, PackageIcon, WalletIcon, ZapIcon, SparkleIcon } from "../../src/components/Icons";
import type { Order } from "../../src/types";

export default function DashboardScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    monthlyOrders: 0,
    monthlyRevenue: 0,
    lowStock: 0,
    pendingOrders: 0,
    recentOrders: [] as Order[],
    spark: [] as number[],
    trendPct: 0,
  });

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const [overview, ordersList, stockResp] = await Promise.all([
        getSalesReportsOverview(token, 30).catch(() => null),
        getOrders(token, undefined, { page: 1, perPage: 100, sortBy: "-created_at" }).catch(() => [] as Order[]),
        getProductStock(token, { page: 1, perPage: 200 }).catch(() => null),
      ]);

      const monthlyOrders = Number(overview?.total_orders || 0);
      const monthlyRevenue = Number(overview?.total_revenue || 0);
      const lowStock = Array.isArray((stockResp as any)?.products)
        ? (stockResp as any).products.filter((p: any) => Number(p?.stock || 0) <= 5).length
        : 0;

      const list = Array.isArray(ordersList) ? ordersList : [];
      const pendingOrders = list.filter((o) => {
        const k = statusKindFromOrder(o);
        return k === "warning" || k === "info";
      }).length;

      const days = overview?.daily_sales || [];
      const sparkArr = days.map((d) => Number(d.revenue || 0));
      const half = Math.max(1, Math.floor(days.length / 2));
      const first = days.slice(0, half).reduce((a, b) => a + Number(b.revenue || 0), 0);
      const second = days.slice(half).reduce((a, b) => a + Number(b.revenue || 0), 0);
      const trendPct = first > 0 ? ((second - first) / first) * 100 : second > 0 ? 100 : 0;

      setStats({
        monthlyOrders,
        monthlyRevenue,
        lowStock,
        pendingOrders,
        recentOrders: list.slice(0, 6),
        spark: sparkArr,
        trendPct,
      });
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dashboard-screen">
      <AppTopBar />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
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
      >
        <SafeAnimatedView entering={FadeInDown.duration(400)} style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>BUGÜN</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Hızlı bakış</Text>
        </SafeAnimatedView>

        {/* Hero spark card */}
        <SafeAnimatedView
          entering={FadeIn.delay(80).duration(450)}
          style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.md]}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>30 GÜNLÜK CİRO</Text>
              <Text style={[styles.heroValue, { color: colors.textPrimary }]}>{formatTry(stats.monthlyRevenue)}</Text>
            </View>
            <View
              style={[
                styles.trendChip,
                { backgroundColor: stats.trendPct >= 0 ? colors.successBg : colors.errorBg },
              ]}
            >
              <Text style={{ color: stats.trendPct >= 0 ? colors.success : colors.error, fontSize: 11, fontWeight: "700" }}>
                {`${stats.trendPct >= 0 ? "▲" : "▼"} ${Math.abs(stats.trendPct).toFixed(1)}%`}
              </Text>
            </View>
          </View>
          <View style={styles.heroSpark}>
            <Sparkline
              data={stats.spark.length ? stats.spark : [0, 0]}
              width={300}
              height={60}
              color={colors.primary}
              fillOpacity={mode === "dark" ? 0.3 : 0.18}
            />
          </View>
        </SafeAnimatedView>

        {/* KPI grid 2x2 */}
        <View style={styles.kpiRow}>
          <KPICard
            label="Bu Ay Sipariş"
            value={formatCompact(stats.monthlyOrders)}
            hint="son 30 gün"
            index={0}
            accent={colors.primary}
            onPress={() => router.push("/(tabs)/reports")}
            testID="kpi-monthly-orders"
          />
          <KPICard
            label="Bu Ay Ciro"
            value={formatTry(stats.monthlyRevenue)}
            hint="net satış"
            index={1}
            accent={colors.success}
            onPress={() => router.push("/(tabs)/reports")}
            testID="kpi-monthly-revenue"
          />
        </View>
        <View style={styles.kpiRow}>
          <KPICard
            label="Düşük Stok"
            value={String(stats.lowStock)}
            hint="≤ 5 adet"
            index={2}
            accent={colors.warning}
            testID="kpi-low-stock"
          />
          <KPICard
            label="Bekleyen Sipariş"
            value={String(stats.pendingOrders)}
            hint="aksiyon bekliyor"
            index={3}
            accent={colors.info}
            onPress={() => router.push("/(tabs)/integrations")}
            testID="kpi-pending-orders"
          />
        </View>

        {/* Recent orders */}
        <SafeAnimatedView entering={FadeInUp.delay(220).duration(450)} style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <View style={styles.sectionHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Son Siparişler</Text>
              <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>{stats.recentOrders.length} kayıt</Text>
            </View>
            <PressableScale onPress={() => router.push("/(tabs)/integrations")} style={styles.allBtn}>
              <Text style={[styles.allBtnText, { color: colors.primary }]}>Tümü</Text>
              <ArrowRightIcon size={14} color={colors.primary} />
            </PressableScale>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : stats.recentOrders.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                <InboxIcon size={22} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Henüz sipariş yok</Text>
              <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
                Mağazaların eşitlendiğinde siparişler burada görünür.
              </Text>
            </View>
          ) : (
            stats.recentOrders.map((o, idx) => {
              const provider =
                String((o as any)?.integration_provider || (o as any)?.provider || o.channel || "");
              const kind = statusKindFromOrder(o, provider);
              return (
                <SafeAnimatedView key={o.id} entering={FadeInDown.delay(idx * 60).springify().damping(18)}>
                  <PressableScale
                    testID={`recent-order-${o.id}`}
                    onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id } })}
                    style={[styles.orderRow, { borderColor: colors.borderSubtle }]}
                  >
                    <PlatformLogo provider={provider} size="sm" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.orderNo, { color: colors.textPrimary }]} numberOfLines={1}>
                        #{displayOrderNo(o)}
                      </Text>
                      <Text style={[styles.orderCustomer, { color: colors.textTertiary }]} numberOfLines={1}>
                        {o.customer_name || "Müşteri"} · {relativeDateLabel(o)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.orderAmount, { color: colors.textPrimary }]}>{formatTry(o.total_amount || 0)}</Text>
                      <StatusBadge label={displayOrderStatus(o, provider)} kind={kind} size="sm" />
                    </View>
                  </PressableScale>
                </SafeAnimatedView>
              );
            })
          )}
        </SafeAnimatedView>

        {/* Quick actions */}
        <SafeAnimatedView entering={FadeInUp.delay(300).duration(450)} style={styles.actionRow}>
          <PressableScale
            onPress={() => router.push("/(tabs)/reports")}
            style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: colors.primarySoft }]}>
              <ZapIcon size={18} color={colors.primary} />
            </View>
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Detaylı Rapor</Text>
            <Text style={[styles.actionDesc, { color: colors.textTertiary }]}>Kanal & ürün analizi</Text>
          </PressableScale>
          <PressableScale
            onPress={() => router.push("/(tabs)/hepsijet")}
            style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: colors.hepsijetSoft }]}>
              <PackageIcon size={18} color={colors.hepsijet} />
            </View>
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Manuel Etiket</Text>
            <Text style={[styles.actionDesc, { color: colors.textTertiary }]}>HepsiJet kargo</Text>
          </PressableScale>
        </SafeAnimatedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: fontWeight.bold, letterSpacing: -0.6, marginTop: 2, marginBottom: spacing.sm },
  heroCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  heroValue: { fontSize: 26, fontWeight: "800", letterSpacing: -0.6, marginTop: 2 },
  trendChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  heroSpark: { marginTop: spacing.sm, alignItems: "center" },
  kpiRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sectionCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  sectionHint: { fontSize: 11, fontWeight: "600", marginTop: 2, letterSpacing: 0.3, textTransform: "uppercase" },
  allBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  allBtnText: { fontSize: 12.5, fontWeight: "700" },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  orderNo: { fontSize: 14, fontWeight: "700" },
  orderCustomer: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  orderAmount: { fontSize: 13, fontWeight: "700" },
  emptyWrap: { alignItems: "center", paddingVertical: spacing.lg, gap: 6 },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 4 },
  emptyTitle: { fontSize: 14, fontWeight: "700" },
  emptyDesc: { fontSize: 12, textAlign: "center", paddingHorizontal: 24, fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  actionCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 4 },
  actionIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  actionTitle: { fontSize: 14, fontWeight: "700" },
  actionDesc: { fontSize: 11, fontWeight: "500" },
});
