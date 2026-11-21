// Menü → İade talepleri (ENT-1/S3): Trendyol ve Hepsiburada iade talepleri. Yalnız okur ve bilgilendirir; stok kendiliğinden
// değişmez. "Şimdi oku" POST /marketplace-returns/sync; "Yok say" yalnız stok önerisini kapatır. Kurallar: src/marketplace-returns.ts.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { afterDismiss, alertText, dismissPath, FILTERS, returnsPath, rowView, syncPath, syncResult } from "../../src/marketplace-returns";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, InboxIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Note } from "../../src/components/sms/SmsParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

export default function MarketplaceReturnsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    try {
      const d = await request<any>(returnsPath(filter), { method: "GET" }, token);
      if (my !== seq.current) return;
      setData(d);
      setError("");
    } catch (e: any) {
      if (my !== seq.current) return;
      setError(Number(e?.status) === 403 ? "İade taleplerini görme yetkiniz yok (Satış yetkisi gerekir)." : "İade talepleri alınamadı. Bağlantınızı kontrol edip yeniden deneyin.");
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [token, filter]);
  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    if (!token || syncing) return;
    setSyncing(true);
    try {
      const r = syncResult(await request<any>(syncPath, { method: "POST", body: "{}" }, token));
      toast(r.text, r.kind);
      await load();
    } catch {
      toast("İadeler okunamadı. Biraz sonra yeniden deneyin.", "error");
    } finally {
      setSyncing(false);
    }
  };
  const dismiss = async (id: string) => {
    if (!token) return;
    try {
      await request<any>(dismissPath(id), { method: "POST", body: "{}" }, token);
      setData((d: any) => afterDismiss(d, id));
    } catch {
      toast("İşlem kaydedilemedi.", "error");
    }
  };

  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const alert = alertText(Number(data?.summary?.stock_action_needed) || 0);
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="returns-screen">
      <StackHeader
        title="İade talepleri"
        subtitle="Trendyol ve Hepsiburada"
        right={<Button testID="returns-sync" size="sm" variant="secondary" label={syncing ? "Okunuyor…" : "Şimdi oku"} busy={syncing} disabled={syncing} onPress={sync} />}
      />
      <View style={styles.block}>
        <OptionChips options={FILTERS.map((f) => ({ value: f.id, label: f.label }))} value={filter} onChange={setFilter} testIDPrefix="returns-filter" />
        <Text style={[type.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>Stok kendiliğinden değişmez; stoğa geri alma kararı sizindir.</Text>
      </View>
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="İadeler okunamadı" description={error} actionLabel="Yeniden dene" onAction={load} />
      ) : !data ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.huge, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
        >
          {alert ? (
            <View style={styles.block}>
              <Note tone="warning" testID="returns-stock-alert">{alert}</Note>
            </View>
          ) : null}
          {!items.length ? (
            <EmptyState
              icon={<InboxIcon size={30} color={colors.textTertiary} />}
              title="Henüz iade talebi yok"
              description="Müşteri iade başlattığında burada görünür. Sipariş çekimi sırasında otomatik okunur."
            />
          ) : null}
          {items.map((raw) => {
            const r = rowView(raw);
            return (
              <Card key={r.id} style={styles.block}>
                <View style={styles.row} testID={`return-row-${r.id}`}>
                  <View style={styles.top}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>{r.title}</Text>
                    {r.stateLabel ? <StatusBadge label={r.stateLabel} kind={r.tone} size="sm" /> : null}
                  </View>
                  {r.sub ? <Text style={[type.caption, { color: colors.textTertiary }]}>{r.sub}</Text> : null}
                  {r.lines.map((l, i) => (
                    <Text key={i} style={[type.footnote, { color: colors.textSecondary }]}>{`• ${l}`}</Text>
                  ))}
                  {r.advice ? (
                    <View style={[styles.advice, { backgroundColor: r.advice.dismissable ? colors.warningBg : colors.surfaceMuted }]} testID={`return-advice-${r.id}`}>
                      <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{r.advice.message}</Text>
                      {r.advice.dismissable ? <Button testID={`return-dismiss-${r.id}`} size="sm" variant="ghost" label="Yok say" onPress={() => dismiss(r.id)} /> : null}
                    </View>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  row: { padding: spacing.md, gap: 4 },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  advice: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs },
});
