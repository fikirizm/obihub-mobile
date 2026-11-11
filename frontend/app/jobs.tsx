import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { getSyncJobs, retrySyncJobs } from "../src/api";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, type } from "../src/theme/tokens";
import { RefreshIcon } from "../src/components/Icons";
import { EmptyState } from "../src/components/EmptyState";
import { OrderCardSkeleton } from "../src/components/Skeleton";
import { StatusBadge } from "../src/components/StatusBadge";
import { Button } from "../src/ui/Button";
import { Chip, ChipRow } from "../src/ui/Chip";
import { useFeedback } from "../src/ui/Feedback";
import { StackHeader } from "../src/ui/Header";
import type { SyncJob } from "../src/types";

type Filter = "all" | "failed" | "success";

function when(ts?: string) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default function JobsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
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
          renderItem={({ item }) => {
            const ok = item.status === "success";
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <View style={styles.cardHead}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                    {item.product_name || item.sku || "Ürün"}
                  </Text>
                  <StatusBadge label={ok ? "Başarılı" : "Başarısız"} kind={ok ? "success" : "error"} size="sm" />
                </View>
                <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                  {[item.integration_name || item.provider_label || item.provider, when(item.timestamp)].filter(Boolean).join(" · ")}
                </Text>
                {item.message ? <Text style={[type.footnote, { color: colors.textSecondary, marginTop: spacing.xs }]}>{item.message}</Text> : null}
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
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<RefreshIcon size={30} color={colors.textTertiary} />}
              title={error ? "İşler yüklenemedi" : filter === "failed" ? "Başarısız iş yok" : "Kayıt yok"}
              description={error || "Ürün eşitleme işleri burada listelenir."}
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
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
});
