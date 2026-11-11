import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getOrders, getProductStock } from "../../src/api";
import {
  formatTry,
  formatCompact,
  displayOrderNo,
  getOrderTrackingNo,
  isNewOrderStatus,
  statusKindFromOrder,
  relativeDateLabel,
  orderTimestamp,
} from "../../src/utils";
import { localDateKey } from "../../src/components/reports/reportUtils";
import { KPICard, PressableScale } from "../../src/components/KPICard";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { Sparkline, AnimatedNumber } from "../../src/components/Charts";
import { ArrowRightIcon, InboxIcon, PackageIcon, ZapIcon, SparkleIcon, ClockIcon, TruckIcon, CheckIcon, CloseIcon } from "../../src/components/Icons";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { DashboardSkeleton } from "../../src/components/Skeleton";
import { saveCache, loadCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import type { Order } from "../../src/types";

type DashStats = {
  currentMonthOrders: number;
  currentMonthRevenue: number;
  previousMonthOrders: number;
  previousMonthRevenue: number;
  lowStock: number;
  shippedOrders: number;
  pendingOrders: number;
  recentOrders: Order[];
  sparkCurrentMonth: number[];
  sparkPreviousMonth: number[];
  todayOrders: number;
  todayRevenue: number;
};

const EMPTY_STATS: DashStats = {
  currentMonthOrders: 0,
  currentMonthRevenue: 0,
  previousMonthOrders: 0,
  previousMonthRevenue: 0,
  lowStock: 0,
  shippedOrders: 0,
  pendingOrders: 0,
  recentOrders: [],
  sparkCurrentMonth: [],
  sparkPreviousMonth: [],
  todayOrders: 0,
  todayRevenue: 0,
};

export default function DashboardScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [monthView, setMonthView] = useState<"current" | "previous">("current");
  const [stats, setStats] = useState<DashStats>(EMPTY_STATS);

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    // Önce cache'den yükle — ağ başarısız olursa gösterilecek
    if (!silent) {
      const cached = await loadCache<DashStats>("dashboard_stats");
      if (cached) {
        setStats(cached);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let fetchFailed = false;
      const [orderList, stockResp] = await Promise.all([
        getOrders(token, undefined, { page: 1, perPage: 500, sortBy: "-order_date" }).catch(() => { fetchFailed = true; return [] as Order[]; }),
        getProductStock(token, { page: 1, perPage: 500 }).catch(() => { fetchFailed = true; return { products: [] as Array<{ id?: string; stock?: number }> }; }),
      ]);
      setNetworkError(fetchFailed);

      const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const curKeys: string[] = [];
      const prevKeys: string[] = [];
      for (let i = 1; i <= monthDays; i++) curKeys.push(localDateKey(new Date(now.getFullYear(), now.getMonth(), i)));
      for (let i = 1; i <= prevMonthDays; i++) prevKeys.push(localDateKey(new Date(now.getFullYear(), now.getMonth() - 1, i)));
      const curMap: Record<string, number> = {};
      const prevMap: Record<string, number> = {};
      curKeys.forEach((k) => (curMap[k] = 0));
      prevKeys.forEach((k) => (prevMap[k] = 0));

      // Orders — revenue + spark charts from order data
      const list = Array.isArray(orderList) ? orderList : [];
      const monthOrders = list.filter((o) => {
        const ts = orderTimestamp(o);
        return ts > 0 && new Date(ts) >= monthStart;
      });
      const previousMonthOrders = list.filter((o) => {
        const ts = orderTimestamp(o);
        if (ts <= 0) return false;
        const d = new Date(ts);
        return d >= prevMonthStart && d <= prevMonthEnd;
      });
      const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const prevMonthRevenue = previousMonthOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

      for (const o of list) {
        const ts = orderTimestamp(o);
        if (ts <= 0) continue;
        const dKey = localDateKey(new Date(ts));
        const amt = Number(o.total_amount || 0);
        if (curMap[dKey] !== undefined) curMap[dKey] += amt;
        if (prevMap[dKey] !== undefined) prevMap[dKey] += amt;
      }

      const todayList = list.filter((o) => {
        const ts = orderTimestamp(o);
        return ts > 0 && new Date(ts) >= todayStart;
      });
      const todayOrders = todayList.length;
      const todayRevenue = todayList.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const pendingOrders = list.filter((o) => {
        const provider = String(o.integration_provider || o.provider || o.channel || "");
        return isNewOrderStatus(o, provider);
      }).length;

      // Stock
      const products = stockResp.products ?? [];
      const lowStock = products.filter((p) => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= 10).length;
      const shippedOrders = list.filter((o) => {
        const provider = String(o.integration_provider || o.provider || o.channel || "");
        return statusKindFromOrder(o, provider) === "info";
      }).length;

      const sparkCurrentMonth = curKeys.map((k) => curMap[k]);
      const sparkPreviousMonth = prevKeys.map((k) => prevMap[k]);

      const newStats: DashStats = {
        currentMonthOrders: monthOrders.length,
        currentMonthRevenue: monthRevenue,
        previousMonthOrders: previousMonthOrders.length,
        previousMonthRevenue: prevMonthRevenue,
        lowStock,
        shippedOrders,
        pendingOrders,
        recentOrders: list.slice(0, 6),
        sparkCurrentMonth,
        sparkPreviousMonth,
        todayOrders,
        todayRevenue,
      };
      setStats(newStats);
      setIsOffline(false);
      setNetworkError(false);
      await saveCache("dashboard_stats", newStats);
    } catch {
      // Ağ hatası — cache zaten yukarıda yüklendi, sadece hata bayrağı koy
      if (stats.recentOrders.length === 0 && !silent) setNetworkError(true);
    }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusLoad(load, { hasData: stats.recentOrders.length > 0 || stats.currentMonthOrders > 0 });

  useEffect(() => {
    load();
  }, [token]);

  const todayLabel = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dashboard-screen">
      <AppTopBar />
      <NetworkErrorBanner visible={networkError} />
      <NetworkErrorBanner visible={isOffline && !networkError} offline />
      {loading ? (
        <ScrollView contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 120 }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
            <View style={{ height: 13, marginBottom: 6 }} />
            <View style={{ height: 32, marginBottom: spacing.sm }} />
          </View>
          <DashboardSkeleton />
        </ScrollView>
      ) : (
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />
        }
      >
        <SafeAnimatedView entering={FadeInDown.duration(450)} style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{todayLabel.toUpperCase()}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Hızlı bakış</Text>
        </SafeAnimatedView>

        {/* Hero gradient revenue card with sparkline */}
        <SafeAnimatedView entering={FadeIn.delay(80).duration(500)} style={[styles.heroCard, shadows.lg]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
              <Defs>
                <LinearGradient id="dashHero" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#1E3A8A" stopOpacity="0.95" />
                  <Stop offset="1" stopColor="#0B1220" stopOpacity="1" />
                </LinearGradient>
                <LinearGradient id="dashGlow" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#60A5FA" stopOpacity="0.35" />
                  <Stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d="M0,0 L360,0 L360,200 L0,200Z" fill="url(#dashHero)" />
              <Path d="M0,0 L360,0 L360,80 L0,160 Z" fill="url(#dashGlow)" opacity={0.6} />
            </Svg>
          </View>
          <View style={styles.heroTopRow}>
            <View style={styles.heroChip}>
              <SparkleIcon size={11} color="#93C5FD" />
              <Text style={styles.heroChipText}>{monthView === "current" ? "BU AY" : "GEÇEN AY"}</Text>
            </View>
            <PressableScale
              onPress={() => setMonthView((p) => (p === "current" ? "previous" : "current"))}
              style={[styles.trendChip, { backgroundColor: "rgba(255,255,255,0.12)" }]}
            >
              <Text style={{ color: "#BFDBFE", fontSize: 11, fontWeight: "800" }}>
                {monthView === "current" ? "Geçen Ay" : "Bu Ay"}
              </Text>
            </PressableScale>
          </View>

          <Text style={styles.heroLabel}>{monthView === "current" ? "Bu Ay Ciro" : "Geçen Ay Ciro"}</Text>
          <AnimatedNumber
            testID="dash-30day-revenue"
            value={monthView === "current" ? stats.currentMonthRevenue : stats.previousMonthRevenue}
            format={(n) => formatTry(n)}
            style={styles.heroValue}
          />

          <View style={{ marginTop: spacing.xs, marginBottom: 4 }}>
            <Sparkline
              data={monthView === "current" ? (stats.sparkCurrentMonth.length ? stats.sparkCurrentMonth : [0, 0]) : (stats.sparkPreviousMonth.length ? stats.sparkPreviousMonth : [0, 0])}
              width={320}
              height={56}
              color="#60A5FA"
              fillOpacity={0.35}
              showAxis
              axisFormatter={(n) => `${formatCompact(n)}₺`}
            />
          </View>

          <View style={styles.heroFoot}>
            <View style={[styles.heroFootCell, styles.heroFootTodayCell]}>
              <View style={styles.heroFootTodayRow}>
                <View style={styles.liveIndicator} />
                <Text style={[styles.heroFootLabel, styles.heroFootTodayLabel]}>BUGÜN</Text>
              </View>
              <Text style={[styles.heroFootValue, styles.heroFootTodayValue]}>{stats.todayOrders} sip.</Text>
              {stats.todayRevenue > 0 && (
                <Text style={{ color: "#4ADE80", fontSize: 11, fontWeight: "700", marginTop: 1 }}>
                  {formatCompact(stats.todayRevenue)}₺
                </Text>
              )}
            </View>
            <View style={styles.heroFootDivider} />
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>{monthView === "current" ? "Bu Ay Sip." : "Geçen Ay Sip."}</Text>
              <Text style={styles.heroFootValue}>{monthView === "current" ? stats.currentMonthOrders : stats.previousMonthOrders}</Text>
            </View>
            <View style={styles.heroFootDivider} />
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>{monthView === "current" ? "Bu Ay Ciro" : "Geçen Ay Ciro"}</Text>
              <Text style={styles.heroFootValue}>{formatCompact(monthView === "current" ? stats.currentMonthRevenue : stats.previousMonthRevenue)}₺</Text>
            </View>
          </View>
        </SafeAnimatedView>

        {/* KPI grid */}
        <View style={styles.kpiRow}>
          <KPICard
            label="BEKLEYEN SİPARİŞ"
            value={String(stats.pendingOrders)}
            hint="aksiyon bekliyor"
            index={0}
            onPress={() => router.push("/orders/pending")}
            testID="kpi-pending-orders"
          />
          <KPICard
            label="KARGODAKİ SİPARİŞLER"
            value={String(stats.shippedOrders)}
            hint="kargoya verilmiş"
            index={1}
            onPress={() => router.push("/orders/shipped")}
            testID="kpi-shipped-orders"
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
              const provider = String(o.integration_provider || o.provider || o.channel || "");
              const kind = statusKindFromOrder(o, provider);
              const trackingNo = getOrderTrackingNo(o);
              return (
                <SafeAnimatedView key={o.id} entering={FadeInDown.delay(idx * 60).springify().damping(18)}>
                  <PressableScale
                    testID={`recent-order-${o.id}`}
                    onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id, provider } })}
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
                      {trackingNo ? (
                        <Text style={[styles.orderCustomer, { color: colors.textTertiary, marginTop: 3 }]} numberOfLines={2}>
                          Kargo Takip: {trackingNo}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.orderAmount, { color: colors.textPrimary }]}>{formatTry(o.total_amount || 0)}</Text>
                      <StatusIconBadge kind={kind} />
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
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, backgroundColor: "rgba(96,165,250,0.18)" },
  heroChipText: { color: "#BFDBFE", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  trendChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999 },
  heroLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  heroValue: { color: "#FFFFFF", fontSize: 38, fontWeight: "800", letterSpacing: -1.4, marginTop: 2 },
  heroFoot: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  heroFootCell: { flex: 1, alignItems: "center" },
  heroFootDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.1)" },
  heroFootLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  heroFootValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  heroFootTodayCell: { alignItems: "center" },
  heroFootTodayRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroFootTodayLabel: { color: "#4ADE80", letterSpacing: 0.8 },
  heroFootTodayValue: { color: "#4ADE80", fontSize: 22, letterSpacing: -0.8 },
  liveIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
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
  orderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1 },
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

function StatusIconBadge({ kind }: { kind: "success" | "info" | "warning" | "error" | "neutral" }) {
  if (kind === "success") return <View style={[statusStyles.badge, { backgroundColor: "rgba(22,163,74,0.15)" }]}><CheckIcon size={14} color="#22C55E" /></View>;
  if (kind === "info") return <View style={[statusStyles.badge, { backgroundColor: "rgba(37,99,235,0.15)" }]}><TruckIcon size={14} color="#3B82F6" /></View>;
  if (kind === "warning") return <View style={[statusStyles.badge, { backgroundColor: "rgba(245,158,11,0.18)" }]}><ClockIcon size={14} color="#F59E0B" /></View>;
  if (kind === "error") return <View style={[statusStyles.badge, { backgroundColor: "rgba(239,68,68,0.15)" }]}><CloseIcon size={14} color="#EF4444" /></View>;
  return <View style={[statusStyles.badge, { backgroundColor: "rgba(148,163,184,0.16)" }]}><PackageIcon size={14} color="#94A3B8" /></View>;
}

const statusStyles = StyleSheet.create({
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
