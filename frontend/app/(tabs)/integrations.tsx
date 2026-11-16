import React, { useCallback, useEffect, useState } from "react";
import { integrationStatus } from "../../src/integration-sync";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { TabHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Skeleton } from "../../src/components/Skeleton";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { getIntegrations, getOrderStats } from "../../src/api";
import { groupCount } from "../../src/order-filters";
import { providerLabel, isStoreIntegration } from "../../src/utils";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { PressableScale } from "../../src/components/KPICard";
import { AlertIcon, ArrowRightIcon, PlugIcon, InboxIcon, TruckIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../../src/offlineCache";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import type { Integration } from "../../src/types";

type Counts = { all: number; pending: number; shipped: number };
type IntegCache = { list: Integration[]; orderCounts: Record<string, Counts> };

// Sunucudaki entegrasyon durumları: success/connected, failed, pending. Web gibi "connected" da bağlı sayılır.
// İlk kullanım dalgası: auth_failed → "Yetki gerekli – Yeniden bağlan"; geçici hata durumu bozmaz, son hata ikincil satırda.
function statusOf(item: Integration, colors: { success: string; error: string; warning: string }) {
  const v = integrationStatus(item);
  return { label: v.label, color: colors[v.tone], note: v.note };
}

export default function IntegrationsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [list, setList] = useState<Integration[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, Counts>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    if (!silent) {
      const cached = await loadCache<IntegCache>("integrations_cache");
      if (cached) {
        setList((cached.list || []).filter(isStoreIntegration));
        setOrderCounts(cached.orderCounts || {});
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const data = await getIntegrations(token);
      // Kargo ve muhasebe bağlantıları mağaza değildir; burada yalnızca sipariş alan kanallar listelenir.
      const intList = (Array.isArray(data) ? data : []).filter(isStoreIntegration);
      setList(intList);
      // Sayılar sunucunun tüm siparişler üzerinden verdiği özetten gelir (Panel ve Siparişler ile aynı kaynak).
      const stats = await Promise.all(intList.map((it) => getOrderStats(token, it.id).catch(() => null)));
      const counts: Record<string, Counts> = {};
      intList.forEach((it, i) => {
        const st = stats[i];
        if (!st) return; // Alınamayan sayı 0 yazılmaz; kartta "—" görünür.
        // Grup sayıları (13 Kas 2026 sözleşmesi) Siparişler çipleriyle aynı; eski sunucuda ham sayılar.
        counts[it.id] = {
          all: groupCount(st, "all") ?? Number(st.total || 0),
          pending: groupCount(st, "pending") ?? Number(st.pending || 0) + Number(st.processing || 0),
          shipped: groupCount(st, "shipped") ?? Number(st.shipped || 0),
        };
      });
      setOrderCounts(counts);
      setIsOffline(false);
      await saveCache("integrations_cache", { list: intList, orderCounts: counts });
    } catch {
      if (list.length === 0 && !silent) {
        const cached = await loadCache<IntegCache>("integrations_cache");
        if (cached) { setList((cached.list || []).filter(isStoreIntegration)); setOrderCounts(cached.orderCounts || {}); setIsOffline(true); }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusLoad(load, { hasData: list.length > 0 });

  useEffect(() => {
    load();
  }, [token]);

  const totalConnected = list.length;
  // Üst özet: listedeki mağazaların zaten hesaplanmış sayıları toplanır.
  const totals = list.reduce(
    (acc, it) => {
      const c = orderCounts[it.id];
      if (c) {
        acc.pending += c.pending;
        acc.shipped += c.shipped;
      } else {
        acc.missing += 1;
      }
      if (String(it.status || "").trim().toLowerCase() === "failed") acc.problem += 1;
      return acc;
    },
    { pending: 0, shipped: 0, problem: 0, missing: 0 }
  );
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="integrations-screen">
      <TabHeader title="Mağazalar" eyebrow={`${totalConnected} bağlı mağaza`} />
      <NetworkErrorBanner visible={isOffline} offline />

      {loading ? (
        <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl} accessibilityLabel="Mağazalar yükleniyor">
          <Skeleton height={108} borderRadius={radius.xxl} style={{ marginBottom: spacing.xs }} />
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.card}>
              <View style={styles.cardTop}>
                <Skeleton width={56} height={56} borderRadius={14} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={11} />
                  <Skeleton width="35%" height={11} />
                </View>
              </View>
              <View style={styles.statRow}>
                <Skeleton height={44} borderRadius={radius.md} style={{ flex: 1 }} />
                <Skeleton height={44} borderRadius={radius.md} style={{ flex: 1 }} />
              </View>
            </Card>
          ))}
        </ScrollView>
      ) : list.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyWrap} refreshControl={refreshControl}>
          <EmptyState
            icon={<PlugIcon size={30} color={colors.primary} />}
            title="Bağlı mağaza bulunamadı"
            description="Trendyol, Hepsiburada, n11 veya WooCommerce mağazalarınızı ObiHub web panelinden bağlayın."
          />
        </ScrollView>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          ListHeaderComponent={
            <SafeAnimatedView entering={FadeInDown.duration(380)}>
              <HeroCard tone="blue" style={styles.hero}>
                <Text style={[type.caption, { color: ON_HERO.soft }]} numberOfLines={1}>
                  Mağazalarınızın özeti
                </Text>
                <View style={styles.heroStats}>
                  {[
                    { label: "Mağaza", value: totalConnected },
                    { label: "Bekleyen", value: totals.missing > 0 ? "—" : totals.pending },
                    { label: "Kargoda", value: totals.missing > 0 ? "—" : totals.shipped },
                  ].map((st) => (
                    <View key={st.label} style={[styles.heroStat, { backgroundColor: ON_HERO.faint }]}>
                      <Text style={[type.title, tabular, { color: ON_HERO.text }]} numberOfLines={1} adjustsFontSizeToFit>
                        {st.value}
                      </Text>
                      <Text style={[type.caption, { color: ON_HERO.soft }]} numberOfLines={1}>
                        {st.label}
                      </Text>
                    </View>
                  ))}
                </View>
                {totals.problem > 0 ? (
                  <View style={styles.heroNote}>
                    <AlertIcon size={14} color={ON_HERO.text} />
                    <Text style={[type.caption, tabular, { color: ON_HERO.text, flex: 1 }]} numberOfLines={2}>
                      {totals.problem} mağazada bağlantı sorunu var
                    </Text>
                  </View>
                ) : null}
              </HeroCard>
            </SafeAnimatedView>
          }
          renderItem={({ item, index }) => {
            const provider = String(item.provider || item.name || "");
            const known = orderCounts[item.id];
            const pendingText = known ? String(known.pending) : "—";
            const shippedText = known ? String(known.shipped) : "—";
            const name = item.name || providerLabel(provider);
            const st = statusOf(item, colors);
            return (
              <SafeAnimatedView entering={FadeInDown.delay(70 + Math.min(index, 8) * 60).duration(380)}>
                <PressableScale
                  testID={`integration-${item.id}`}
                  onPress={() => router.push({ pathname: "/integrations/[id]", params: { id: item.id, provider } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${providerLabel(provider)}, ${st.label}, ${known ? `${known.pending} bekleyen, ${known.shipped} kargoda` : "sipariş sayıları alınamadı"}`}
                >
                  <Card style={styles.card}>
                    <View style={styles.cardTop}>
                      <PlatformLogo provider={provider} size="lg" />
                      <View style={styles.cardBody}>
                        <Text style={[type.headline, { color: colors.textPrimary }]} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
                          {providerLabel(provider)}
                        </Text>
                        <View style={styles.metaRow}>
                          <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                          <Text style={[type.caption, styles.metaText, { color: st.color, fontWeight: "600" }]} numberOfLines={1}>
                            {st.label}
                          </Text>
                        </View>
                        {st.note ? (
                          <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                            {st.note}
                          </Text>
                        ) : null}
                      </View>
                      <ArrowRightIcon size={16} color={colors.textTertiary} />
                    </View>
                    <View style={styles.statRow}>
                      <View style={[styles.stat, { backgroundColor: colors.warningBg }]}>
                        <InboxIcon size={16} color={colors.warning} />
                        <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]} numberOfLines={1}>
                          {pendingText}
                        </Text>
                        <Text style={[type.caption, styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                          bekleyen
                        </Text>
                      </View>
                      <View style={[styles.stat, { backgroundColor: colors.primarySoft }]}>
                        <TruckIcon size={16} color={colors.primary} />
                        <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]} numberOfLines={1}>
                          {shippedText}
                        </Text>
                        <Text style={[type.caption, styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                          kargoda
                        </Text>
                      </View>
                    </View>
                  </Card>
                </PressableScale>
              </SafeAnimatedView>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  emptyWrap: { paddingTop: spacing.lg, paddingBottom: spacing.huge },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.xs, paddingBottom: spacing.huge },
  hero: { marginHorizontal: 0, marginBottom: spacing.xs },
  heroStats: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  heroStat: { flex: 1, minWidth: 0, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  heroNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  card: { padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardBody: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xxs },
  metaText: { flex: 1, minWidth: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statRow: { flexDirection: "row", gap: spacing.xs },
  stat: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, paddingHorizontal: spacing.sm, minHeight: 44 },
});
