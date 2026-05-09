import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getInvoices, getOrders, getSalesReportsOverview } from "../../src/api";
import { formatCompact, formatTry, providerColor, providerLabel, orderTimestamp } from "../../src/utils";
import { DonutChart, Sparkline, AnimatedNumber } from "../../src/components/Charts";
import { PressableScale } from "../../src/components/KPICard";
import {
  CheckIcon,
  CloseIcon,
  FilterIcon,
  InboxIcon,
  PackageIcon,
  SparkleIcon,
  TrendDownIcon,
  TrendUpIcon,
  WalletIcon,
  ZapIcon,
} from "../../src/components/Icons";
import type { Invoice, Order, ReportsOverview } from "../../src/types";

const SCREEN_W = Dimensions.get("window").width;

type RangeT = { start: Date; end: Date; key: string; label: string };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function daysAgo(n: number) {
  const x = new Date();
  x.setDate(x.getDate() - n);
  return startOfDay(x);
}
function presetRanges(): RangeT[] {
  const today = startOfDay(new Date());
  const end = endOfDay(new Date());
  const yest = startOfDay(new Date(Date.now() - 86400000));
  const thisMonthStart = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastMonthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
  const lastMonthStart = startOfDay(new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1));
  const yearStart = startOfDay(new Date(today.getFullYear(), 0, 1));
  return [
    { key: "today", label: "Bugün", start: today, end },
    { key: "yesterday", label: "Dün", start: yest, end: endOfDay(yest) },
    { key: "7d", label: "Son 7 gün", start: daysAgo(6), end },
    { key: "14d", label: "Son 14 gün", start: daysAgo(13), end },
    { key: "30d", label: "Son 30 gün", start: daysAgo(29), end },
    { key: "90d", label: "Son 90 gün", start: daysAgo(89), end },
    { key: "thisMonth", label: "Bu ay", start: thisMonthStart, end },
    { key: "lastMonth", label: "Geçen ay", start: lastMonthStart, end: lastMonthEnd },
    { key: "ytd", label: "Yıl başından", start: yearStart, end },
  ];
}

function formatDateTr(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function rangeDays(r: RangeT) {
  return Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86400000) + 1);
}

function rangeLabel(r: RangeT) {
  if (r.key !== "custom") return r.label;
  return `${formatDateTr(r.start)} – ${formatDateTr(r.end)}`;
}

