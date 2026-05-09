import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getOrders, getSalesReportsOverview } from "../../src/api";
import { formatCompact, formatTry, providerColor, providerLabel, PLATFORM_LOGOS, providerKey } from "../../src/utils";
import { DonutChart, Sparkline, AnimatedNumber } from "../../src/components/Charts";
import { PressableScale } from "../../src/components/KPICard";
import { CheckIcon, ClockIcon, SparkleIcon, TrendDownIcon, TrendUpIcon, ZapIcon, PackageIcon, WalletIcon, InboxIcon } from "../../src/components/Icons";
import type { Order, ReportsOverview } from "../../src/types";

type Period = 1 | 7 | 30;
const SCREEN_W = Dimensions.get("window").width;

export default function ReportsScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [period, setPeriod] = useState<Period>(30);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const [r, o] = await Promise.all([
        getSalesReportsOverview(token, period),
        getOrders(token, undefined, { page: 1, perPage: 200, sortBy: "-created_at" }).catch(() => [] as Order[]),
      ]);
      setReports(r);
      setOrders(Array.isArray(o) ? o : []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [period, token]);

  const insights = useMemo(() => {
    const channels = (reports?.channel_breakdown || []).slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
    const days = reports?.daily_sales || [];
    const sortedDays = days.slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
    const half = Math.max(1, Math.floor(days.length / 2));
    const first = days.slice(0, half).reduce((a, b) => a + Number(b.revenue || 0), 0);
    const second = days.slice(half).reduce((a, b) => a + Number(b.revenue || 0), 0);
    const trendPct = first > 0 ? ((second - first) / first) * 100 : second > 0 ? 100 : 0;
    return {
      topChannel: channels[0],
      topDay: sortedDays[0],
      trendPct,
      sparkData: days.map((d) => Number(d.revenue || 0)),
    };
  }, [reports]);

  // Top products from orders
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; image: string; qty: number; revenue: number }>();
    for (const o of orders) {
      for (const it of (o.items || []) as any[]) {
        const key = String(it?.product_name || it?.sku || "?").trim().toLowerCase();
        if (!key || key === "?") continue;
        const existing = map.get(key) || { name: it?.product_name || it?.sku || "Ürün", image: "", qty: 0, revenue: 0 };
        existing.qty += Number(it?.quantity || 0);
        existing.revenue += Number(it?.total_price ?? (Number(it?.unit_price || 0) * Number(it?.quantity || 0)) ?? 0);
        if (!existing.image) {
          const url = String(
            it?.image_url || it?.image || it?.images?.[0]?.url || it?.images?.[0]?.src || it?.images?.[0] || ""
          ).trim();
          if (/^https?:\/\//i.test(url)) existing.image = url;
        }
        map.set(key, existing);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [orders]);

  const channelBreakdown = (reports?.channel_breakdown || []).slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const totalRevenue = Number(reports?.total_revenue || 0);
  const totalOrders = Number(reports?.total_orders || 0);
  const aov = Number(reports?.average_order_value || 0);

  const dailyData = (reports?.daily_sales || []).slice(-14);
  const maxDailyRev = Math.max(1, ...dailyData.map((d) => Number(d.revenue || 0)));
  const topIdx = dailyData.findIndex((d) => Number(d.revenue || 0) === maxDailyRev);

  const periodLabel = period === 1 ? "Bugün" : period === 7 ? "7 günlük" : "30 günlük";

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="reports-screen">
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
        <SafeAnimatedView entering={FadeInDown.duration(450)} style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>RAPOR & ANALİTİK</Text>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Satış kontrol odası</Text>
            </View>
          </View>
        </SafeAnimatedView>

        {/* HERO REVENUE CARD */}
        <SafeAnimatedView
          entering={FadeIn.delay(100).duration(450)}
          style={[styles.heroCard, { backgroundColor: "#0B1220" }, shadows.lg]}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice">
              <Defs>
                <LinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#1E40AF" stopOpacity="0.4" />
                  <Stop offset="1" stopColor="#0B1220" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d="M0,0 L360,0 L360,220 L0,220 Z" fill="url(#heroGrad)" />
            </Svg>
          </View>
          <View style={styles.heroTopRow}>
            <View style={styles.heroChip}>
              <SparkleIcon size={11} color="#60A5FA" />
              <Text style={styles.heroChipText}>{periodLabel.toUpperCase()}</Text>
            </View>
            <View style={[styles.heroTrendPill, { backgroundColor: insights.trendPct >= 0 ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)" }]}>
              {insights.trendPct >= 0 ? (
                <TrendUpIcon size={11} color="#22C55E" />
              ) : (
                <TrendDownIcon size={11} color="#F87171" />
              )}
              <Text style={[styles.heroTrendText, { color: insights.trendPct >= 0 ? "#22C55E" : "#F87171" }]}>
                {`${insights.trendPct >= 0 ? "+" : ""}${insights.trendPct.toFixed(1)}% vs önceki dönem`}
              </Text>
            </View>
          </View>

          <Text style={styles.heroLabel}>Toplam Ciro</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
            <AnimatedNumber
              testID="reports-total-revenue"
              value={totalRevenue}
              format={(n) => formatTry(n)}
              style={styles.heroValue}
            />
          </View>

          <View style={styles.heroSparkWrap}>
            <Sparkline data={insights.sparkData.length ? insights.sparkData : [0, 0]} width={SCREEN_W - 56} height={70} color="#60A5FA" fillOpacity={0.25} />
          </View>

          <View style={styles.heroFooter}>
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>Sipariş</Text>
              <Text style={styles.heroFootValue}>{formatCompact(totalOrders)}</Text>
            </View>
            <View style={[styles.heroFootDivider]} />
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>Ort. Sepet</Text>
              <Text style={styles.heroFootValue}>{formatTry(aov)}</Text>
            </View>
            <View style={[styles.heroFootDivider]} />
            <View style={styles.heroFootCell}>
              <Text style={styles.heroFootLabel}>Kanal</Text>
              <Text style={styles.heroFootValue}>{channelBreakdown.length}</Text>
            </View>
          </View>
        </SafeAnimatedView>

        {/* PERIOD PILL SELECTOR (overlapping hero) */}
        <View style={styles.periodWrap}>
          <View style={[styles.periodTrack, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.md]}>
            {[1, 7, 30].map((p) => {
              const active = period === (p as Period);
              return (
                <PressableScale
                  key={p}
                  testID={`reports-period-${p}`}
                  onPress={() => setPeriod(p as Period)}
                  style={[
                    styles.periodPill,
                    active && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.periodPillText,
                      { color: active ? "#FFFFFF" : colors.textSecondary, fontWeight: active ? "700" : "600" },
                    ]}
                  >
                    {p === 1 ? "Bugün" : `${p} Gün`}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* KPI grid */}
        <SafeAnimatedView entering={FadeInUp.delay(180).duration(450)} style={styles.kpiGrid}>
          <View style={[styles.kpiCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <View style={[styles.kpiIcon, { backgroundColor: colors.primarySoft }]}>
              <WalletIcon size={16} color={colors.primary} />
            </View>
            <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>Ciro</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {formatTry(totalRevenue)}
            </Text>
          </View>
          <View style={[styles.kpiCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <View style={[styles.kpiIcon, { backgroundColor: colors.successBg }]}>
              <InboxIcon size={16} color={colors.success} />
            </View>
            <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>Sipariş</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {formatCompact(totalOrders)}
            </Text>
          </View>
          <View style={[styles.kpiCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <View style={[styles.kpiIcon, { backgroundColor: colors.warningBg }]}>
              <ZapIcon size={16} color={colors.warning} />
            </View>
            <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>Ort. Sepet</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {formatTry(aov)}
            </Text>
          </View>
        </SafeAnimatedView>

        {/* INSIGHT cards */}
        <SafeAnimatedView entering={FadeInUp.delay(240).duration(450)} style={[styles.insightCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Akıllı İçgörüler</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <InsightRow
              icon={<TrendUpIcon size={14} color={colors.success} />}
              label="En güçlü kanal"
              value={insights.topChannel ? `${insights.topChannel.label || insights.topChannel.provider}` : "Veri yok"}
              hint={insights.topChannel ? `${formatTry(insights.topChannel.revenue)} • ${insights.topChannel.orders} sipariş` : undefined}
            />
            <InsightRow
              icon={<CheckIcon size={14} color={colors.primary} />}
              label="En verimli gün"
              value={insights.topDay ? formatTry(insights.topDay.revenue) : "-"}
              hint={insights.topDay ? formatDayLabel(insights.topDay.date) : undefined}
            />
            <InsightRow
              icon={insights.trendPct >= 0 ? <TrendUpIcon size={14} color={colors.success} /> : <TrendDownIcon size={14} color={colors.error} />}
              label="Trend"
              value={`${insights.trendPct >= 0 ? "+" : ""}${insights.trendPct.toFixed(1)}%`}
              hint={`İlk yarıya göre değişim`}
              valueColor={insights.trendPct >= 0 ? colors.success : colors.error}
            />
          </View>
        </SafeAnimatedView>

        {/* Channel donut + legend */}
        <SafeAnimatedView entering={FadeInUp.delay(300).duration(450)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <View style={styles.cardHeadRow}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Kanal Dağılımı</Text>
            <Text style={[styles.cardHint, { color: colors.textTertiary }]}>{channelBreakdown.length} kanal</Text>
          </View>

          {channelBreakdown.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>Bu dönem için kanal verisi bulunamadı.</Text>
          ) : (
            <View style={styles.donutRow}>
              <DonutChart
                size={148}
                strokeWidth={20}
                centerLabel="Toplam"
                centerValue={formatCompact(totalRevenue)}
                data={channelBreakdown.map((c, idx) => ({
                  label: c.label || c.provider,
                  value: Number(c.revenue || 0),
                  color: providerColor(c.provider, idx % 2 === 0 ? colors.primary : colors.warning),
                }))}
              />
              <View style={{ flex: 1, gap: 10, paddingLeft: spacing.md }}>
                {channelBreakdown.slice(0, 5).map((c, i) => {
                  const pct = totalRevenue > 0 ? (Number(c.revenue || 0) / totalRevenue) * 100 : 0;
                  const color = providerColor(c.provider, colors.primary);
                  return (
                    <View key={`${c.provider}-${i}`} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.legendLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                          {providerLabel(c.provider)}
                        </Text>
                        <Text style={[styles.legendMeta, { color: colors.textTertiary }]}>
                          {formatTry(c.revenue)} · {pct.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </SafeAnimatedView>

        {/* Daily revenue bar chart */}
        <SafeAnimatedView entering={FadeInUp.delay(360).duration(450)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <View style={styles.cardHeadRow}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Günlük Ciro</Text>
            <Text style={[styles.cardHint, { color: colors.textTertiary }]}>Son {dailyData.length} gün</Text>
          </View>
          {dailyData.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>Seçili dönem için veri yok.</Text>
          ) : (
            <DailyBars data={dailyData} topIndex={topIdx} colors={colors} />
          )}
        </SafeAnimatedView>

        {/* Top products */}
        <SafeAnimatedView entering={FadeInUp.delay(420).duration(450)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <View style={styles.cardHeadRow}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Çok Satanlar</Text>
            <Text style={[styles.cardHint, { color: colors.textTertiary }]}>Top 5 ürün</Text>
          </View>
          {topProducts.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>Sipariş verisi yetersiz.</Text>
          ) : (
            topProducts.map((p, idx) => {
              const max = topProducts[0]?.revenue || 1;
              const pct = Math.max(6, Math.round((p.revenue / max) * 100));
              return (
                <View key={`${p.name}-${idx}`} style={styles.productRow}>
                  <View style={[styles.productImgWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                    {p.image ? (
                      <Image source={{ uri: p.image }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    ) : (
                      <PackageIcon size={20} color={colors.textTertiary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={[styles.productBarTrack, { backgroundColor: colors.surfaceMuted }]}>
                      <View style={[styles.productBarFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.productAmount, { color: colors.textPrimary }]}>{formatTry(p.revenue)}</Text>
                    <Text style={[styles.productMeta, { color: colors.textTertiary }]}>{p.qty} adet</Text>
                  </View>
                </View>
              );
            })
          )}
        </SafeAnimatedView>

        {/* Status breakdown */}
        {Array.isArray(reports?.status_breakdown) && (reports?.status_breakdown?.length ?? 0) > 0 ? (
          <SafeAnimatedView entering={FadeInUp.delay(480).duration(450)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <View style={styles.cardHeadRow}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Sipariş Durumu</Text>
            </View>
            <View style={styles.statusGrid}>
              {(reports?.status_breakdown || []).map((s, i) => (
                <View key={`${s.status}-${i}`} style={[styles.statusCell, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.statusValue, { color: colors.textPrimary }]}>{s.count}</Text>
                  <Text style={[styles.statusLabel, { color: colors.textTertiary }]} numberOfLines={1}>
                    {s.status}
                  </Text>
                </View>
              ))}
            </View>
          </SafeAnimatedView>
        ) : null}

        {loading ? (
          <View style={{ paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function InsightRow({
  icon,
  label,
  value,
  hint,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.insightRow}>
      <View style={[styles.insightIcon, { backgroundColor: colors.surfaceMuted }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.insightLabel, { color: colors.textTertiary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.insightValue, { color: valueColor || colors.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {hint ? (
        <Text style={[styles.insightHint, { color: colors.textTertiary }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function DailyBars({
  data,
  topIndex,
  colors,
}: {
  data: { date: string; revenue: number; orders: number }[];
  topIndex: number;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const max = Math.max(1, ...data.map((d) => Number(d.revenue || 0)));
  const total = data.reduce((a, b) => a + Number(b.revenue || 0), 0);
  return (
    <View>
      <View style={styles.dailyRow}>
        {data.map((d, i) => {
          const h = (Number(d.revenue || 0) / max) * 110;
          const isTop = i === topIndex && Number(d.revenue || 0) > 0;
          return (
            <View key={`${d.date}-${i}`} style={styles.dailyCol}>
              <View
                style={[
                  styles.dailyBar,
                  {
                    height: Math.max(2, h),
                    backgroundColor: isTop ? colors.primary : colors.borderSubtle,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.dailyLabels}>
        {data.map((d, i) => (
          <Text
            key={`l-${i}`}
            style={[styles.dailyLabel, { color: colors.textTertiary }]}
          >
            {formatDayShort(d.date)}
          </Text>
        ))}
      </View>
      <View style={[styles.dailyFooter, { borderColor: colors.borderSubtle }]}>
        <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" }}>
          {data.length} gün toplamı
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{formatTry(total)}</Text>
      </View>
    </View>
  );
}

function formatDayShort(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(5);
  return `${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(dateStr?: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  eyebrow: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: fontWeight.bold, letterSpacing: -0.6, marginTop: 2 },
  heroCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: "hidden",
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: "rgba(96,165,250,0.15)",
  },
  heroChipText: { color: "#93C5FD", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  heroTrendPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999 },
  heroTrendText: { fontSize: 10.5, fontWeight: "700" },
  heroLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 },
  heroValue: { color: "#FFFFFF", fontSize: 38, fontWeight: "800", letterSpacing: -1.4 },
  heroSparkWrap: { marginTop: spacing.sm, marginBottom: spacing.sm, alignItems: "center" },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: 4,
  },
  heroFootCell: { flex: 1, alignItems: "center" },
  heroFootDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.1)" },
  heroFootLabel: { color: "#94A3B8", fontSize: 10.5, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  heroFootValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginTop: 2 },
  periodWrap: { paddingHorizontal: spacing.lg, marginTop: -22, marginBottom: spacing.sm, alignItems: "center" },
  periodTrack: {
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    borderRadius: 9999,
    borderWidth: 1,
    gap: 4,
  },
  periodPill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9999 },
  periodPillText: { fontSize: 12.5 },
  kpiGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  kpiCell: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  insightCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  cardHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  cardHint: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  empty: { fontSize: 13, paddingVertical: spacing.md, fontWeight: "500" },
  donutRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.xs },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendLabel: { fontSize: 13, fontWeight: "700" },
  legendMeta: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  insightRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  insightIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  insightLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  insightValue: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  insightHint: { fontSize: 11, fontWeight: "500", maxWidth: 140, textAlign: "right" },
  dailyRow: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 6, marginTop: spacing.xs },
  dailyCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  dailyBar: { width: "100%", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  dailyLabels: { flexDirection: "row", marginTop: 6, gap: 6 },
  dailyLabel: { flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: "600" },
  dailyFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  productRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  productImgWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  productName: { fontSize: 13, fontWeight: "700" },
  productBarTrack: { height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  productBarFill: { height: "100%", borderRadius: 3 },
  productAmount: { fontSize: 13, fontWeight: "800" },
  productMeta: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  statusCell: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minWidth: 100 },
  statusValue: { fontSize: 18, fontWeight: "800" },
  statusLabel: { fontSize: 11, fontWeight: "600", marginTop: 2, textTransform: "capitalize" },
});
