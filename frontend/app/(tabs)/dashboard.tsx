import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getInvoices, getOrders, getProductStock } from "../../src/api";
import {
  formatTry,
  formatCompact,
  displayOrderNo,
  displayOrderStatus,
  statusKindFromOrder,
  relativeDateLabel,
  orderTimestamp,
} from "../../src/utils";
import { KPICard, PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { Sparkline, AnimatedNumber } from "../../src/components/Charts";
import { ArrowRightIcon, InboxIcon, PackageIcon, WalletIcon, ZapIcon, SparkleIcon, TrendUpIcon, TrendDownIcon } from "../../src/components/Icons";
import type { Invoice, Order } from "../../src/types";

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
    last30Revenue: 0,
    todayOrders: 0,
  });

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const last30Start = new Date(now);
      last30Start.setDate(now.getDate() - 30);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [invoiceResp, orderList, stockResp] = await Promise.all([
        getInvoices(token, { page: 1, perPage: 600 }).catch(() => ({ invoices: [] as Invoice[] })),
        getOrders(token, undefined, { page: 1, perPage: 200, sortBy: "-created_at" }).catch(() => [] as Order[]),
        getProductStock(token, { page: 1, perPage: 500 }).catch(() => ({ products: [] as any[] })),
      ]);

      const invoices: Invoice[] = Array.isArray((invoiceResp as any)?.invoices)
        ? (invoiceResp as any).invoices
        : Array.isArray(invoiceResp) ? (invoiceResp as any) : [];

      // Month invoices
      const monthInvoices = invoices.filter((inv) => {
        const d = new Date(String(inv.issue_date || ""));
        return !Number.isNaN(d.getTime()) && d >= monthStart;
      });
      const monthRevenue = monthInvoices.reduce(
        (s, inv) => s + Number(inv.display_gross_total || inv.gross_total || inv.net_total || 0),
        0
      );

      // 30-day daily revenue from invoices
      const dayKeys: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        dayKeys.push(d.toISOString().slice(0, 10));
      }
      const dayMap: Record<string, number> = {};
      dayKeys.forEach((k) => (dayMap[k] = 0));
      let last30 = 0;
      for (const inv of invoices) {
        const dKey = String(inv.issue_date || "").slice(0, 10);
        if (dayMap[dKey] !== undefined) {
          const amt = Number(inv.display_gross_total || inv.gross_total || inv.net_total || 0);
          dayMap[dKey] += amt;
          last30 += amt;
        }
      }
      const sparkArr = dayKeys.map((k) => dayMap[k]);
      const half = Math.floor(sparkArr.length / 2);
      const first = sparkArr.slice(0, half).reduce((a, b) => a + b, 0);
      const second = sparkArr.slice(half).reduce((a, b) => a + b, 0);
      const trendPct = first > 0 ? ((second - first) / first) * 100 : second > 0 ? 100 : 0;

      // Orders
      const list = Array.isArray(orderList) ? orderList : [];
      const monthOrders = list.filter((o: any) => {
        const ts = orderTimestamp(o);
        return ts > 0 && new Date(ts) >= monthStart;
      });
      const todayOrders = list.filter((o: any) => {
        const ts = orderTimestamp(o);
        return ts > 0 && new Date(ts) >= todayStart;
      }).length;
      const pendingOrders = monthOrders.filter((o) => {
        const k = statusKindFromOrder(o);
        return k === "warning" || k === "info";
      }).length;

      // Stock
      const products = Array.isArray((stockResp as any)?.products) ? (stockResp as any).products : [];
      const lowStock = products.filter((p: any) => Number(p?.stock || 0) > 0 && Number(p?.stock || 0) <= 10).length;

      setStats({
        monthlyOrders: monthOrders.length,
        monthlyRevenue: monthRevenue,
        lowStock,
        pendingOrders,
        recentOrders: list.slice(0, 6),
        spark: sparkArr,
        trendPct,
        last30Revenue: last30,
        todayOrders,
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

  const todayLabel = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dashboard-screen">
      <AppTopBar />
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
              <Text style={styles.heroChipText}>SON 30 GÜN</Text>
            </View>
            <View style={[styles.trendChip, { backgroundColor: stats.trendPct >= 0 ? "rgba(34,197,94,0.18)" : "rgba(248,113,113,0.18)" }]}>
              {stats.trendPct >= 0 ? <TrendUpIcon size={11} color="#22C55E" /> : <TrendDownIcon size={11} color="#F87171" />}
              <Text style={{ color: stats.trendPct >= 0 ? "#22C55E" : "#F87171", fontSize: 11, fontWeight: "800" }}>
                {`${stats.trendPct >= 0 ? "+" : ""}${stats.trendPct.toFixed(1)}%`}
              </Text>
            </View>
          </View>

          <Text style={styles.heroLabel}>Toplam Ciro</Text>
          <AnimatedNumber
            testID="dash-30day-revenue"
            value={stats.last30Revenue}
            format={(n) => formatTry(n)}
            style={styles.heroValue}
          />

          <View style={{ marginTop: spacing.xs, marginBottom: 4 }}>
            <Sparkline
              data={stats.spark.length ? stats.spark : [0, 0]}
              width={320}
              height={56}
              color="#60A5FA"
              fillOpacity={0.35}
            />
          </View>

          <View style={styles.heroFoot}>
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>Bugün</Text>
              <Text style={styles.heroFootValue}>{stats.todayOrders}</Text>
            </View>
            <View style={styles.heroFootDivider} />
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>Bu Ay Sip.</Text>
              <Text style={styles.heroFootValue}>{stats.monthlyOrders}</Text>
            </View>
            <View style={styles.heroFootDivider} />
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>Bu Ay Ciro</Text>
              <Text style={styles.heroFootValue}>{formatCompact(stats.monthlyRevenue)}₺</Text>
            </View>
          </View>
        </SafeAnimatedView>

        {/* KPI grid */}
        <View style={styles.kpiRow}>
          <KPICard
            label="Bekleyen Sipariş"
            value={String(stats.pendingOrders)}
            hint="aksiyon bekliyor"
            index={0}
            accent={colors.warning}
            onPress={() => router.push("/(tabs)/integrations")}
            testID="kpi-pending-orders"
          />
          <KPICard
            label="Düşük Stok"
            value={String(stats.lowStock)}
            hint="≤ 10 adet"
            index={1}
            accent={colors.error}
            testID="kpi-low-stock"
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
              const provider = String((o as any)?.integration_provider || (o as any)?.provider || o.channel || "");
              const kind = statusKindFromOrder(o, provider);
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
