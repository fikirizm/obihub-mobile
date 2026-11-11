import React, { useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getIntegrations, getOrders, syncIntegrationOrders } from "../../src/api";
import {
  displayOrderNo,
  displayOrderStatus,
  formatTry,
  getOrderTrackingNo,
  orderTimestamp,
  providerLabel,
  relativeDateLabel,
  statusKindFromOrder,
} from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { EmptyState } from "../../src/components/EmptyState";
import { CheckIcon, ClockIcon, CloseIcon, InboxIcon, PackageIcon, RefreshIcon, TruckIcon } from "../../src/components/Icons";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import { Button } from "../../src/ui/Button";
import { DetailHero } from "../../src/ui/DetailHero";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { IconTile, SectionTitle } from "../../src/ui/ListRow";
import { SearchField } from "../../src/ui/SearchField";
import { saveCache, loadCache } from "../../src/offlineCache";
import type { Integration, Order } from "../../src/types";

type IntegDetailCache = { orders: Order[]; integration: Integration | null };

const SYNC_COOLDOWN_MS = 60_000;
// Tek istekte çekilen sipariş sayısı (load içindeki perPage ile aynı).
const PAGE_SIZE = 200;

// Duruma göre satırın sol simgesi.
function StatusGlyph({ kind, color }: { kind: StatusKind; color: string }) {
  if (kind === "info") return <TruckIcon size={18} color={color} />;
  if (kind === "warning") return <ClockIcon size={18} color={color} />;
  if (kind === "success") return <CheckIcon size={18} color={color} />;
  if (kind === "error") return <CloseIcon size={18} color={color} />;
  return <PackageIcon size={18} color={color} />;
}

