// Dalga 5a (P5.2): Tekrarlayan belgeler — GET /recurring-documents; durdur / sürdür (POST /{id}/pause|resume; sürdürünce kaçırılan
// dönemler geriye üretilmez). Plan oluşturma ve düzenleme web panelinde. Ekip üyesi yetkisi plan türüne göre (sunucu 403).
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { request } from "../../src/api";
import { planStatus, runText, scheduleText, summaryLine } from "../../src/recurring";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, RefreshIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

const errText = (e: any) => (Number(e?.status) === 403 ? "Bu işlem için yetkiniz yok." : typeof e?.message === "string" && !/^Sunucu hatası/.test(e.message) ? e.message : "İşlem yapılamadı.");

export default function RecurringScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "billing");
  const [items, setItems] = useState<any[] | null>(null);
  const [open, setOpen] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await request<any>("/recurring-documents", { method: "GET" }, token);
      setItems(Array.isArray(r?.items) ? r.items : []);
      setError("");
    } catch (e: any) {
      setError(errText(e));
    } finally {
      setRefreshing(false);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (plan: any, action: "pause" | "resume") => {
    if (!token || busy) return;
    const ok = await confirm(
      action === "pause"
        ? { title: "Plan durdurulsun mu?", message: `${plan.title}\nSürdürene kadar yeni belge oluşturulmaz.`, confirmLabel: "Durdur" }
        : { title: "Plan sürdürülsün mü?", message: `${plan.title}\nKaçırılan dönemler geriye dönük üretilmez; sıradaki dönemden devam eder.`, confirmLabel: "Sürdür" }
    );
    if (!ok) return;
    setBusy(plan.id);
    try {
      await request<any>(`/recurring-documents/${encodeURIComponent(plan.id)}/${action}`, { method: "POST", body: "{}" }, token);
      toast(action === "pause" ? "Plan durduruldu." : "Plan sürdürüldü.", "success");
      load();
    } catch (e: any) {
      toast(errText(e), "error");
    } finally {
      setBusy("");
    }
  };
  const showRuns = async (plan: any) => {
    if (open[plan.id]) return setOpen({ ...open, [plan.id]: undefined });
    try {
      const r = await request<any>(`/recurring-documents/${encodeURIComponent(plan.id)}`, { method: "GET" }, token as string);
      setOpen({ ...open, [plan.id]: Array.isArray(r?.runs) ? r.runs : [] });
    } catch (e: any) {
      toast(errText(e), "error");
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="recurring-screen">
      <StackHeader title="Tekrarlayan belgeler" subtitle="Faturalar, giderler, banka giderleri" />
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Planlar okunamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.sm, paddingTop: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
        >
          {items && !items.length ? (
            <EmptyState icon={<RefreshIcon size={30} color={colors.textTertiary} />} title="Plan yok" description="Tekrarlayan fatura ve gider planları web panelinden oluşturulur." />
          ) : null}
          {(items || []).map((p) => {
            const st = planStatus(p);
            const runs: any[] | undefined = open[p.id];
            return (
              <View key={p.id} testID={`recurring-${p.id}`}>
                <Card padded style={[styles.block, { gap: spacing.xs }]}>
                  <View style={styles.row}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                      {p.title || p.kind_label}
                    </Text>
                    <StatusBadge label={st.label} kind={st.kind} size="sm" />
                  </View>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{[p.kind_label, scheduleText(p)].filter(Boolean).join(" · ")}</Text>
                  {summaryLine(p) ? <Text style={[type.caption, { color: colors.textTertiary }]}>{summaryLine(p)}</Text> : null}
                  <Text style={[type.caption, { color: colors.textTertiary }]}>
                    {[p.next_run_date && p.status === "active" ? `Sıradaki ${formatDate(p.next_run_date)}` : null, `${p.run_count || 0} belge üretildi`].filter(Boolean).join(" · ")}
                  </Text>
                  {p.last_error ? <Text style={[type.caption, { color: colors.error }]}>{String(p.last_error)}</Text> : null}
                  {runs ? (
                    <View style={{ gap: 2, marginTop: spacing.xs }}>
                      {runs.length ? (
                        runs.slice(0, 12).map((r) => (
                          <Text key={`${r.period}-${r.created_at}`} style={[type.caption, { color: colors.textSecondary }]}>
                            {`${formatDate(r.period)} · ${runText(r) || r.status}`}
                          </Text>
                        ))
                      ) : (
                        <Text style={[type.caption, { color: colors.textTertiary }]}>Henüz dönem yok.</Text>
                      )}
                    </View>
                  ) : null}
                  <View style={styles.acts}>
                    <Button size="sm" variant="ghost" label={runs ? "Geçmişi gizle" : "Geçmiş"} onPress={() => showRuns(p)} />
                    {mayWrite && st.action ? (
                      <Button testID={`recurring-${st.action}-${p.id}`} size="sm" variant="secondary" label={st.action === "pause" ? "Durdur" : "Sürdür"} busy={busy === p.id} onPress={() => toggle(p, st.action!)} />
                    ) : null}
                    {p.source_invoice_id ? (
                      <Button size="sm" variant="ghost" label="Şablon fatura" onPress={() => router.push({ pathname: "/local-invoices/[id]", params: { id: String(p.source_invoice_id) } })} />
                    ) : null}
                  </View>
                </Card>
              </View>
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
});
