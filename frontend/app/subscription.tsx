import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { getTrialStatus, getUsageSummary } from "../src/api";
import { useTheme } from "../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../src/theme/tokens";
import { formatDate } from "../src/utils";
import { StackHeader } from "../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../src/ui/ListRow";
import type { TrialStatus, UsageSummary } from "../src/types";

const STATUS_LABELS: Record<string, string> = { active: "Etkin", trial: "Deneme", expired: "Süresi doldu", suspended: "Duraklatıldı", cancelled: "İptal edildi" };
// Entegrasyon sınırına tabi sayaç `billable_integrations` alanıdır (muhasebe bağlantıları sayılmaz).
const USAGE_ROWS: { key: string; label: string; usageKey?: string }[] = [
  { key: "integrations", usageKey: "billable_integrations", label: "Entegrasyon" },
  { key: "products", label: "Ürün" },
  { key: "orders_monthly", label: "Aylık sipariş" },
];

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

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="subscription-screen">
      <StackHeader title="Abonelik" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <SectionTitle title="Paket" />
          <Card style={styles.block}>
            <ListRow title="Paket" trailing={<Value>{trial?.is_trial ? "Deneme" : trial?.plan ? trial.plan.charAt(0).toLocaleUpperCase("tr-TR") + trial.plan.slice(1) : "-"}</Value>} />
            <ListRow divider title="Durum" trailing={<Value>{STATUS_LABELS[String(trial?.subscription_status)] || trial?.subscription_status || "-"}</Value>} />
            {trial?.expires_at ? <ListRow divider title="Bitiş tarihi" trailing={<Value>{formatDate(trial.expires_at)}</Value>} /> : null}
            {typeof days === "number" ? (
              <ListRow divider title="Kalan süre" trailing={<Value tone={days <= 7 ? colors.error : undefined}>{days > 0 ? `${days} gün` : "Süre doldu"}</Value>} />
            ) : null}
          </Card>

          {usage?.limits ? (
            <>
              <SectionTitle title="Kullanım" />
              <Card style={styles.block}>
                {USAGE_ROWS.filter((r) => usage.limits?.[r.key] != null).map((r, i) => {
                  const used = Number(usage.usage?.[r.usageKey ?? r.key] ?? usage.usage?.[r.key] ?? 0);
                  const limit = Number(usage.limits?.[r.key] || 0);
                  return <ListRow key={r.key} divider={i > 0} title={r.label} trailing={<Value tone={limit > 0 && used >= limit ? colors.error : undefined}>{`${used} / ${limit}`}</Value>} />;
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

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg } });
