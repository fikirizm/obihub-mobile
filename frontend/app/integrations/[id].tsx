import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getIntegrations, getOrders, getOrdersPage, getOrderStats } from "../../src/api";
import { groupCount, ORDER_GROUPS, orderQuery, type OrderGroupKey } from "../../src/order-filters";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { syncErrorView } from "../../src/sync-error";
import { rememberOrderRow, storeSyncDays, storeSyncMessage, syncOrderByNumber, syncStoreOrders } from "../../src/api-siparis";
import { FormField } from "../../src/ui/FormField";
import type { OrderStats } from "../../src/api";
import { useDebounce } from "../../src/hooks/useDebounce";
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
import { integrationStatus, jobIdOf, jobIdOfError, jobView } from "../../src/integration-sync";
import { request } from "../../src/api";

type IntegDetailCache = { orders: Order[]; integration: Integration | null; stats?: OrderStats | null };

const SYNC_COOLDOWN_MS = 60_000;
// Ekranda tutulan en yeni sipariş sayısı (load içindeki perPage ile aynı).
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
  const debouncedSearch = useDebounce(search.trim(), 350);
  // Sunucunun tüm siparişler üzerinden verdiği sayılar; alınamazsa null kalır ve "—" gösterilir.
  const [stats, setStats] = useState<OrderStats | null>(null);
  // Durum süzgeci (kullanıcı isteği 13 Kas 2026): "Tümü" dışındaki grupta liste SUNUCUDAN, mağaza + durum (+ arama) ile
  // sayfa sayfa gelir; yalnız yüklenen sayfayı süzmez.
  const [group, setGroup] = useState<OrderGroupKey>("all");
  const [groupItems, setGroupItems] = useState<Order[]>([]);
  const [groupPage, setGroupPage] = useState(1);
  const [groupPages, setGroupPages] = useState(1);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupMore, setGroupMore] = useState(false);
  const groupSeq = useRef(0);
  // Aramada, ekrandaki son siparişlerin dışında kalan eşleşmeler sunucudan gelir.
  const [remoteHits, setRemoteHits] = useState<Order[]>([]);
  // Uzak sonuçların ait olduğu arama metni; metin değişince eski sonuçlar listeye karışmaz.
  const [remoteQuery, setRemoteQuery] = useState("");
  const searchSeq = useRef(0);
  const [syncBusy, setSyncBusy] = useState(false);
  // İlk kullanım dalgası: geniş aralıklı çekim arka plan işi (202 + job_id) — GET /integration-jobs/{id} ile izlenir.
  const [job, setJob] = useState<{ id: string; view: ReturnType<typeof jobView> } | null>(null);
  const jobTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (jobTimer.current) clearTimeout(jobTimer.current);
  }, []);
  const watchJob = (id: string) => {
    if (jobTimer.current) clearTimeout(jobTimer.current);
    setJob({ id, view: jobView({ state: "running" }) });
    const tick = async () => {
      if (!token) return;
      try {
        const j = await request<any>(`/integration-jobs/${encodeURIComponent(id)}`, { method: "GET" }, token);
        const v = jobView(j);
        setJob({ id, view: v });
        if (v.phase === "running") jobTimer.current = setTimeout(tick, 2500);
        else {
          toast(v.text, v.tone === "error" ? "error" : v.tone === "success" ? "success" : "info");
          load(true);
        }
      } catch (e: any) {
        setJob({ id, view: { phase: "failed", percent: null, text: e?.message || "Çekim durumu okunamadı; entegrasyon listesinden kontrol edin.", tone: "error" } });
      }
    };
    jobTimer.current = setTimeout(tick, 1500);
  };
  const [cooldownEnd, setCooldownEnd] = useState(0);
  // Web "Sipariş no ile getir" (Hepsiburada'da ayrı uç). Bekleme süresine tabi değildir; tek siparişi çeker.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupNo, setLookupNo] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
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
        if (cached.stats) setStats(cached.stats);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      // Sipariş tarihine göre en yeni kayıtlar (created_at kaydın sisteme düştüğü andır, sipariş tarihi değildir).
      const [list, ints, st] = await Promise.all([
        getOrders(token, integrationId, { page: 1, perPage: PAGE_SIZE, sortBy: "-order_date" }),
        getIntegrations(token).catch(() => [] as Integration[]),
        getOrderStats(token, integrationId).catch(() => null),
      ]);
      const fetchedOrders = Array.isArray(list) ? list : [];
      const found = (ints || []).find((i) => i.id === integrationId) || null;
      setOrders(fetchedOrders);
      setIntegration(found);
      setStats(st);
      setIsOffline(false);
      await saveCache(cacheKey, { orders: fetchedOrders, integration: found, stats: st });
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

  useEffect(() => {
    const seq = ++searchSeq.current;
    if (!token || !integrationId || debouncedSearch.length < 2) {
      setRemoteHits([]);
      return;
    }
    getOrdersPage(token, { page: 1, perPage: 50, search: debouncedSearch, integrationId })
      .then((res) => {
        if (seq !== searchSeq.current) return;
        setRemoteHits(res.items);
        setRemoteQuery(debouncedSearch);
      })
      .catch(() => {
        if (seq === searchSeq.current) setRemoteHits([]);
      });
  }, [token, integrationId, debouncedSearch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return [...orders].sort((a, b) => orderTimestamp(b) - orderTimestamp(a));
    // Ekranda görünen sipariş numarası (ör. Trendyol sipariş numarası) da aranır.
    const local = orders.filter((o) =>
      [o.channel_order_id, o.trendyol_order_number, displayOrderNo(o), o.customer_name].some((v) =>
        String(v || "").toLocaleLowerCase("tr-TR").includes(q)
      )
    );
    const seen = new Set(local.map((o) => o.id));
    // Uzak sonuçlar yalnızca o anki arama metnine aitse eklenir.
    const remote = remoteQuery === search.trim() ? remoteHits : [];
    const merged = [...local, ...remote.filter((o) => !seen.has(o.id))];
    return merged.sort((a, b) => orderTimestamp(b) - orderTimestamp(a));
  }, [orders, search, remoteHits, remoteQuery]);

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
      // Web ile aynı uçlar (Idefix, Pazarama, Amazon dahil); success:false hata sayılır, Woo'da tarihler yeniden çekilir.
      const r = await syncStoreOrders(token, integration);
      setCooldownEnd(Date.now() + SYNC_COOLDOWN_MS);
      const jid = jobIdOf(r);
      if (jid) {
        toast(r?.message || "Çekim arka planda başladı.", "info");
        watchJob(jid);
        return;
      }
      await load(true);
      toast(storeSyncMessage(r), "success");
    } catch (e: any) {
      // Dalga 4: 429 / 5xx geçici — entegrasyon bozulmaz; sunucu metni ve bekleme süresi.
      // Aynı entegrasyonda çekim sürüyorsa (409 + X-Job-Id) o iş izlenir, yeniden başlatılmaz.
      const running = jobIdOfError(e);
      if (running) {
        toast("Bu mağazada çekim zaten sürüyor; ilerleme gösteriliyor.", "info");
        watchJob(running);
        return;
      }
      const v = syncErrorView(e);
      if (v.cooldownMs) setCooldownEnd(Date.now() + v.cooldownMs);
      toast(v.text, v.tone);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleLookup = async () => {
    const no = lookupNo.trim();
    if (!token || !integration || lookupBusy || !no) return;
    setLookupBusy(true);
    try {
      const r = await syncOrderByNumber(token, integration, no);
      await load(true);
      const found = Number(r?.count || 0) + Number(r?.updated_count || 0) + Number(r?.total_fetched || 0) > 0;
      toast(found ? r?.message || `#${no} getirildi.` : r?.message || `#${no} mağazada bulunamadı.`, found ? "success" : "info");
      if (found) {
        setLookupNo("");
        setLookupOpen(false);
        setSearch(no);
      }
    } catch (e: any) {
      toast(e?.message || "Sipariş getirilemedi.", "error");
    } finally {
      setLookupBusy(false);
    }
  };

  const fetchGroup = async (page: number) => {
    if (!token || !integrationId || group === "all") return;
    const seq = ++groupSeq.current;
    if (page === 1) setGroupLoading(true);
    else setGroupMore(true);
    try {
      const res = await getOrdersPage(token, { page, perPage: PAGE_SIZE, sortBy: "-order_date", ...orderQuery({ group, integrationId, search: debouncedSearch }) });
      if (seq !== groupSeq.current) return;
      setGroupItems((prev) => (page === 1 ? res.items : [...prev, ...res.items.filter((o) => !prev.some((p) => p.id === o.id))]));
      setGroupPage(page);
      setGroupPages(res.totalPages);
    } catch (e: any) {
      if (seq === groupSeq.current) toast(e?.message || "Siparişler yüklenemedi.", "error");
    } finally {
      if (seq === groupSeq.current) {
        setGroupLoading(false);
        setGroupMore(false);
      }
    }
  };
  useEffect(() => {
    if (group === "all") {
      groupSeq.current++;
      setGroupItems([]);
      return;
    }
    fetchGroup(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, debouncedSearch, token, integrationId]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
    if (group !== "all") fetchGroup(1);
  };

  const storeName = integration?.name || providerLabel(provider) || "Mağaza";
  const channelLabel = providerLabel(provider) || storeName;

  // Kahraman kartındaki sayılar sunucunun mağaza özetinden gelir (Panel ve Siparişler ile aynı kaynak).
  // Özet alınamadıysa eldeki kayıtlardan tahmin yürütülmez; "—" gösterilir.
  const totalText = stats ? String(stats.total || 0) : "—";
  const pendingText = stats ? String(Number(stats.pending || 0) + Number(stats.processing || 0)) : "—";
  const shippingText = stats ? String(stats.shipped || 0) : "—";
  const searching = search.trim().length > 0;
  const grouped = group !== "all";
  const listData = grouped ? groupItems : filtered;
  const lastIndex = listData.length - 1;
  const hasOlder = !searching && orders.length >= PAGE_SIZE && (!stats || Number(stats.total || 0) > orders.length);

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
          { label: "Bekleyen", value: pendingText },
          { label: "Kargoda", value: shippingText },
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
        {job ? (
          <View testID="sync-job" style={[styles.jobBox, { backgroundColor: job.view.tone === "error" ? colors.errorBg : job.view.tone === "success" ? colors.successBg : colors.infoBg }]}>
            <Text style={[type.footnote, { color: colors.textPrimary }]}>{job.view.text}</Text>
            {job.view.phase === "running" ? (
              <View style={[styles.jobTrack, { backgroundColor: colors.border }]}>
                <View style={{ width: `${job.view.percent ?? 10}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 3 }} />
              </View>
            ) : null}
          </View>
        ) : null}
        {integration && integrationStatus(integration).reconnect ? (
          <Text testID="integration-reconnect" style={[type.footnote, { color: colors.error }]}>
            {integrationStatus(integration).label}: mağaza API bilgilerini web panelinde Entegrasyonlar'dan yenileyin.
          </Text>
        ) : integration && integrationStatus(integration).note ? (
          <Text style={[type.caption, { color: colors.textTertiary }]}>{integrationStatus(integration).note}</Text>
        ) : null}
        <Text style={[type.caption, tabular, styles.syncNote, { color: colors.textTertiary }]} accessibilityLiveRegion="none">
          {cooldownText ? `Yeniden senkronizasyon: ${cooldownText}` : `Son ${storeSyncDays(integration?.provider || provider)} günün siparişleri çekilir.`}
        </Text>
        {lookupOpen ? (
          <View style={styles.lookupRow} testID="lookup-row">
            <FormField
              testID="lookup-input"
              label="Sipariş numarası"
              value={lookupNo}
              onChangeText={setLookupNo}
              placeholder="Örn. 4012345678"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleLookup}
              style={{ flex: 1 }}
            />
            <Button testID="lookup-btn" size="sm" label="Getir" busy={lookupBusy} disabled={!lookupNo.trim()} onPress={handleLookup} style={styles.lookupBtn} />
          </View>
        ) : (
          <Button testID="lookup-open" size="sm" variant="ghost" label="Sipariş no ile getir" onPress={() => setLookupOpen(true)} />
        )}
      </SafeAnimatedView>

      <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
        <SectionTitle title="Siparişler" />
        <SearchField testID="orders-search" value={search} onChangeText={setSearch} placeholder="Sipariş no veya müşteri ara" />
        <View style={{ marginTop: spacing.sm }}>
          <ChipRow>
            {ORDER_GROUPS.map((g) => (
              <Chip key={g.key} testID={`store-filter-${g.key}`} label={g.label} count={groupCount(stats, g.key)} selected={group === g.key} onPress={() => setGroup(g.key)} />
            ))}
          </ChipRow>
        </View>
        <View style={styles.searchGap} />
      </SafeAnimatedView>
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <StackHeader
        title={storeName}
        subtitle={`${grouped ? groupCount(stats, group) ?? groupItems.length : searching || !stats ? filtered.length : stats.total || 0} sipariş`}
      />
      <NetworkErrorBanner visible={isOffline} offline />

      <FlatList
        data={loading || (grouped && groupLoading) ? [] : listData}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          grouped ? (
            groupPage < groupPages && !groupLoading ? (
              <Button testID="store-group-more" variant="secondary" label="Daha fazla sipariş" busy={groupMore} onPress={() => fetchGroup(groupPage + 1)} style={{ marginTop: spacing.md }} />
            ) : null
          ) : hasOlder && !loading ? (
            <Text style={[type.caption, tabular, styles.olderNote, { color: colors.textTertiary }]}>
              En yeni {PAGE_SIZE} sipariş listeleniyor. Daha eski bir siparişi bulmak için arama kutusunu kullanın.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          loading || (grouped && groupLoading) ? (
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
                onPress={() => {
                  rememberOrderRow(item);
                  router.push({ pathname: "/orders/[id]", params: { id: item.id, provider } });
                }}
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
  jobBox: { padding: 10, borderRadius: 10, gap: 6, marginTop: 8 },
  jobTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
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
  lookupRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingTop: spacing.sm },
  lookupBtn: { minWidth: 76 },
  syncDisabled: { opacity: 0.6 },
  searchGap: { height: spacing.sm },
  olderNote: { textAlign: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.md },
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