export default function ReportsScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [range, setRange] = useState<RangeT>(() => presetRanges().find((p) => p.key === "30d")!);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [previousRevenue, setPreviousRevenue] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const buildFromInvoices = async (start: Date, end: Date): Promise<ReportsOverview | null> => {
    if (!token) return null;
    const inv = await getInvoices(token, { page: 1, perPage: 600 }).catch(() => ({ invoices: [] as Invoice[] }));
    const list: any[] = Array.isArray((inv as any)?.invoices) ? (inv as any).invoices : [];

    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const dayKeys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    const dayMap: Record<string, { revenue: number; orders: number }> = {};
    dayKeys.forEach((k) => (dayMap[k] = { revenue: 0, orders: 0 }));
    const channelMap: Record<string, { provider: string; label: string; revenue: number; orders: number }> = {};
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const i of list) {
      const issueRaw = String(i?.issue_date || "");
      const dKey = issueRaw.slice(0, 10);
      if (!dayMap[dKey]) continue;
      const amt = Number(i?.display_gross_total || i?.gross_total || i?.net_total || 0) || 0;
      dayMap[dKey].revenue += amt;
      dayMap[dKey].orders += 1;
      const provider = String(i?.platform_provider || i?.platform || "other").toLowerCase() || "other";
      const label = String(i?.platform || provider || "Diğer");
      if (!channelMap[provider]) channelMap[provider] = { provider, label, revenue: 0, orders: 0 };
      channelMap[provider].revenue += amt;
      channelMap[provider].orders += 1;
      totalRevenue += amt;
      totalOrders += 1;
    }
    return {
      period_days: days,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      average_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      daily_sales: dayKeys.map((k) => ({ date: k, revenue: dayMap[k].revenue, orders: dayMap[k].orders })),
      channel_breakdown: Object.values(channelMap).sort((a, b) => b.revenue - a.revenue),
    } as ReportsOverview;
  };

  const buildFromOrders = (orderList: Order[], start: Date, end: Date): ReportsOverview => {
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const dayKeys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    const dayMap: Record<string, { revenue: number; orders: number }> = {};
    dayKeys.forEach((k) => (dayMap[k] = { revenue: 0, orders: 0 }));
    const channelMap: Record<string, { provider: string; label: string; revenue: number; orders: number }> = {};
    let totalRevenue = 0;
    let totalOrders = 0;
    for (const o of orderList) {
      const ts = orderTimestamp(o);
      if (!ts) continue;
      const d = new Date(ts);
      if (d < start || d > end) continue;
      const dKey = d.toISOString().slice(0, 10);
      if (!dayMap[dKey]) continue;
      const amt = Number(o.total_amount || 0);
      dayMap[dKey].revenue += amt;
      dayMap[dKey].orders += 1;
      const provider = String((o as any)?.integration_provider || (o as any)?.provider || o.channel || "other").toLowerCase();
      const label = providerLabel(provider);
      if (!channelMap[provider]) channelMap[provider] = { provider, label, revenue: 0, orders: 0 };
      channelMap[provider].revenue += amt;
      channelMap[provider].orders += 1;
      totalRevenue += amt;
      totalOrders += 1;
    }
    return {
      period_days: days,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      average_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      daily_sales: dayKeys.map((k) => ({ date: k, revenue: dayMap[k].revenue, orders: dayMap[k].orders })),
      channel_breakdown: Object.values(channelMap).sort((a, b) => b.revenue - a.revenue),
    } as ReportsOverview;
  };

  const computePreviousRevenue = (orderList: Order[], allInvoices: any[], r: RangeT) => {
    const days = rangeDays(r);
    const prevEnd = new Date(r.start.getTime() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (days - 1));
    let prev = 0;
    for (const inv of allInvoices) {
      const dStr = String(inv?.issue_date || "").slice(0, 10);
      const d = new Date(dStr);
      if (Number.isNaN(d.getTime())) continue;
      if (d >= prevStart && d <= prevEnd) {
        prev += Number(inv?.display_gross_total || inv?.gross_total || inv?.net_total || 0);
      }
    }
    if (prev === 0) {
      // fallback to orders
      for (const o of orderList) {
        const ts = orderTimestamp(o);
        if (!ts) continue;
        const d = new Date(ts);
        if (d >= prevStart && d <= prevEnd) prev += Number(o.total_amount || 0);
      }
    }
    return prev;
  };

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const days = rangeDays(range);
      const [apiResp, ordersRaw, invResp] = await Promise.all([
        getSalesReportsOverview(token, days).catch(() => null),
        getOrders(token, undefined, { page: 1, perPage: 300, sortBy: "-created_at" }).catch(() => [] as Order[]),
        getInvoices(token, { page: 1, perPage: 600 }).catch(() => ({ invoices: [] as Invoice[] })),
      ]);
      const orderList = Array.isArray(ordersRaw) ? ordersRaw : [];
      setOrders(orderList);

      const apiHasData =
        apiResp &&
        (Number(apiResp.total_revenue || 0) > 0 ||
          Number(apiResp.total_orders || 0) > 0 ||
          (apiResp.daily_sales || []).length > 0 ||
          (apiResp.channel_breakdown || []).length > 0);

      let result: ReportsOverview | null = null;
      if (apiHasData) {
        result = apiResp;
      } else {
        const fromInv = await buildFromInvoices(range.start, range.end).catch(() => null);
        if (fromInv && (fromInv.total_revenue ?? 0) > 0) {
          result = fromInv;
        } else {
          // fallback to orders
          const fromOrders = buildFromOrders(orderList, range.start, range.end);
          result = fromOrders.total_revenue > 0 ? fromOrders : (fromInv || apiResp || null);
        }
      }
      setReports(result);

      const allInvoices: any[] = Array.isArray((invResp as any)?.invoices) ? (invResp as any).invoices : [];
      setPreviousRevenue(computePreviousRevenue(orderList, allInvoices, range));
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [range, token]);

  const totalRevenue = Number(reports?.total_revenue || 0);
  const totalOrders = Number(reports?.total_orders || 0);
  const aov = Number(reports?.average_order_value || 0);
  const channelBreakdown = (reports?.channel_breakdown || []).slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const dailyData = reports?.daily_sales || [];

  const trendPct = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : totalRevenue > 0 ? 100 : 0;
  const sparkData = dailyData.map((d) => Number(d.revenue || 0));
  const maxDailyRev = Math.max(1, ...dailyData.map((d) => Number(d.revenue || 0)));
  const topIdx = dailyData.findIndex((d) => Number(d.revenue || 0) === maxDailyRev);
  const topDay = dailyData.slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  const topChannel = channelBreakdown[0];

  // Top products from orders (within range)
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; image: string; qty: number; revenue: number }>();
    for (const o of orders) {
      const ts = orderTimestamp(o);
      if (ts) {
        const d = new Date(ts);
        if (d < range.start || d > range.end) continue;
      }
      for (const it of (o.items || []) as any[]) {
        const key = String(it?.product_name || it?.sku || "?").trim().toLowerCase();
        if (!key || key === "?") continue;
        const existing = map.get(key) || { name: it?.product_name || it?.sku || "Ürün", image: "", qty: 0, revenue: 0 };
        existing.qty += Number(it?.quantity || 0);
        existing.revenue += Number(it?.total_price ?? Number(it?.unit_price || 0) * Number(it?.quantity || 0));
        if (!existing.image) {
          const url = String(it?.image_url || it?.image || it?.images?.[0]?.url || it?.images?.[0]?.src || it?.images?.[0] || "").trim();
          if (/^https?:\/\//i.test(url)) existing.image = url;
        }
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orders, range]);

  const quickPills: RangeT[] = useMemo(() => {
    const all = presetRanges();
    return [all.find((r) => r.key === "today")!, all.find((r) => r.key === "7d")!, all.find((r) => r.key === "30d")!];
  }, []);

  const isCustomMatch = (r: RangeT) => range.key === r.key;
  const isCustomActive = !quickPills.find((p) => p.key === range.key);

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

        {/* HERO CARD */}
        <SafeAnimatedView entering={FadeIn.delay(100).duration(450)} style={[styles.heroCard, shadows.lg]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice">
              <Defs>
                <LinearGradient id="rpHero" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#0F172A" stopOpacity="1" />
                  <Stop offset="1" stopColor="#1E3A8A" stopOpacity="1" />
                </LinearGradient>
                <LinearGradient id="rpGlow" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#A78BFA" stopOpacity="0.35" />
                  <Stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id="rpGlow2" x1="1" y1="1" x2="0" y2="0">
                  <Stop offset="0" stopColor="#22D3EE" stopOpacity="0.25" />
                  <Stop offset="1" stopColor="#0F172A" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d="M0,0 L360,0 L360,240 L0,240Z" fill="url(#rpHero)" />
              <Path d="M0,0 L360,0 L360,140 L0,200 Z" fill="url(#rpGlow)" />
              <Path d="M0,240 L360,240 L360,80 L0,180 Z" fill="url(#rpGlow2)" />
            </Svg>
          </View>
          <View style={styles.heroTopRow}>
            <View style={styles.heroChip}>
              <SparkleIcon size={11} color="#93C5FD" />
              <Text style={styles.heroChipText}>{rangeLabel(range).toUpperCase()}</Text>
            </View>
            <View
              style={[
                styles.heroTrendPill,
                { backgroundColor: trendPct >= 0 ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)" },
              ]}
            >
              {trendPct >= 0 ? <TrendUpIcon size={11} color="#22C55E" /> : <TrendDownIcon size={11} color="#F87171" />}
              <Text style={[styles.heroTrendText, { color: trendPct >= 0 ? "#22C55E" : "#F87171" }]}>
                {`${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}% vs önceki dönem`}
              </Text>
            </View>
          </View>

          <Text style={styles.heroLabel}>Toplam Ciro</Text>
          <AnimatedNumber
            testID="reports-total-revenue"
            value={totalRevenue}
            format={(n) => formatTry(n)}
            style={styles.heroValue}
          />

          <View style={styles.heroSparkWrap}>
            <Sparkline
              data={sparkData.length ? sparkData : [0, 0]}
              width={SCREEN_W - 56}
              height={70}
              color="#60A5FA"
              fillOpacity={0.3}
            />
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

        {/* PERIOD PILLS */}
        <View style={styles.periodWrap}>
          <View style={[styles.periodTrack, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.md]}>
            {quickPills.map((p) => {
              const active = isCustomMatch(p);
              return (
                <PressableScale
                  key={p.key}
                  testID={`reports-period-${p.key}`}
                  onPress={() => setRange(p)}
                  style={[styles.periodPill, active && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.periodPillText, { color: active ? "#FFFFFF" : colors.textSecondary, fontWeight: active ? "700" : "600" }]}>
                    {p.label.replace("Son ", "").replace("Bugün", "Bugün")}
                  </Text>
                </PressableScale>
              );
            })}
            <PressableScale
              testID="reports-period-custom"
              onPress={() => setPickerOpen(true)}
              style={[styles.periodPill, isCustomActive && { backgroundColor: colors.primary }, { flexDirection: "row", gap: 6, alignItems: "center" }]}
            >
              <FilterIcon size={13} color={isCustomActive ? "#FFFFFF" : colors.textSecondary} strokeWidth={2.4} />
              <Text style={[styles.periodPillText, { color: isCustomActive ? "#FFFFFF" : colors.textSecondary, fontWeight: isCustomActive ? "700" : "600" }]}>
                {isCustomActive ? rangeLabel(range) : "Özel"}
              </Text>
            </PressableScale>
          </View>
        </View>

        {/* No data fallback notice */}
        {!loading && totalRevenue === 0 && totalOrders === 0 ? (
          <SafeAnimatedView entering={FadeInUp.delay(140).duration(400)} style={[styles.notice, { backgroundColor: colors.warningBg, borderColor: colors.warning }]}>
            <ZapIcon size={14} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.textPrimary }]} numberOfLines={2}>
              Bu dönem için veri bulunamadı. Tarih aralığını genişletmeyi dene.
            </Text>
          </SafeAnimatedView>
        ) : null}

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

        {/* Insights */}
        <SafeAnimatedView entering={FadeInUp.delay(240).duration(450)} style={[styles.insightCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Akıllı İçgörüler</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <InsightRow
              icon={<TrendUpIcon size={14} color={colors.success} />}
              label="En güçlü kanal"
              value={topChannel ? `${topChannel.label || topChannel.provider}` : "Veri yok"}
              hint={topChannel ? `${formatTry(topChannel.revenue)} • ${topChannel.orders} sipariş` : undefined}
            />
            <InsightRow
              icon={<CheckIcon size={14} color={colors.primary} />}
              label="En verimli gün"
              value={topDay ? formatTry(topDay.revenue) : "-"}
              hint={topDay ? formatDayLabelFull(topDay.date) : undefined}
            />
            <InsightRow
              icon={trendPct >= 0 ? <TrendUpIcon size={14} color={colors.success} /> : <TrendDownIcon size={14} color={colors.error} />}
              label="Trend (önceki döneme göre)"
              value={`${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`}
              hint={previousRevenue > 0 ? `Önceki: ${formatTry(previousRevenue)}` : "Önceki dönem veri yok"}
              valueColor={trendPct >= 0 ? colors.success : colors.error}
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

        {/* Daily revenue */}
        <SafeAnimatedView entering={FadeInUp.delay(360).duration(450)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <View style={styles.cardHeadRow}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Günlük Ciro</Text>
            <Text style={[styles.cardHint, { color: colors.textTertiary }]}>Son {dailyData.slice(-14).length} gün</Text>
          </View>
          {dailyData.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>Seçili dönem için veri yok.</Text>
          ) : (
            <DailyBars data={dailyData.slice(-14)} topIndex={dailyData.slice(-14).findIndex((d) => Number(d.revenue || 0) === maxDailyRev)} colors={colors} />
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

      <DateRangeModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentRange={range}
        onSelect={(r) => {
          setRange(r);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

function InsightRow({ icon, label, value, hint, valueColor }: { icon: React.ReactNode; label: string; value: string; hint?: string; valueColor?: string }) {
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
        <Text style={[styles.insightHint, { color: colors.textTertiary }]} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function DailyBars({ data, topIndex, colors }: { data: { date: string; revenue: number; orders: number }[]; topIndex: number; colors: any }) {
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
              <View style={[styles.dailyBar, { height: Math.max(2, h), backgroundColor: isTop ? colors.primary : colors.borderSubtle }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.dailyLabels}>
        {data.map((d, i) => (
          <Text key={`l-${i}`} style={[styles.dailyLabel, { color: colors.textTertiary }]}>
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

function DateRangeModal({
  visible,
  onClose,
  currentRange,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  currentRange: RangeT;
  onSelect: (r: RangeT) => void;
}) {
  const { colors, shadows } = useTheme();
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStartStr(formatDateInput(currentRange.start));
      setEndStr(formatDateInput(currentRange.end));
      setError(null);
    }
  }, [visible, currentRange]);

  const presets = useMemo(() => presetRanges(), []);

  const applyCustom = () => {
    const s = parseDateInput(startStr);
    const e = parseDateInput(endStr);
    if (!s || !e) {
      setError("Tarihler GG.AA.YYYY formatında olmalı.");
      return;
    }
    if (s > e) {
      setError("Başlangıç tarihi bitişten sonra olamaz.");
      return;
    }
    onSelect({ key: "custom", label: "Özel", start: startOfDay(s), end: endOfDay(e) });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <PressableScale onPress={onClose} style={StyleSheet.absoluteFill as any}>
          <View style={{ flex: 1 }} />
        </PressableScale>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }, shadows.lg]}>
          <View style={styles.modalGrabber} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Tarih Aralığı</Text>
            <PressableScale onPress={onClose} style={[styles.modalClose, { backgroundColor: colors.surfaceMuted }]}>
              <CloseIcon size={16} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <Text style={[styles.modalSection, { color: colors.textTertiary }]}>HIZLI SEÇİMLER</Text>
            <View style={styles.presetGrid}>
              {presets.map((p) => {
                const active = currentRange.key === p.key;
                return (
                  <PressableScale
                    key={p.key}
                    testID={`preset-${p.key}`}
                    onPress={() => onSelect(p)}
                    style={[
                      styles.presetCell,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceMuted,
                        borderColor: active ? colors.primary : colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text style={[styles.presetText, { color: active ? "#FFFFFF" : colors.textPrimary }]}>
                      {p.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <Text style={[styles.modalSection, { color: colors.textTertiary, marginTop: spacing.md }]}>ÖZEL ARALIK</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>BAŞLANGIÇ</Text>
                <TextInput
                  testID="date-start-input"
                  value={startStr}
                  onChangeText={setStartStr}
                  placeholder="GG.AA.YYYY"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.dateInput, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>BİTİŞ</Text>
                <TextInput
                  testID="date-end-input"
                  value={endStr}
                  onChangeText={setEndStr}
                  placeholder="GG.AA.YYYY"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.dateInput, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                />
              </View>
            </View>
            {error ? (
              <Text style={[styles.modalError, { color: colors.error }]}>{error}</Text>
            ) : null}
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
              <PressableScale
                testID="apply-custom-range"
                onPress={applyCustom}
                style={[styles.applyBtn, { backgroundColor: colors.primary }, shadows.primary]}
              >
                <Text style={styles.applyBtnText}>Uygula</Text>
              </PressableScale>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function formatDateInput(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
function parseDateInput(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const d = new Date(yy, mm - 1, dd);
  if (Number.isNaN(d.getTime()) || d.getDate() !== dd || d.getMonth() + 1 !== mm) return null;
  return d;
}

function formatDayShort(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(5);
  return `${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabelFull(dateStr?: string) {
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
  title: { fontSize: 28, fontWeight: fontWeight.bold, letterSpacing: -0.7, marginTop: 2 },
  heroCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: "hidden",
    minHeight: 220,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, backgroundColor: "rgba(96,165,250,0.18)", maxWidth: "70%" },
  heroChipText: { color: "#BFDBFE", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  heroTrendPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999 },
  heroTrendText: { fontSize: 10.5, fontWeight: "700" },
  heroLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  heroValue: { color: "#FFFFFF", fontSize: 38, fontWeight: "800", letterSpacing: -1.4, marginTop: 2 },
  heroSparkWrap: { marginTop: spacing.sm, marginBottom: spacing.sm, alignItems: "center" },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: 4,
  },
  heroFootCell: { flex: 1, alignItems: "center" },
  heroFootDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.12)" },
  heroFootLabel: { color: "#94A3B8", fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  heroFootValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  periodWrap: { paddingHorizontal: spacing.lg, marginTop: -22, marginBottom: spacing.sm, alignItems: "center" },
  periodTrack: {
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    borderRadius: 9999,
    borderWidth: 1,
    gap: 4,
    flexWrap: "nowrap",
  },
  periodPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999 },
  periodPillText: { fontSize: 12, letterSpacing: -0.1 },
  notice: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  noticeText: { fontSize: 12, fontWeight: "600", flex: 1 },
  kpiGrid: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  kpiCell: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  insightCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
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
  dailyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  productRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  productImgWrap: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, fontWeight: "700" },
  productBarTrack: { height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  productBarFill: { height: "100%", borderRadius: 3 },
  productAmount: { fontSize: 13, fontWeight: "800" },
  productMeta: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  statusCell: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minWidth: 100 },
  statusValue: { fontSize: 18, fontWeight: "800" },
  statusLabel: { fontSize: 11, fontWeight: "600", marginTop: 2, textTransform: "capitalize" },
  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,17,32,0.55)" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 32 : 16 },
  modalGrabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.4, flex: 1 },
  modalClose: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalSection: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: 8 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: 8 },
  presetCell: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  presetText: { fontSize: 13, fontWeight: "700", letterSpacing: -0.1 },
  dateLabel: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 },
  dateInput: { height: 46, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, fontWeight: "600", borderWidth: 1.5, letterSpacing: 0.5 },
  modalError: { fontSize: 12, fontWeight: "600", paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  applyBtn: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  applyBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
});
