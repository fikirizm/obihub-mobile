import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useFocusEffect } from "expo-router";
import { FadeIn, FadeInUp, SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { useAuth } from "../src/auth/AuthProvider";
import { useTheme } from "../src/theme/ThemeProvider";
import { StackHeader } from "../src/ui/Header";
import { Card, SectionTitle } from "../src/ui/ListRow";
import { Chip, ChipRow } from "../src/ui/Chip";
import { canAccess } from "../src/auth/permissions";
import { EmptyState } from "../src/components/EmptyState";
import { Skeleton } from "../src/components/Skeleton";
import { palette, radius, spacing, tabular, type } from "../src/theme/tokens";
import type { Palette } from "../src/theme/tokens";
import { getOrders, getSalesReportsOverview } from "../src/api";
import { formatCompact, formatTry, providerKey, providerLabel, orderTimestamp } from "../src/utils";
import { DonutChart, Sparkline, AnimatedNumber } from "../src/components/Charts";
import { ChartIcon, CheckIcon, PackageIcon, TrendDownIcon, TrendUpIcon, ZapIcon } from "../src/components/Icons";
import { NetworkErrorBanner } from "../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../src/offlineCache";
import { InsightRow } from "../src/components/reports/InsightRow";
import { DateRangeModal } from "../src/components/reports/DateRangeModal";
import {
  localDateKey,
  presetRanges,
  rangeDays,
  periodDaysFromRangeKey,
  rangeLabel,
  formatDayLabelFull,
  type RangeT,
} from "../src/components/reports/reportUtils";
import type { Order, ReportsOverview } from "../src/types";

type ReportsCache = { reports: ReportsOverview; orders: Order[]; rangeKey: string; previousRevenue?: number | null; truncated?: boolean };

// Sunucunun hesaplayamadığı aralıklarda (bitişi geçmişte olanlar) siparişler sayfa sayfa indirilir.
const ORDERS_PAGE = 500;
const ORDERS_MAX_PAGES = 6;

// Siparişleri yeniden eskiye, `until` anından öncesine ulaşana dek indirir.
// coveredFrom: bu andan sonraki tüm siparişler eldedir (liste bittiyse 0).
async function loadOrdersBack(token: string, until: number): Promise<{ list: Order[]; coveredFrom: number }> {
  const list: Order[] = [];
  let coveredFrom = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= ORDERS_MAX_PAGES; page += 1) {
    const items = await getOrders(token, undefined, { page, perPage: ORDERS_PAGE, sortBy: "-order_date" });
    const batch = Array.isArray(items) ? items : [];
    list.push(...batch);
    if (batch.length < ORDERS_PAGE) return { list, coveredFrom: 0 };
    // Sunucu sipariş tarihine göre sıralar; sayfanın son kaydı o ana kadar inildiğini gösterir.
    const last = batch[batch.length - 1];
    const ts = Date.parse(String(last?.order_date || last?.created_at || ""));
    if (!Number.isNaN(ts)) {
      coveredFrom = Math.min(coveredFrom, ts);
      // Farklı saat dilimiyle yazılmış tarihler için bir günlük pay bırakılır.
      if (ts < until - 86400000) break;
    }
  }
  return { list, coveredFrom };
}

// Sekmeye geri dönüldüğünde veri bu süreden eskiyse yeniden yüklenir.
const STALE_MS = 2 * 60 * 1000;
const DONUT_SIZE = 128;

// Özet kartı her iki temada koyu zeminlidir; üzerindeki ikincil renkler koyu paletten gelir.
const hero = palette.dark;

// Türkçe yüzde yazımı: +%12,3
function formatPct(pct: number) {
  const sign = pct >= 0 ? "+" : "-";
  return `${sign}%${Math.abs(pct).toFixed(1).replace(".", ",")}`;
}

// Sunucu dönem uzunluğuna göre günlük, haftalık ("2026-W40") ya da aylık ("2026-11") kova döndürür.
type BucketKind = "day" | "week" | "month";
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// Web Raporlar ekranındaki hazır dönemler (frontend/src/pages/ReportsPage.js).
const WEB_PRESET_KEYS = new Set(["7d", "30d", "90d"]);

function bucketKindOf(key: string): BucketKind {
  if (/^\d{4}-W\d{1,2}$/.test(key)) return "week";
  if (/^\d{4}-\d{2}$/.test(key)) return "month";
  return "day";
}

