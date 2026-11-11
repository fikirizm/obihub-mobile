import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getDashboardStats, getOrdersPage, getSalesChart, getSmartAlerts } from "../../src/api";
import { formatCompact, formatTry } from "../../src/utils";
import { AnimatedNumber, Sparkline } from "../../src/components/Charts";
import { AlertIcon, BagIcon, InboxIcon, TruckIcon } from "../../src/components/Icons";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { OrderRow } from "../../src/components/OrderRow";
import { DashboardSkeleton } from "../../src/components/Skeleton";
import { loadCache, saveCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import { TabHeader } from "../../src/ui/Header";
import { Button } from "../../src/ui/Button";
import { SegmentedControl } from "../../src/ui/Chip";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { DashboardStats, Order, SalesChartPoint, SmartAlert } from "../../src/types";

type Range = "7" | "30";
type DashData = {
  stats: DashboardStats | null;
  chart: Record<Range, SalesChartPoint[]>;
  alerts: SmartAlert[];
  recent: Order[];
};

const EMPTY: DashData = { stats: null, chart: { "7": [], "30": [] }, alerts: [], recent: [] };
const CACHE_KEY = "dashboard_v2";

// Sunucudaki uyarı hedeflerinden mobilde karşılığı olanlar.
function alertTarget(path?: string): (() => void) | undefined {
  if (path === "/siparisler") return () => router.push({ pathname: "/(tabs)/orders", params: { filter: "pending" } });
  return undefined;
}

export default function DashboardScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState<DashData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>("7");

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) {
        const cached = await loadCache<DashData>(CACHE_KEY);
        if (cached?.stats) {
          setData(cached);
          setOffline(true);
          setLoading(false);
        }
      }
      try {
        // Rakamlar sunucuda hesaplanır; web paneliyle aynı uçlar kullanılır.
        const [stats, chart7, chart30, alerts, recent] = await Promise.all([
          getDashboardStats(token),
          getSalesChart(token, 7),
          getSalesChart(token, 30),
          getSmartAlerts(token).catch(() => []),
          getOrdersPage(token, { page: 1, perPage: 5 }).then((r) => r.items).catch(() => []),
        ]);
        const next: DashData = { stats, chart: { "7": chart7, "30": chart30 }, alerts, recent };
        setData(next);
        setOffline(false);
        setFailed(false);
        await saveCache(CACHE_KEY, next);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useFocusLoad(load, { hasData: Boolean(data.stats) });

  // Sunucunun günlük dizisi bugünü içermez; bugünün değeri özetten eklenir.
  const points = useMemo(() => {
    const base = data.chart[range];
    const today = new Date().toISOString().slice(0, 10);
    if (!data.stats || base.length === 0 || base[base.length - 1]?.date === today) return base;
    return [...base, { date: today, total: Number(data.stats.revenue_today || 0), count: Number(data.stats.orders_today || 0) }];
  }, [data, range]);
  const [chartWidth, setChartWidth] = useState(0);
  const periodRevenue = useMemo(() => points.reduce((s, p) => s + Number(p.total || 0), 0), [points]);
  const periodOrders = useMemo(() => points.reduce((s, p) => s + Number(p.count || 0), 0), [points]);
  const todayLabel = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const stats = data.stats;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dashboard-screen">
      <TabHeader title="Panel" subtitle={todayLabel} />
      <NetworkErrorBanner visible={offline && failed} offline />
      {loading ? (
        <ScrollView contentContainerStyle={{ paddingTop: spacing.sm }}>
          <DashboardSkeleton />
        </ScrollView>
      ) : !stats ? (
        <View style={styles.errorWrap}>
          <Text style={[type.headline, { color: colors.textPrimary, textAlign: "center" }]}>Panel yüklenemedi</Text>
          <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs }]}>
            İnternet bağlantınızı kontrol edip tekrar deneyin.
          </Text>
          <Button label="Tekrar dene" onPress={() => { setLoading(true); load(true); }} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        >
          {/* Bugün */}
          <View style={styles.hero} accessible accessibilityLabel={`Bugün ${formatTry(stats.revenue_today)} ciro, ${stats.orders_today} sipariş`}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="dashHero" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={colors.heroGradientEnd} />
                    <Stop offset="1" stopColor={colors.heroGradientStart} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#dashHero)" />
              </Svg>
            </View>
            <Text style={[type.caption, styles.heroLabel]}>Bugün</Text>
            <AnimatedNumber testID="dash-today-revenue" value={stats.revenue_today} format={(n) => formatTry(n)} style={[styles.heroValue, tabular]} />
            <Text style={[type.callout, styles.heroSub]}>{stats.orders_today} sipariş</Text>
          </View>

          {/* Yapılacaklar */}
          <SectionTitle title="Yapılacaklar" />
          <Card style={styles.block}>
            <ListRow
              testID="todo-pending"
              leading={<IconTile tint={colors.warningBg}><BagIcon size={18} color={colors.warning} /></IconTile>}
              title="Bekleyen siparişler"
              subtitle="Hazırlanmayı bekliyor"
              trailing={<Text style={[type.title, tabular, { color: colors.textPrimary }]}>{stats.pending_orders}</Text>}
              chevron
              onPress={() => router.push({ pathname: "/(tabs)/orders", params: { filter: "pending" } })}
            />
            <ListRow
              testID="todo-shipped"
              divider
              leading={<IconTile tint={colors.infoBg}><TruckIcon size={18} color={colors.info} /></IconTile>}
              title="Kargodaki siparişler"
              subtitle="Teslimat bekleniyor"
              trailing={<Text style={[type.title, tabular, { color: colors.textPrimary }]}>{stats.shipped_orders}</Text>}
              chevron
              onPress={() => router.push({ pathname: "/(tabs)/orders", params: { filter: "shipped" } })}
            />
            {data.alerts.map((a, i) => {
              const isError = a.severity === "error";
              const go = alertTarget(a.action_path);
              return (
                <ListRow
                  key={`${a.type}-${i}`}
                  testID={`alert-${a.type}`}
                  divider
                  leading={
                    <IconTile tint={isError ? colors.errorBg : colors.warningBg}>
                      <AlertIcon size={18} color={isError ? colors.error : colors.warning} />
                    </IconTile>
                  }
                  title={a.title}
                  subtitle={a.desc}
                  chevron={Boolean(go)}
                  onPress={go}
                />
              );
            })}
          </Card>

          {/* Satışlar */}
          <SectionTitle title="Satışlar" />
          <SegmentedControl
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "Son 7 gün" },
              { value: "30", label: "Son 30 gün" },
            ]}
          />
          <Card style={[styles.block, { marginTop: spacing.sm }]} padded>
            <View style={styles.salesRow}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: colors.textTertiary }]}>Ciro</Text>
                <Text testID="dash-period-revenue" style={[type.title, tabular, { color: colors.textPrimary }]}>{formatTry(periodRevenue)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[type.caption, { color: colors.textTertiary }]}>Sipariş</Text>
                <Text style={[type.title, tabular, { color: colors.textPrimary }]}>{periodOrders}</Text>
              </View>
            </View>
            <View
              style={{ marginTop: spacing.sm, minHeight: 64 }}
              onLayout={(e) => setChartWidth(Math.floor(e.nativeEvent.layout.width))}
              accessible
              accessibilityLabel={`Son ${range} günün günlük ciro grafiği`}
            >
              {chartWidth > 0 ? (
              <Sparkline
                data={points.length > 1 ? points.map((p) => Number(p.total || 0)) : [0, 0]}
                width={chartWidth}
                height={64}
                color={colors.primary}
                fillOpacity={0.18}
                showAxis
                axisFormatter={(n) => `${formatCompact(n)}₺`}
              />
              ) : null}
            </View>
          </Card>

          {/* Son siparişler */}
          <SectionTitle
            title="Son siparişler"
            action={<Button label="Tümü" variant="ghost" size="sm" onPress={() => router.push("/(tabs)/orders")} testID="dash-all-orders" />}
          />
          <Card style={styles.block}>
            {data.recent.length === 0 ? (
              <View style={styles.empty}>
                <InboxIcon size={24} color={colors.textTertiary} />
                <Text style={[type.callout, { color: colors.textSecondary, textAlign: "center" }]}>
                  Henüz sipariş yok. Mağazalar eşitlendiğinde burada görünür.
                </Text>
              </View>
            ) : (
              data.recent.map((o, i) => <OrderRow key={o.id} order={o} divider={i > 0} />)
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  hero: { marginHorizontal: spacing.lg, marginTop: spacing.xs, borderRadius: radius.xl, padding: spacing.lg, overflow: "hidden" },
  heroLabel: { color: "#BFDBFE" },
  heroValue: { color: "#FFFFFF", fontSize: 36, lineHeight: 42, fontWeight: "700", letterSpacing: -1, marginTop: 2 },
  heroSub: { color: "#E2E8F0", marginTop: 2 },
  salesRow: { flexDirection: "row", alignItems: "flex-end" },
  empty: { alignItems: "center", gap: spacing.xs, padding: spacing.xl },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
