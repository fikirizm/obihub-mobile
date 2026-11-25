import React, { useCallback, useEffect, useState } from "react";
import { FormSkeleton } from "../src/components/Skeleton";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { getTrialStatus, getUsageSummary } from "../src/api";
import { useTheme } from "../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../src/theme/tokens";
import { formatDate } from "../src/utils";
import { nextPlanView, planName, renewalNotice, usageBars } from "../src/subscription-ui";
import { AlertIcon, ClockIcon } from "../src/components/Icons";
import { StackHeader } from "../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../src/ui/ListRow";
import type { TrialStatus, UsageSummary } from "../src/types";

const STATUS_LABELS: Record<string, string> = { active: "Etkin", trial: "Deneme", expired: "Süresi doldu", suspended: "Duraklatıldı", cancelled: "İptal edildi" };

// Abonelik yalnızca görüntülenir; satın alma ve paket değişikliği web panelinden yapılır.
export default function SubscriptionScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [t, u] = await Promise.all([getTrialStatus(token).catch(() => null), getUsageSummary(token).catch(() => null)]);
    setTrial(t);
    setUsage(u);
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const Value = ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
    <Text style={[type.callout, tabular, { color: tone || colors.textSecondary }]}>{children}</Text>
  );
  const days = trial?.days_left;
  // Bitişe 14 gün ya da daha az kalınca yalnız bilgi (ödeme bağlantısı / fiyat yok: App Store kuralı).
  const notice = renewalNotice(trial);
  const bars = usageBars(trial, usage);
  // D2-C: web'de seçilen sonraki dönem paketi (salt okunur).
  const next = nextPlanView((trial as any)?.next_plan);
  const tone = notice?.tone === "error" ? colors.error : notice?.tone === "warning" ? colors.warning : colors.info;
  const toneBg = notice?.tone === "error" ? colors.errorBg : notice?.tone === "warning" ? colors.warningBg : colors.infoBg;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="subscription-screen">
      <StackHeader title="Abonelik" />
      {loading ? (
        <FormSkeleton fields={2} label="Abonelik yükleniyor" />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {notice ? (
            <View testID="renewal-notice" accessibilityRole="alert" style={[styles.notice, { backgroundColor: toneBg, borderColor: colors.borderSubtle }]}>
              {notice.tone === "error" ? <AlertIcon size={18} color={tone} /> : <ClockIcon size={18} color={tone} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{notice.title}</Text>
                <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 2 }]}>{notice.body}</Text>
              </View>
            </View>
          ) : null}
          <SectionTitle title="Paket" />
          <Card style={styles.block}>
            <ListRow title="Paket" trailing={<Value>{trial?.is_trial ? "Deneme" : planName(trial?.plan)}</Value>} />
            <ListRow divider title="Durum" trailing={<Value>{STATUS_LABELS[String(trial?.subscription_status)] || trial?.subscription_status || "-"}</Value>} />
            {trial?.expires_at ? <ListRow divider title="Bitiş tarihi" trailing={<Value>{formatDate(trial.expires_at)}</Value>} /> : null}
            {typeof days === "number" ? (
              <ListRow divider title="Kalan süre" trailing={<Value tone={days <= 7 ? colors.error : undefined}>{days > 0 ? `${days} gün` : "Süre doldu"}</Value>} />
            ) : null}
          </Card>

          {next ? (
            <>
              <SectionTitle title="Sonraki dönem paketi" />
              <Card style={styles.block}>
                <View testID="next-plan" style={styles.nextBody}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{next.status}</Text>
                  <Text style={[type.footnote, { color: colors.textSecondary }]}>{next.detail}</Text>
                  {next.overflow.length ? (
                    <View testID="next-plan-overflow" accessibilityRole="alert" style={[styles.overflow, { backgroundColor: colors.warningBg }]}>
                      <Text style={[type.footnote, { color: colors.textPrimary, fontWeight: "700" }]}>Yeni paketin limitlerini aşan kullanımınız var</Text>
                      {next.overflow.map((r) => (
                        <View key={r.key} style={styles.overflowRow}>
                          <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{r.label}</Text>
                          <Text style={[type.footnote, tabular, { color: colors.textPrimary }]}>{r.text}</Text>
                        </View>
                      ))}
                      {next.note ? <Text style={[type.caption, { color: colors.textSecondary }]}>{next.note}</Text> : null}
                    </View>
                  ) : null}
                </View>
              </Card>
            </>
          ) : null}

          {bars.length ? (
            <>
              <SectionTitle title="Kullanım" />
              <Card style={styles.block}>
                {bars.map((b, i) => {
                  const fill = b.tone === "error" ? colors.error : b.tone === "warning" ? colors.warning : colors.primary;
                  return (
                    <View
                      key={b.key}
                      testID={`usage-${b.key}`}
                      accessible
                      accessibilityLabel={`${b.label}: ${b.used} / ${b.limit}`}
                      style={[styles.bar, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                    >
                      <View style={styles.barHead}>
                        <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{b.label}</Text>
                        <Text style={[type.callout, tabular, { color: b.tone === "error" ? colors.error : colors.textSecondary }]}>
                          {`${b.used.toLocaleString("tr-TR")} / ${b.limit.toLocaleString("tr-TR")}`}
                        </Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: colors.border }]}>
                        <View style={[styles.fill, { width: `${Math.max(b.used > 0 ? 3 : 0, b.ratio * 100)}%`, backgroundColor: fill }]} />
                      </View>
                      {b.tone === "error" ? (
                        <Text style={[type.caption, { color: colors.error, marginTop: 6 }]}>Sınıra ulaşıldı.</Text>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          <Text style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.md }]}>
            Paket ve ödeme işlemleri ObiHub web panelinden yapılır.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  bar: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  nextBody: { padding: spacing.md, gap: 4 },
  overflow: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: 12, gap: 4 },
  overflowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  notice: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1 },
});