// Kova anahtarını okunur metne çevirir; ham anahtar ekrana basılmaz.
function bucketHint(bucket: { date: string; label?: string }, kind: BucketKind) {
  const key = String(bucket.date || "");
  if (kind === "week") {
    const [year, week] = key.split("-W");
    return `${Number(week)}. hafta · ${year}`;
  }
  if (kind === "month") {
    const month = MONTHS_TR[Number(key.slice(5, 7)) - 1];
    return month ? `${month} ${key.slice(0, 4)}` : bucket.label || "-";
  }
  return formatDayLabelFull(key);
}

// Grafik ve gösterge için kanal rengi; tanınmayan kanallar sırayla nötr vurgu renklerini alır.
function channelColor(provider: string, index: number, colors: Palette) {
  switch (providerKey(provider)) {
    case "woo":
      return colors.woo;
    case "trendyol":
      return colors.trendyol;
    case "hepsiburada":
      return colors.hepsiburada;
    case "n11":
      return colors.n11;
    default:
      return [colors.primary, colors.warning, colors.info, colors.success][index % 4];
  }
}

const buildFromOrders = (orderList: Order[], start: Date, end: Date): ReportsOverview => {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dayKeys.push(localDateKey(d));
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
    const dKey = localDateKey(d);
    if (!dayMap[dKey]) continue;
    const amt = Number(o.total_amount || 0);
    dayMap[dKey].revenue += amt;
    dayMap[dKey].orders += 1;
    const provider = String(o.integration_provider || o.provider || o.channel || "other").toLowerCase();
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

const computePreviousRevenue = (orderList: Order[], r: RangeT) => {
  const days = rangeDays(r);
  const prevEnd = new Date(r.start.getTime() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  let prev = 0;
  for (const o of orderList) {
    const ts = orderTimestamp(o);
    if (!ts) continue;
    const d = new Date(ts);
    if (d >= prevStart && d <= prevEnd) prev += Number(o.total_amount || 0);
  }
  return prev;
};

export default function ReportsScreen() {
  const { user: reportsUser } = useAuth();
  const { colors: guardColors } = useTheme();
  if (!canAccess(reportsUser, "reports")) {
    return (
      <View style={{ flex: 1, backgroundColor: guardColors.background }} testID="reports-screen">
        <StackHeader title="Raporlar" subtitle="Satış ve kanal analizi" />
        <EmptyState
          icon={<ChartIcon size={30} color={guardColors.textTertiary} />}
          title="Raporlara yetkiniz yok"
          description="Satış raporları hesap sahibi, müdür ve muhasebe rollerine açıktır."
        />
      </View>
    );
  }
  return <ReportsContent />;
}

function ReportsContent() {
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [range, setRange] = useState<RangeT>(() => presetRanges().find((p) => p.key === "30d")!);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // null: önceki dönem bilinmiyor (istek başarısız ya da önbellekte yok); trend gösterilmez.
  const [previousRevenue, setPreviousRevenue] = useState<number | null>(null);
  // Seçili aralıktaki siparişlerin tamamı indirilemediyse rakamlar eksiktir; ekranda belirtilir.
  const [truncated, setTruncated] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const loadSeq = useRef(0);
  const lastLoadedAt = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    // Offline cache — sadece aynı range key için
    if (!silent) {
      const cached = await loadCache<ReportsCache>("reports_cache");
      // Daha yeni bir istek başladıysa göstergeleri o yönetir.
      if (seq !== loadSeq.current) return;
      if (cached && cached.rangeKey === range.key && cached.reports) {
        setReports(cached.reports);
        setOrders(cached.orders || []);
        setPreviousRevenue(typeof cached.previousRevenue === "number" ? cached.previousRevenue : null);
        setTruncated(Boolean(cached.truncated));
        setIsOffline(true);
        setLoading(false);
      }
    }
    // Başarısız yüklemede eldeki (önbellek ya da önceki) rapor korunur; sıfırlarla ezilmez, önbelleğe yazılmaz.
    let failed = false;
    try {
      let apiFailed = false as boolean;
      let ordersFailed = false as boolean;
      const days = rangeDays(range);
      // Sunucu yalnızca başlangıç tarihi alır ve bugüne kadar hesaplar: bitişi bugün olan her aralık sunucudan gelir.
      // "Bugün" ayrı tutulur; sunucunun günü UTC gece yarısında başladığından 00:00-03:00 arası siparişler dışarıda kalır.
      const endsToday = localDateKey(range.end) === localDateKey(new Date());
      const isApiWindow = endsToday && range.key !== "today" && days > 1;
      const normalizedDays = periodDaysFromRangeKey(range.key, days);
      const apiResp = isApiWindow
        ? await getSalesReportsOverview(
            token,
            normalizedDays,
            // Web Raporlar ile aynı: hazır 7/30/90 gün dönemlerinde yalnız gün sayısı gönderilir (sunucu "şimdiden geriye"
            // sayar); başlangıç tarihi yalnız diğer aralıklarda gönderilir.
            WEB_PRESET_KEYS.has(range.key) ? undefined : { startDate: range.start, endDate: range.end }
          ).catch(() => {
            apiFailed = true;
            return null;
          })
        : null;
      if (seq !== loadSeq.current) return;
      if (apiFailed) {
        failed = true;
        return;
      }
      const apiHasData =
        apiResp &&
        (Number(apiResp.total_revenue || 0) > 0 ||
          Number(apiResp.total_orders || 0) > 0 ||
          (apiResp.daily_sales || []).length > 0 ||
          (apiResp.channel_breakdown || []).length > 0);

      const shouldUseApiDirectly = Boolean(apiHasData && isApiWindow);
      // Sunucu dönemi hesaplayabiliyorsa siparişler telefona indirilmez; en çok satanlar ve önceki dönem de sunucudan gelir.
      // Bitişi geçmişte olan aralıklarda (sunucu bitiş tarihi desteklemez) siparişler telefonda toplanır.
      let prevFromServer: number | null = null;
      if (shouldUseApiDirectly) {
        const spanMs = range.end.getTime() - range.start.getTime();
        const prevStart = new Date(range.start.getTime() - spanMs - 1);
        const wider = await getSalesReportsOverview(token, normalizedDays, { startDate: prevStart }).catch(() => null);
        if (wider) prevFromServer = Math.max(0, Number(wider.total_revenue || 0) - Number(apiResp?.total_revenue || 0));
      }
      // Önceki dönem karşılaştırması için bir dönem daha geriye inilir.
      const prevStartMs = range.start.getTime() - (range.end.getTime() - range.start.getTime()) - 1;
      const loaded = shouldUseApiDirectly
        ? { list: [] as Order[], coveredFrom: 0 }
        : await loadOrdersBack(token, prevStartMs).catch(() => {
            ordersFailed = true;
            return { list: [] as Order[], coveredFrom: 0 };
          });
      if (seq !== loadSeq.current) return;
      if (ordersFailed) {
        failed = true;
        return;
      }
      const allOrders = loaded.list;
      const isTruncated = loaded.coveredFrom > range.start.getTime();
      const prevCovered = loaded.coveredFrom <= prevStartMs;
      // Ekranda ve önbellekte yalnızca seçili aralığın siparişleri tutulur.
      const orderList = allOrders.filter((o) => {
        const ts = orderTimestamp(o);
        return ts >= range.start.getTime() && ts <= range.end.getTime();
      });
      setOrders(orderList);

      const result: ReportsOverview = shouldUseApiDirectly
        ? (apiResp as ReportsOverview)
        : buildFromOrders(orderList, range.start, range.end);
      if (apiHasData && Array.isArray(apiResp?.status_breakdown)) {
        result.status_breakdown = apiResp?.status_breakdown;
      }
      // Sunucu yolunda "önceki dönem" isteği başarısızsa değer null kalır; sahte yüzde üretilmez.
      // Önceki dönemin siparişleri tam indirilemediyse yüzde gösterilmez.
      const prevValue = shouldUseApiDirectly ? prevFromServer : prevCovered ? computePreviousRevenue(allOrders, range) : null;
      setReports(result);
      setPreviousRevenue(prevValue);
      setTruncated(isTruncated);
      setIsOffline(false);
      await saveCache("reports_cache", { reports: result, orders: orderList, rangeKey: range.key, previousRevenue: prevValue, truncated: isTruncated });
    } catch {
      failed = true;
    } finally {
      // Yalnızca en güncel istek göstergeleri kapatır; eskiyen istek yenisinin durumuna dokunmaz.
      if (seq === loadSeq.current) {
        if (failed) setIsOffline(true);
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, range]);

  // Dönem değişince önceki dönemin rakamları yeni dönemin verisiymiş gibi görünmesin diye eldeki veri düşürülür.
  const changeRange = useCallback(
    (r: RangeT) => {
      if (r.key === range.key && r.start.getTime() === range.start.getTime() && r.end.getTime() === range.end.getTime()) return;
      setReports(null);
      setOrders([]);
      setPreviousRevenue(null);
      setTruncated(false);
      setIsOffline(false);
      setLoading(true);
      setRange(r);
    },
    [range]
  );

  // İlk açılışta ve dönem ya da oturum değiştiğinde yükler.
  useEffect(() => {
    lastLoadedAt.current = Date.now();
    load();
  }, [load]);

  // Sekmeye geri dönüldüğünde yalnızca veri eskimişse yeniden yükler; ilk açılışta yukarıdaki yükleme yeterlidir.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAt.current <= STALE_MS) return;
      lastLoadedAt.current = Date.now();
      load();
    }, [load])
  );

  const totalRevenue = Number(reports?.total_revenue || 0);
  const totalOrders = Number(reports?.total_orders || 0);
  const aov = Number(reports?.average_order_value || 0);
  const channelBreakdown = (reports?.channel_breakdown || []).slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  const dailyData = reports?.daily_sales || [];

  // Seçili dönem için henüz rapor yokken sıfırlar yerine yükleniyor durumu gösterilir.
  const pending = loading && !reports;
  // Önceki dönem cirosu sıfırsa yüzde hesaplanamaz; uydurma +%100 yerine boş gösterilir.
  const trendPct: number | null =
    previousRevenue == null || previousRevenue <= 0 ? null : ((totalRevenue - previousRevenue) / previousRevenue) * 100;
  const sparkData = dailyData.map((d) => Number(d.revenue || 0));
  const topDay = dailyData.slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  const bucketKind = bucketKindOf(String(dailyData[0]?.date || ""));
  const topBucketTitle = bucketKind === "week" ? "En verimli hafta" : bucketKind === "month" ? "En verimli ay" : "En verimli gün";
  const topChannel = channelBreakdown[0];
  // Top products from orders (within range)
  const topProducts = useMemo(() => {
    // Sunucu en çok satanları veriyorsa onlar kullanılır; sunucunun sırası (adet, sonra ciro) korunur.
    const server = (reports as { top_products?: { name?: string; sales?: number; revenue?: number }[] } | null)?.top_products;
    if (Array.isArray(server) && server.length > 0 && orders.length === 0) {
      return server
        .map((p) => ({ name: String(p.name || "Ürün"), image: "", qty: Number(p.sales || 0), revenue: Number(p.revenue || 0) }))
        .slice(0, 5);
    }
    const map = new Map<string, { name: string; image: string; qty: number; revenue: number }>();
    for (const o of orders) {
      const ts = orderTimestamp(o);
      if (ts) {
        const d = new Date(ts);
        if (d < range.start || d > range.end) continue;
      }
      for (const it of (o.items || [])) {
        const key = String(it?.product_name || it?.sku || "?").trim().toLowerCase();
        if (!key || key === "?") continue;
        const existing = map.get(key) || { name: it?.product_name || it?.sku || "Ürün", image: "", qty: 0, revenue: 0 };
        existing.qty += Number(it?.quantity || 0);
        existing.revenue += Number(it?.total_price ?? Number(it?.unit_price || 0) * Number(it?.quantity || 0));
        if (!existing.image) {
          const img0 = it?.images?.[0];
          const img0Url = typeof img0 === "object" ? (img0?.url ?? "") : (img0 ?? "");
          const url = String(it?.image_url || it?.image || img0Url || "").trim();
          if (/^https?:\/\//i.test(url)) existing.image = url;
        }
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
  }, [orders, range, reports]);

  const quickPills: RangeT[] = useMemo(() => {
    const all = presetRanges();
    return [all.find((r) => r.key === "today")!, all.find((r) => r.key === "7d")!, all.find((r) => r.key === "30d")!];
  }, []);

  const isCustomActive = !quickPills.find((p) => p.key === range.key);
  const trendUp = (trendPct ?? 0) >= 0;
  // Sıra adede göre olduğundan çubuk ölçeği gösterilen satırların en yüksek cirosuna göre alınır.
  const maxProductRevenue = Math.max(1, ...topProducts.map((x) => x.revenue));
  const statusBreakdown = Array.isArray(reports?.status_breakdown) ? reports.status_breakdown : [];
  // Kart kenar boşluğu ve iç dolgusu düşüldükten sonra kalan grafik genişliği.
  const sparkWidth = Math.max(120, screenWidth - spacing.lg * 4);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="reports-screen">
      <StackHeader title="Raporlar" subtitle="Satış ve kanal analizi" />
      <NetworkErrorBanner visible={isOffline && !!reports} offline />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
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
        <ChipRow>
          {quickPills.map((p) => (
            <Chip
              key={p.key}
              testID={`reports-period-${p.key}`}
              label={p.label.replace("Son ", "")}
              selected={range.key === p.key}
              onPress={() => changeRange(p)}
            />
          ))}
          <Chip
            testID="reports-period-custom"
            label={isCustomActive ? rangeLabel(range) : "Özel"}
            selected={isCustomActive}
            onPress={() => setPickerOpen(true)}
          />
        </ChipRow>

        {pending ? (
          <View style={styles.pendingWrap} accessible accessibilityRole="progressbar" accessibilityLabel="Rapor yükleniyor" testID="reports-loading">
            <Skeleton height={220} borderRadius={radius.xl} />
            <Skeleton width="40%" height={14} style={{ marginTop: spacing.sm }} />
            <Skeleton height={168} borderRadius={radius.lg} />
            <Skeleton width="40%" height={14} style={{ marginTop: spacing.sm }} />
            <Skeleton height={168} borderRadius={radius.lg} />
          </View>
        ) : !reports ? (
          <EmptyState
            icon={<ChartIcon size={30} color={colors.textTertiary} />}
            title="Rapor yüklenemedi"
            description="Bağlantınızı kontrol edip yeniden deneyiniz."
            actionLabel="Yeniden dene"
            onAction={() => load()}
          />
        ) : (
          <>
            {truncated ? (
              <View
                testID="reports-truncated"
                accessibilityRole="alert"
                style={[styles.notice, { marginTop: 0, marginBottom: spacing.sm, backgroundColor: colors.warningBg, borderColor: colors.warning }]}
              >
                <ZapIcon size={16} color={colors.warning} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Bu aralıkta çok fazla sipariş var; rakamlar yalnızca en yeni {(ORDERS_PAGE * ORDERS_MAX_PAGES).toLocaleString("tr-TR")} siparişi kapsıyor ve eksik olabilir. Tam rakamlar için web panelindeki Raporlar sayfasını kullanınız.
                </Text>
              </View>
            ) : null}
            <SafeAnimatedView entering={FadeIn.delay(100).duration(450)} style={[styles.heroCard, shadows.lg]}>
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Svg width="100%" height="100%" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice">
                  <Defs>
                    <LinearGradient id="rpHero" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.heroGradientStart} stopOpacity="1" />
                      <Stop offset="1" stopColor={colors.heroGradientEnd} stopOpacity="1" />
                    </LinearGradient>
                    <LinearGradient id="rpGlow" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.heroAccent} stopOpacity="0.28" />
                      <Stop offset="1" stopColor={colors.heroAccent} stopOpacity="0" />
                    </LinearGradient>
                  </Defs>
                  <Path d="M0,0 L360,0 L360,240 L0,240Z" fill="url(#rpHero)" />
                  <Path d="M0,0 L360,0 L360,140 L0,200 Z" fill="url(#rpGlow)" />
                </Svg>
              </View>

              <Text style={[type.caption, { color: hero.textSecondary }]} numberOfLines={1}>
                {`Toplam ciro · ${rangeLabel(range)}`}
              </Text>
              <AnimatedNumber testID="reports-total-revenue" value={totalRevenue} format={(n) => formatTry(n)} style={[type.largeTitle, tabular, styles.heroValue]} />

              {trendPct != null ? (
              <View style={styles.heroTrendRow}>
                <View style={[styles.heroTrendPill, { backgroundColor: trendUp ? hero.successBg : hero.errorBg }]}>
                  {trendUp ? <TrendUpIcon size={14} color={hero.success} /> : <TrendDownIcon size={14} color={hero.error} />}
                  <Text style={[type.caption, tabular, { color: trendUp ? hero.success : hero.error, fontWeight: "700" }]}>{formatPct(trendPct)}</Text>
                </View>
                <Text style={[type.caption, { color: hero.textSecondary, flex: 1 }]} numberOfLines={1}>
                  önceki döneme göre
                </Text>
              </View>
            ) : null}

            <View style={styles.heroSparkWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Sparkline data={sparkData.length ? sparkData : [0, 0]} width={sparkWidth} height={70} color={colors.heroAccent} fillOpacity={0.3} />
              </View>

              <View style={styles.heroFooter}>
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heroFooterTint, { backgroundColor: hero.textPrimary }]} />
                <HeroStat label="Sipariş" value={formatCompact(totalOrders)} />
                <View style={[styles.heroFootDivider, { backgroundColor: hero.textTertiary }]} />
                <HeroStat label="Ort. sepet" value={formatTry(aov)} />
                <View style={[styles.heroFootDivider, { backgroundColor: hero.textTertiary }]} />
                <HeroStat label="Mağaza" value={String(channelBreakdown.length)} />
              </View>
            </SafeAnimatedView>

            {!loading && totalRevenue === 0 && totalOrders === 0 ? (
              <SafeAnimatedView
                entering={FadeInUp.delay(140).duration(400)}
                style={[styles.notice, { backgroundColor: colors.warningBg, borderColor: colors.warning }]}
              >
                <ZapIcon size={16} color={colors.warning} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Bu dönem için veri bulunamadı. Tarih aralığını genişletmeyi deneyin.
                </Text>
              </SafeAnimatedView>
            ) : null}

            <SafeAnimatedView entering={FadeInUp.delay(180).duration(450)}>
              <SectionTitle title="Öne çıkanlar" />
              <Card style={styles.block}>
                <InsightRow
                  icon={<TrendUpIcon size={16} color={colors.success} />}
                  label="En güçlü mağaza"
                  value={topChannel ? `${topChannel.label || topChannel.provider}` : "Veri yok"}
                  hint={topChannel ? `${formatTry(topChannel.revenue)} · ${topChannel.orders} sipariş` : undefined}
                />
                <InsightRow
                  divider
                  icon={<CheckIcon size={16} color={colors.primary} />}
                  label={topBucketTitle}
                  value={topDay ? formatTry(topDay.revenue) : "-"}
                  hint={topDay ? bucketHint(topDay, bucketKind) : undefined}
                />
                <InsightRow
                  divider
                  icon={
                    trendPct == null ? (
                      <TrendUpIcon size={16} color={colors.textTertiary} />
                    ) : trendUp ? (
                      <TrendUpIcon size={16} color={colors.success} />
                    ) : (
                      <TrendDownIcon size={16} color={colors.error} />
                    )
                  }
                  label="Önceki döneme göre değişim"
                  value={trendPct == null ? "—" : formatPct(trendPct)}
                  hint={
                    previousRevenue == null
                      ? "Önceki dönem verisi alınamadı"
                      : previousRevenue > 0
                        ? `Önceki dönem: ${formatTry(previousRevenue)}`
                        : "Önceki dönemde veri yok"
                  }
                  valueColor={trendPct == null ? colors.textTertiary : trendUp ? colors.success : colors.error}
                />
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInUp.delay(240).duration(450)}>
              <SectionTitle
                title="Mağaza dağılımı"
                action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${channelBreakdown.length} mağaza`}</Text>}
              />
              <Card padded style={styles.block}>
                {channelBreakdown.length === 0 ? (
                  <Text style={[type.footnote, { color: colors.textTertiary }]}>Bu dönem için mağaza verisi bulunamadı.</Text>
                ) : (
                  <View style={styles.donutRow}>
                    <View style={styles.donutWrap}>
                      <DonutChart
                        size={DONUT_SIZE}
                        strokeWidth={18}
                        data={channelBreakdown.map((c, idx) => ({
                          label: c.label || c.provider,
                          value: Number(c.revenue || 0),
                          color: channelColor(c.provider, idx, colors),
                        }))}
                      />
                      <View pointerEvents="none" style={styles.donutCenter}>
                        <Text style={[type.caption, { color: colors.textTertiary }]}>Toplam</Text>
                        <Text style={[type.headline, tabular, { color: colors.textPrimary }]} numberOfLines={1}>
                          {formatCompact(totalRevenue)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.legend}>
                      {channelBreakdown.slice(0, 5).map((c, i) => {
                        const pct = totalRevenue > 0 ? (Number(c.revenue || 0) / totalRevenue) * 100 : 0;
                        return (
                          <View key={`${c.provider}-${i}`} style={styles.legendRow}>
                            <View style={[styles.legendDot, { backgroundColor: channelColor(c.provider, i, colors) }]} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[type.callout, { color: colors.textPrimary, fontWeight: "600" }]} numberOfLines={1}>
                                {providerLabel(c.provider)}
                              </Text>
                              <Text style={[type.caption, tabular, { color: colors.textTertiary }]} numberOfLines={1}>
                                {`${formatTry(c.revenue)} · %${pct.toFixed(1).replace(".", ",")}`}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </Card>
            </SafeAnimatedView>

            <SafeAnimatedView entering={FadeInUp.delay(300).duration(450)}>
              <SectionTitle title="En çok satanlar" action={<Text style={[type.caption, { color: colors.textTertiary }]}>İlk 5 ürün</Text>} />
              <Card style={styles.block}>
                {topProducts.length === 0 ? (
                  <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Sipariş verisi yetersiz.</Text>
                ) : (
                  topProducts.map((p, idx) => {
                    const pct = Math.min(100, Math.max(6, Math.round((p.revenue / maxProductRevenue) * 100)));
                    return (
                      <View
                        key={`${p.name}-${idx}`}
                        accessible
                        accessibilityLabel={`${p.name}, ${formatTry(p.revenue)}, ${p.qty} adet`}
                        style={[styles.productRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                      >
                        <View style={[styles.productImgWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                          {p.image ? (
                            <Image source={{ uri: p.image }} style={styles.productImg} resizeMode="cover" />
                          ) : (
                            <PackageIcon size={20} color={colors.textTertiary} />
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <View style={[styles.productBarTrack, { backgroundColor: colors.surfaceMuted }]}>
                            <View style={[styles.productBarFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{formatTry(p.revenue)}</Text>
                          <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]}>{`${p.qty} adet`}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>
            </SafeAnimatedView>

            {statusBreakdown.length > 0 ? (
              <SafeAnimatedView entering={FadeInUp.delay(360).duration(450)}>
                <SectionTitle title="Sipariş durumu" />
                <Card padded style={styles.block}>
                  <View style={styles.statusGrid}>
                    {statusBreakdown.map((s, i) => (
                      <View key={`${s.status}-${i}`} accessible style={[styles.statusCell, { backgroundColor: colors.surfaceMuted }]}>
                        <Text style={[type.headline, tabular, { color: colors.textPrimary }]}>{s.count}</Text>
                        <Text style={[type.caption, styles.statusLabel, { color: colors.textTertiary }]} numberOfLines={1}>
                          {s.status}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </SafeAnimatedView>
            ) : null}
          </>
        )}
      </ScrollView>

      <DateRangeModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentRange={range}
        onSelect={(r) => {
          changeRange(r);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

// Özet kartının altındaki üçlü göstergeden biri.
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroFootCell} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.caption, { color: hero.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.bodyStrong, tabular, styles.heroFootValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  pendingWrap: { marginHorizontal: spacing.lg, marginTop: spacing.xs, gap: spacing.sm },
  heroCard: { marginHorizontal: spacing.lg, marginTop: spacing.xs, borderRadius: radius.xl, padding: spacing.lg, overflow: "hidden", minHeight: 220 },
  heroValue: { color: "#FFFFFF", marginTop: 2 },
  heroTrendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  heroTrendPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  heroSparkWrap: { marginVertical: spacing.sm, alignItems: "center" },
  heroFooter: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, paddingVertical: spacing.sm, overflow: "hidden" },
  heroFooterTint: { opacity: 0.08 },
  heroFootCell: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: spacing.xxs },
  heroFootDivider: { width: StyleSheet.hairlineWidth, height: 24 },
  heroFootValue: { color: "#FFFFFF", marginTop: 2 },
  notice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  donutWrap: { width: DONUT_SIZE, height: DONUT_SIZE, alignItems: "center", justifyContent: "center" },
  donutCenter: { position: "absolute", alignItems: "center", maxWidth: DONUT_SIZE - 44 },
  legend: { flex: 1, minWidth: 0, gap: spacing.sm },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  productRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 64 },
  productImgWrap: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  productImg: { width: "100%", height: "100%" },
  productBarTrack: { height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  productBarFill: { height: "100%", borderRadius: 3 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  statusCell: { paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: radius.md, minWidth: 100 },
  statusLabel: { marginTop: 2, textTransform: "capitalize" },
});