// Yüklenirken sipariş satırlarıyla aynı biçimde yer tutucu.
function RowsSkeleton({ surface, border, divider }: { surface: string; border: string; divider: string }) {
  return (
    <View
      style={[styles.skeletonCard, { backgroundColor: surface, borderColor: border }]}
      accessible
      accessibilityLabel="Siparişler yükleniyor"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: divider }]}>
          <Skeleton width={36} height={36} borderRadius={10} />
          <View style={styles.skeletonMain}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="85%" height={11} />
          </View>
          <View style={styles.trailing}>
            <Skeleton width={72} height={14} />
            <Skeleton width={56} height={20} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function IntegrationOrders() {
  const params = useLocalSearchParams<{ id: string; provider?: string }>();
  const integrationId = String(params.id || "");
  const providerHint = String(params.provider || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [search, setSearch] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState(0);
  const [tickNow, setTickNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cacheKey = `integration_detail_${integrationId}`;

  const load = async (silent = false) => {
    if (!token || !integrationId) return;
    if (!silent) {
      setLoading(true);
      const cached = await loadCache<IntegDetailCache>(cacheKey);
      if (cached) {
        setOrders(cached.orders);
        setIntegration(cached.integration);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const [list, ints] = await Promise.all([
        getOrders(token, integrationId, { page: 1, perPage: 200, sortBy: "-created_at" }),
        getIntegrations(token).catch(() => [] as Integration[]),
      ]);
      const fetchedOrders = Array.isArray(list) ? list : [];
      const found = (ints || []).find((i) => i.id === integrationId) || null;
      setOrders(fetchedOrders);
      setIntegration(found);
      setIsOffline(false);
      await saveCache(cacheKey, { orders: fetchedOrders, integration: found });
    } catch {
      // Yüklenemezse eldeki (önbellekteki) kayıtlar kalır.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast("Yeni siparişler güncellendi.", "success");
    } catch (e: any) {
      toast(e?.message || "Senkronizasyon başarısız oldu.", "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const storeName = integration?.name || providerLabel(provider) || "Mağaza";
  const channelLabel = providerLabel(provider) || storeName;
  const lastIndex = filtered.length - 1;

  // Kahraman kartındaki sayılar eldeki (yüklenmiş) siparişlerden türetilir; ek istek yapılmaz.
  const counts = useMemo(() => {
    let pending = 0;
    let shipping = 0;
    for (const o of orders) {
      const kind = statusKindFromOrder(o, provider);
      if (kind === "warning") pending += 1;
      else if (kind === "info") shipping += 1;
    }
    return { total: orders.length, pending, shipping };
  }, [orders, provider]);
  const pendingData = loading && orders.length === 0;
  const totalText = pendingData ? "—" : counts.total >= PAGE_SIZE ? `${PAGE_SIZE}+` : String(counts.total);

  const kindColor: Record<StatusKind, { fg: string; bg: string }> = {
    success: { fg: colors.success, bg: colors.successBg },
    info: { fg: colors.info, bg: colors.infoBg },
    warning: { fg: colors.warning, bg: colors.warningBg },
    error: { fg: colors.error, bg: colors.errorBg },
    neutral: { fg: colors.textTertiary, bg: colors.surfaceMuted },
  };

  const listHeader = (
    <View>
      <DetailHero
        tone="blue"
        leading={
          <View style={styles.logoTile}>
            <PlatformLogo provider={provider} size="md" />
          </View>
        }
        eyebrow="Mağaza"
        title={storeName}
        subtitle={channelLabel !== storeName ? channelLabel : undefined}
        stats={[
          { label: "Toplam", value: totalText },
          { label: "Bekleyen", value: pendingData ? "—" : String(counts.pending) },
          { label: "Kargoda", value: pendingData ? "—" : String(counts.shipping) },
        ]}
      />

      <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)} style={styles.syncBlock}>
        <Button
          testID="sync-btn"
          label="Senkronize et"
          onPress={handleSync}
          busy={syncBusy}
          disabled={remainingMs > 0}
          icon={<RefreshIcon size={18} color="#FFFFFF" />}
          style={remainingMs > 0 ? styles.syncDisabled : undefined}
        />
        <Text style={[type.caption, tabular, styles.syncNote, { color: colors.textTertiary }]} accessibilityLiveRegion="none">
          {cooldownText ? `Yeniden senkronizasyon: ${cooldownText}` : "Son 7 günün siparişleri çekilir."}
        </Text>
      </SafeAnimatedView>

      <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
        <SectionTitle title="Siparişler" />
        <SearchField testID="orders-search" value={search} onChangeText={setSearch} placeholder="Sipariş no veya müşteri ara" />
        <View style={styles.searchGap} />
      </SafeAnimatedView>
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <StackHeader title={storeName} subtitle={`${filtered.length} sipariş`} />
      <NetworkErrorBanner visible={isOffline} offline />

      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading ? (
            <RowsSkeleton surface={colors.surface} border={colors.borderSubtle} divider={colors.border} />
          ) : (
            <EmptyState
              icon={<InboxIcon size={30} color={colors.textTertiary} />}
              title="Sipariş bulunamadı"
              description="Arama ifadesini değiştirin veya senkronize ederek güncel siparişleri çekin."
            />
          )
        }
        renderItem={({ item, index }) => {
          const status = displayOrderStatus(item, provider);
          const kind = statusKindFromOrder(item, provider);
          const tone = kindColor[kind];
          const amount = formatTry(item.total_amount || 0);
          const trackingNo = getOrderTrackingNo(item);
          return (
            <View
              style={[
                styles.rowShell,
                { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                index === 0 && styles.first,
                index === lastIndex && styles.last,
              ]}
            >
              <PressableScale
                testID={`order-${item.id}`}
                onPress={() => router.push({ pathname: "/orders/[id]", params: { id: item.id, provider } })}
                accessibilityRole="button"
                accessibilityLabel={`Sipariş ${displayOrderNo(item)}, ${item.customer_name || "müşteri"}, ${amount}, ${status}`}
              >
                <View style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <IconTile tint={tone.bg}>
                    <StatusGlyph kind={kind} color={tone.fg} />
                  </IconTile>
                  <View style={styles.rowMain}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.customer_name || "Müşteri"}
                    </Text>
                    <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
                      #{displayOrderNo(item)} · {relativeDateLabel(item)}
                    </Text>
                    {trackingNo ? (
                      <Text style={[type.caption, tabular, { color: colors.textTertiary }]} numberOfLines={1}>
                        Kargo takip: {trackingNo}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.trailing}>
                    <Text
                      style={[type.bodyStrong, tabular, styles.amount, { color: colors.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {amount}
                    </Text>
                    <StatusBadge label={status} kind={kind} size="sm" />
                  </View>
                </View>
              </PressableScale>
              {/* Durum şeridi: satırın sol kenarında durum rengi. */}
              <View pointerEvents="none" style={[styles.accent, { backgroundColor: kind === "neutral" ? colors.border : tone.fg }]} />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  // Logolar açık zemin için çizildiğinden koyu kartta beyaz kutu içinde gösterilir.
  logoTile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: ON_HERO.text,
    alignItems: "center",
    justifyContent: "center",
  },
  syncBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  // Tam genişlikte: süre metni kesilmesin.
  syncNote: { paddingTop: spacing.xs, textAlign: "center" },
  syncDisabled: { opacity: 0.6 },
  searchGap: { height: spacing.sm },
  list: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  rowShell: { marginHorizontal: spacing.lg, borderLeftWidth: 1, borderRightWidth: 1, overflow: "hidden" },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 68,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 1 },
  trailing: { alignItems: "flex-end", gap: 4, flexShrink: 0, maxWidth: "46%" },
  amount: { textAlign: "right" },
  skeletonCard: { marginHorizontal: spacing.lg, borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  skeletonMain: { flex: 1, minWidth: 0, gap: 8 },
});
