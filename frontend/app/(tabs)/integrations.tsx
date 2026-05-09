import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getIntegrations } from "../../src/api";
import { providerKey, providerLabel, providerColor } from "../../src/utils";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { PressableScale } from "../../src/components/KPICard";
import { ArrowRightIcon, PlugIcon } from "../../src/components/Icons";
import type { Integration } from "../../src/types";

export default function IntegrationsScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [list, setList] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await getIntegrations(token);
      setList(Array.isArray(data) ? data : []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const grouped = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of list) {
      const k = providerKey(it.provider || it.name);
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [list]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="integrations-screen">
      <AppTopBar />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 4, marginBottom: 4 }}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>BAĞLI MAĞAZALAR</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Entegrasyonlar</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Sipariş yönetimi yapmak için bir mağaza seç.
        </Text>
      </View>

      <View style={styles.statsRow}>
        {(["trendyol", "hepsiburada", "n11", "woo"] as const).map((p, i) => (
          <SafeAnimatedView
            key={p}
            entering={FadeInDown.delay(i * 60).duration(400)}
            style={[styles.statCell, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={[styles.statDot, { backgroundColor: providerColor(p, colors.primary) }]} />
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{grouped[p] || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]} numberOfLines={1}>
              {providerLabel(p)}
            </Text>
          </SafeAnimatedView>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
            <PlugIcon size={26} color={colors.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Entegrasyon bulunamadı</Text>
          <Text style={[styles.emptyDesc, { color: colors.textTertiary }]}>
            Trendyol, Hepsiburada, n11 veya WooCommerce mağazalarını ObiHub web panelinden bağla.
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 }}
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
          renderItem={({ item, index }) => {
            const provider = String(item.provider || item.name || "");
            const accent = providerColor(provider, colors.primary);
            return (
              <SafeAnimatedView entering={FadeInDown.delay(index * 50).springify().damping(18)}>
                <PressableScale
                  testID={`integration-${item.id}`}
                  onPress={() => router.push({ pathname: "/integrations/[id]", params: { id: item.id, provider } })}
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                    shadows.sm,
                  ]}
                >
                  <View style={[styles.cardAccent, { backgroundColor: accent }]} />
                  <View style={styles.cardLeft}>
                    <PlatformLogo provider={provider} size="md" />
                    <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                      <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name || providerLabel(provider)}
                      </Text>
                      <View style={styles.cardMetaRow}>
                        <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                        <Text style={[styles.cardMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                          {providerLabel(provider)} · Bağlı
                        </Text>
                      </View>
                    </View>
                  </View>
                  <ArrowRightIcon size={18} color={colors.textTertiary} />
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
  eyebrow: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: fontWeight.bold, letterSpacing: -0.6, marginTop: 2 },
  sub: { fontSize: 13, fontWeight: fontWeight.medium, marginTop: 4, marginBottom: spacing.sm },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  statCell: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10.5, fontWeight: "600", letterSpacing: 0.3, marginTop: 2 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  cardName: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  cardMeta: { fontSize: 12, fontWeight: "500" },
  emptyWrap: { alignItems: "center", padding: spacing.xl, marginTop: spacing.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptyDesc: { fontSize: 13, textAlign: "center", paddingHorizontal: 28, lineHeight: 18, fontWeight: "500" },
});
