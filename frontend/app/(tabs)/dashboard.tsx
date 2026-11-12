import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getDashboardStats, getFinanceOverview, getOrdersPage, getSalesChart, getSmartAlerts } from "../../src/api";
import { canAccess, canManage } from "../../src/auth/permissions";
import { QuickSaleCard } from "../../src/components/QuickSaleCard";
import { formatCompact, formatTry } from "../../src/utils";
import { AnimatedNumber, Sparkline } from "../../src/components/Charts";
import { AlertIcon, ArrowRightIcon, BagIcon, ChartIcon, InboxIcon, PackageIcon, TruckIcon, UserIcon, WalletIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { OrderRow } from "../../src/components/OrderRow";
import { DashboardSkeleton } from "../../src/components/Skeleton";
import { loadCache, saveCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import { TabHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Button } from "../../src/ui/Button";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { DashboardStats, Order, SalesChartPoint, SmartAlert, User } from "../../src/types";

type Range = "7" | "30";
type DashData = {
  stats: DashboardStats | null;
  today: { revenue: number; orders: number } | null;
  // Bugün dahil son 30 günün günlük satışı (eskiden yeniye); alınamadıysa null.
  daily: SalesChartPoint[] | null;
  alerts: SmartAlert[];
  recent: Order[];
  overdueReceivable: number;
};

const EMPTY: DashData = { stats: null, today: null, daily: null, alerts: [], recent: [], overdueReceivable: 0 };
const CACHE_KEY = "dashboard_v4";


const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Günlük satış web paneliyle aynı uçtan (/dashboard/sales-chart): Europe/Istanbul günü, sipariş tarihi, iptal/silinen
// hariç, bugün dahil son 30 gün (en eski → bugün). "Bugün" rakamı da aynı tanımla /dashboard/stats'tan gelir.
async function getDailySales(token: string): Promise<SalesChartPoint[]> {
  const rows = await getSalesChart(token, 30);
  if (rows.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(String(d?.date || "")))) throw new Error("Dönem verisi günlük değil.");
  return rows.map((d) => ({ date: String(d.date), total: Number(d.total || 0), count: Number(d.count || 0) }));
}

// Sunucudaki uyarı hedeflerinden mobilde karşılığı olanlar.
function alertTarget(alert: SmartAlert, user: User | null): (() => void) | undefined {
  const path = alert.action_path;
  if (path === "/siparisler") {
    // Bekleyen uyarısı yalnızca 3 günü aşan bekleyenleri sayar; hacim düşüşü uyarısı tüm siparişlerle ilgilidir.
    const params = alert.type === "stale_orders" ? { filter: "pending", stale: "1" } : { filter: "all", stale: "" };
    return () => router.push({ pathname: "/(tabs)/orders", params: { ...params, t: String(Date.now()) } });
  }
  if (path === "/stok" && (canAccess(user, "catalog") || canAccess(user, "inventory"))) return () => router.push({ pathname: "/products", params: { filter: "low" } });
  if (path === "/entegrasyon-isleri" && canAccess(user, "catalog")) return () => router.push("/jobs");
  return undefined;
}

export default function DashboardScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const billing = canAccess(user, "billing");
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
        const [stats, daily, alerts, recent, overdueReceivable] = await Promise.all([
          getDashboardStats(token),
          getDailySales(token).catch(() => null),
          getSmartAlerts(token).catch(() => []),
          getOrdersPage(token, { page: 1, perPage: 5 }).then((r) => r.items).catch(() => []),
          billing ? getFinanceOverview(token).then((f) => f.overdue_receivable).catch(() => 0) : Promise.resolve(0),
        ]);
        const next: DashData = { stats, today: null, daily, alerts, recent, overdueReceivable };
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
    [token, billing]
  );

  useFocusLoad(load, { hasData: Boolean(data.stats) });

  // Bugün: web paneliyle aynı sunucu değeri (İstanbul günü, sipariş tarihi, iptal/silinen hariç).
  const todayRevenue = Number(data.stats?.revenue_today ?? 0);
  const todayOrders = Number(data.stats?.orders_today ?? 0);
  // Bugün dahil son 7 ya da 30 gün. Dönem toplamı Raporlar ekranıyla aynı sunucu verisinden gelir.
  const periodReady = Array.isArray(data.daily);
  const points = useMemo(() => (data.daily || []).slice(-Number(range)), [data.daily, range]);
  const [chartWidth, setChartWidth] = useState(0);
  const periodRevenue = useMemo(() => points.reduce((s, p) => s + Number(p.total || 0), 0), [points]);
  const periodOrders = useMemo(() => points.reduce((s, p) => s + Number(p.count || 0), 0), [points]);
  // Grafiğin son noktası üstteki "Bugün" rakamıyla aynı değeri gösterir.
  const chartValues = useMemo(() => {
    const today = points.length > 0 ? points[points.length - 1].date : dayKey(new Date());
    return points.map((p) => (p.date === today ? Math.max(Number(p.total || 0), todayRevenue) : Number(p.total || 0)));
  }, [points, todayRevenue]);
  const todayLabel = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const stats = data.stats;
  const { shadows } = useTheme();

  // Rolün erişebildiği kısayollar; her biri kendi rengiyle.
  const shortcuts = [
    (canAccess(user, "catalog") || canAccess(user, "inventory")) && {
      key: "products", title: "Ürünler", desc: "Stok ve fiyat", fg: colors.primary, bg: colors.primarySoft, Icon: PackageIcon, go: () => router.push("/products"),
    },
    canAccess(user, "reports") && {
      key: "reports", title: "Raporlar", desc: "Kanal ve ürün analizi", fg: colors.violet, bg: colors.violetSoft, Icon: ChartIcon, go: () => router.push("/reports"),
    },
    canAccess(user, "customers") && {
      key: "customers", title: "Cari hesaplar", desc: "Bakiye ve tahsilat", fg: colors.emerald, bg: colors.emeraldSoft, Icon: UserIcon, go: () => router.push("/customers"),
    },
    billing && {
      key: "cash", title: "Kasa ve banka", desc: "Bakiye ve hareketler", fg: colors.amber, bg: colors.amberSoft, Icon: WalletIcon, go: () => router.push("/cash"),
    },
  ].filter(Boolean) as { key: string; title: string; desc: string; fg: string; bg: string; Icon: typeof PackageIcon; go: () => void }[];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dashboard-screen">
      <TabHeader title="Panel" eyebrow={todayLabel} />
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
          {canManage(user, "billing") ? (
            <SafeAnimatedView entering={FadeInDown.duration(380)}>
              <QuickSaleCard />
            </SafeAnimatedView>
          ) : null}
          {/* Ciro kartı: bugün, dönem cirosu ve günlük grafik */}
          <SafeAnimatedView entering={FadeInDown.duration(420)}>
          <HeroCard tone="blue" style={{ marginTop: spacing.xs }}>
            <View style={styles.heroTop}>
              <View style={styles.liveChip}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Bugün</Text>
              </View>
              <View style={styles.rangeToggle} accessibilityRole="tablist">
                {(["7", "30"] as Range[]).map((r) => (
                  <PressableScale
                    key={r}
                    testID={`segment-${r}`}
                    onPress={() => setRange(r)}
                    accessibilityRole="tab"
                    accessibilityLabel={`Son ${r} gün`}
                    accessibilityState={{ selected: range === r }}
                    // 30 pt yüksek düğme: 8 pt pay ile dokunma alanı 46 pt.
                    hitSlop={8}
                    style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}
                  >
                    <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>{r} gün</Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            <View accessible accessibilityLabel={`Bugün ${formatTry(todayRevenue)} ciro, ${todayOrders} sipariş`}>
              <AnimatedNumber testID="dash-today-revenue" value={todayRevenue} format={(n) => formatTry(n)} style={[styles.heroValue, tabular]} />
              <Text testID="dash-today-orders" style={styles.heroSub}>{todayOrders} sipariş</Text>
            </View>

            <View
              style={styles.chartWrap}
              onLayout={(e) => setChartWidth(Math.floor(e.nativeEvent.layout.width))}
              accessible
              accessibilityLabel={`Son ${range} günün günlük ciro grafiği`}
            >
              {chartWidth > 0 ? (
                <Sparkline
                  data={chartValues.length > 1 ? chartValues : [0, 0]}
                  width={chartWidth}
                  height={64}
                  color={colors.heroAccent}
                  fillOpacity={0.35}
                  showAxis
                  axisFormatter={(n) => `${formatCompact(n)}₺`}
                />
              ) : null}
            </View>

            <View style={styles.heroFoot}>
              <View style={[styles.heroCell, { flex: 1.5 }]}>
                <Text style={styles.heroCellLabel}>Son {range} gün</Text>
                <Text testID="dash-period-revenue" style={[styles.heroCellValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                  {periodReady ? formatTry(periodRevenue) : "—"}
                </Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroCell}>
                <Text style={styles.heroCellLabel}>Sipariş</Text>
                <Text testID="dash-period-orders" style={[styles.heroCellValue, tabular]}>{periodReady ? periodOrders : "—"}</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroCell}>
                <Text style={styles.heroCellLabel}>Ort. sepet</Text>
                <Text style={[styles.heroCellValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                  {periodReady ? formatTry(periodOrders > 0 ? periodRevenue / periodOrders : 0) : "—"}
                </Text>
              </View>
            </View>
          </HeroCard>
          </SafeAnimatedView>

          {/* Bekleyen ve kargodaki siparişler */}
          <SafeAnimatedView entering={FadeInDown.delay(80).duration(420)} style={styles.kpiRow}>
            {[
              { key: "pending", label: "Bekleyen", hint: "Hazırlanmayı bekliyor", value: stats.pending_orders, fg: colors.amber, bg: colors.amberSoft, Icon: BagIcon },
              { key: "shipped", label: "Kargoda", hint: "Teslimat bekleniyor", value: stats.shipped_orders, fg: colors.info, bg: colors.infoBg, Icon: TruckIcon },
            ].map((k) => (
              <PressableScale
                key={k.key}
                testID={`todo-${k.key}`}
                onPress={() => router.push({ pathname: "/(tabs)/orders", params: { filter: k.key, t: String(Date.now()) } })}
                accessibilityRole="button"
                accessibilityLabel={`${k.label} siparişler, ${k.value}`}
                style={[styles.kpi, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
              >
                <View style={styles.kpiHead}>
                  <View style={[styles.kpiIcon, { backgroundColor: k.bg }]}>
                    <k.Icon size={18} color={k.fg} />
                  </View>
                  <ArrowRightIcon size={16} color={colors.textTertiary} />
                </View>
                <Text style={[styles.kpiValue, tabular, { color: colors.textPrimary }]}>{k.value}</Text>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{k.label}</Text>
                <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                  {k.hint}
                </Text>
              </PressableScale>
            ))}
          </SafeAnimatedView>

          {/* Dikkat isteyenler */}
          {data.alerts.length > 0 || (data.overdueReceivable || 0) > 0 ? (
            <SafeAnimatedView entering={FadeInDown.delay(140).duration(420)}>
              <SectionTitle title="Dikkat isteyenler" />
              <Card style={styles.block}>
                {(data.overdueReceivable || 0) > 0 ? (
                  <ListRow
                    testID="todo-overdue"
                    leading={<IconTile tint={colors.errorBg}><AlertIcon size={18} color={colors.error} /></IconTile>}
                    title="Vadesi geçen alacak"
                    subtitle={`${formatTry(data.overdueReceivable)} tahsil edilmeyi bekliyor`}
                    chevron
                    // Tutar Finans özetinden gelir (yerel faturalar ve muhasebe programından alınan belgeler); aynı rakam o ekranda görünür.
                    onPress={() => router.push("/(tabs)/finance")}
                  />
                ) : null}
                {data.alerts.map((a, i) => {
                  const isError = a.severity === "error";
                  const go = alertTarget(a, user);
                  return (
                    <ListRow
                      key={`${a.type}-${i}`}
                      testID={`alert-${a.type}`}
                      divider={i > 0 || (data.overdueReceivable || 0) > 0}
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
            </SafeAnimatedView>
          ) : null}

          {/* Hızlı işlemler */}
          {shortcuts.length > 0 ? (
            <SafeAnimatedView entering={FadeInDown.delay(200).duration(420)}>
              <SectionTitle title="Hızlı işlemler" />
              <View style={styles.grid}>
                {shortcuts.map((sc) => (
                  <PressableScale
                    key={sc.key}
                    testID={`shortcut-${sc.key}`}
                    onPress={sc.go}
                    accessibilityRole="button"
                    accessibilityLabel={`${sc.title}, ${sc.desc}`}
                    style={[styles.shortcut, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
                  >
                    <View style={[styles.shortcutIcon, { backgroundColor: sc.bg }]}>
                      <sc.Icon size={20} color={sc.fg} />
                    </View>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary, marginTop: spacing.sm }]} numberOfLines={1}>
                      {sc.title}
                    </Text>
                    <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                      {sc.desc}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </SafeAnimatedView>
          ) : null}

          {/* Son siparişler */}
          <SafeAnimatedView entering={FadeInDown.delay(260).duration(420)}>
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
          </SafeAnimatedView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  liveChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ON_HERO.faint, borderRadius: 9999, paddingHorizontal: 12, height: 30 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ON_HERO.live },
  liveText: { color: ON_HERO.text, fontSize: 13, fontWeight: "600" },
  rangeToggle: { flexDirection: "row", backgroundColor: ON_HERO.faint, borderRadius: 9999, padding: 3 },
  rangeBtn: { height: 30, paddingHorizontal: 14, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  rangeBtnActive: { backgroundColor: ON_HERO.text },
  rangeText: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  rangeTextActive: { color: ON_HERO.ink },
  heroValue: { color: ON_HERO.text, fontSize: 40, lineHeight: 46, fontWeight: "800", letterSpacing: -1.2 },
  heroSub: { color: ON_HERO.soft, fontSize: 14, fontWeight: "500", marginTop: 2 },
  chartWrap: { marginTop: spacing.md, minHeight: 64 },
  heroFoot: { flexDirection: "row", alignItems: "center", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroCell: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  heroCellLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  heroCellValue: { color: ON_HERO.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  heroDivider: { width: 1, height: 28, backgroundColor: ON_HERO.faint },
  kpiRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  kpi: { flex: 1, borderRadius: radius.xl, borderWidth: 1, padding: spacing.md },
  kpiHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kpiIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.8, marginTop: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  shortcut: { flexBasis: "47%", flexGrow: 1, borderRadius: radius.xl, borderWidth: 1, padding: spacing.md },
  shortcutIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.xs, padding: spacing.xl },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
