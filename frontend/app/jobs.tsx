import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { getSyncJobs, retrySyncJobs } from "../src/api";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, type } from "../src/theme/tokens";
import { FadeInDown } from "react-native-reanimated";
import { AlertIcon, CheckIcon, RefreshIcon } from "../src/components/Icons";
import { SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { EmptyState } from "../src/components/EmptyState";
import { OrderCardSkeleton } from "../src/components/Skeleton";
import { StatusBadge } from "../src/components/StatusBadge";
import { Button } from "../src/ui/Button";
import { Chip, ChipRow } from "../src/ui/Chip";
import { useFeedback } from "../src/ui/Feedback";
import { StackHeader } from "../src/ui/Header";
import { IconTile } from "../src/ui/ListRow";
import { StatCard } from "../src/ui/RowCard";
import type { SyncJob } from "../src/types";

type Filter = "all" | "failed" | "success";

function when(ts?: string) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default function JobsScreen() {
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const { toast } = useFeedback();
  const [filter, setFilter] = useState<Filter>("failed");
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      try {
        const res = await getSyncJobs(token, { status: filter === "all" ? undefined : filter });
        setJobs(res.items);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "İşler yüklenemedi.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filter]
  );

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (job: SyncJob) => {
    if (!token) return;
    setRetryingId(job.id);
    try {
      const res = await retrySyncJobs(token, [job.id]);
      if ((res?.success_count ?? 0) > 0) toast("İş yeniden çalıştırıldı", "success");
      else toast("İş yeniden denendi ama başarısız oldu.", "error");
      await load(true);
    } catch (e: any) {
      toast(e?.message || "Yeniden denenemedi.", "error");
    } finally {
      setRetryingId(null);
    }
  };

  const failedCount = jobs.filter((j) => j.status !== "success").length;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="jobs-screen">
      <StackHeader title="Senkron işleri" subtitle="Son 25 kayıt" />
      <ChipRow>
        <Chip label="Başarısız" selected={filter === "failed"} onPress={() => setFilter("failed")} testID="jobs-filter-failed" />
        <Chip label="Başarılı" selected={filter === "success"} onPress={() => setFilter("success")} />
        <Chip label="Tümü" selected={filter === "all"} onPress={() => setFilter("all")} />
      </ChipRow>
      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
          ListHeaderComponent={
            filter === "all" && jobs.length > 0 ? (
              <SafeAnimatedView entering={FadeInDown.duration(380)} style={styles.stats}>
                <StatCard label="Listelenen" value={String(jobs.length)} />
                <StatCard label="Başarısız" value={String(failedCount)} tone={failedCount > 0 ? "error" : undefined} />
                <StatCard label="Başarılı" value={String(jobs.length - failedCount)} tone="success" />
              </SafeAnimatedView>
            ) : null
          }
          renderItem={({ item, index }) => {
            const ok = item.status === "success";
            const tone = ok ? colors.success : colors.error;
            // Sunucu, ürünü bulunamayan ve iletisi olmayan kayıtlarda "-" yer tutucusu döndürür; veri sayılmaz.
            const real = (v?: string) => (v && v.trim() !== "-" ? v.trim() : "");
            const title = real(item.product_name) || (item.sku ? `SKU ${item.sku}` : "Silinmiş ürün");
            const message = real(item.message);
            const card = (
              <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <View style={[styles.accent, { backgroundColor: tone }]} />
                <View style={styles.cardHead}>
                  <IconTile tint={ok ? colors.successBg : colors.errorBg}>
                    {ok ? <CheckIcon size={18} color={tone} /> : <AlertIcon size={18} color={tone} />}
                  </IconTile>
                  <View style={styles.cardBody}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={2}>
                      {[item.integration_name || item.provider_label || item.provider, when(item.timestamp)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <StatusBadge label={ok ? "Başarılı" : "Başarısız"} kind={ok ? "success" : "error"} size="sm" />
                </View>
                {message ? (
                  <View style={[styles.message, { backgroundColor: ok ? colors.surfaceMuted : colors.errorBg }]}>
                    <Text style={[type.footnote, { color: colors.textSecondary }]}>{message}</Text>
                  </View>
                ) : null}
                {!ok && item.retryable ? (
                  <Button
                    testID={`job-retry-${item.id}`}
                    label="Yeniden dene"
                    variant="secondary"
                    size="sm"
                    icon={<RefreshIcon size={16} color={colors.textPrimary} />}
                    busy={retryingId === item.id}
                    disabled={Boolean(retryingId)}
                    onPress={() => retry(item)}
                    style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}
                  />
                ) : null}
              </View>
            );
            return index < 8 ? (
              <SafeAnimatedView entering={FadeInDown.delay(60 + index * 35).duration(320)}>{card}</SafeAnimatedView>
            ) : (
              card
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={
                error ? (
                  <AlertIcon size={30} color={colors.error} />
                ) : filter === "failed" ? (
                  <CheckIcon size={30} color={colors.success} />
                ) : (
                  <RefreshIcon size={30} color={colors.primary} />
                )
              }
              title={error ? "İşler yüklenemedi" : filter === "failed" ? "Başarısız iş yok" : "Kayıt yok"}
              description={error || (filter === "failed" ? "Son kayıtlarda başarısız ürün eşitleme işi görünmüyor." : "Ürün eşitleme işleri burada listelenir.")}
              actionLabel={error ? "Tekrar dene" : undefined}
              onAction={error ? () => load() : undefined}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.huge },
  stats: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  accent: { position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardBody: { flex: 1, minWidth: 0 },
  message: { marginTop: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
