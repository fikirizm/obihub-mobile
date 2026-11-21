// Faz A M9: Menü → Web Mağaza özet kartı. Yayın aç/kapa ve sepet rezervasyonu (revizyonlu PUT; yalnız firma sahibi değiştirir),
// ödeme izleme (son 100) ve üyelik (yalnız okuma; firma sahibinde). Tema, kampanya, teslimat, politika ve PayTR ayarları web panelinde.
// Kurallar: src/web-store.ts (saf, birim testli).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { isOwner } from "../../src/auth/permissions";
import { request } from "../../src/api";
import { monitorRows, publicationBody, publicationText, reservationBody, reservationText, storeError, type MonitorRow } from "../../src/web-store";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

export default function WebStoreScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const owner = isOwner(user);
  const [pub, setPub] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [monitor, setMonitor] = useState<MonitorRow[] | null>(null);
  const [members, setMembers] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"" | "pub" | "res">("");
  const op = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    const get = (p: string) => request<any>(`/settings/website/${p}`, { method: "GET" }, token);
    try {
      const [p, r] = await Promise.all([get("publication-status"), get("cart-reservations")]);
      setPub(p);
      setRes(r);
      setError("");
    } catch (e: any) {
      setError(Number(e?.status) === 403 ? "Web mağaza ayarlarını görme yetkiniz yok." : "Web mağaza bilgileri okunamadı. Biraz sonra yeniden deneyin.");
    }
    if (owner) {
      get("payment-monitor").then((m) => setMonitor(monitorRows(m))).catch(() => setMonitor([]));
      get("members").then(setMembers).catch(() => setMembers(null));
    }
    setRefreshing(false);
  }, [token, owner]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (kind: "pub" | "res", on: boolean) => {
    if (!token || op.current || !owner) return;
    if (kind === "pub") {
      const ok = await confirm(
        on
          ? { title: "Mağaza yayına alınsın mı?", message: "Müşteriler ürünleri görüp sipariş verebilir.", confirmLabel: "Yayına al" }
          : { title: "Mağaza kapatılsın mı?", message: "Ziyaretçiler \"Yakında buradayız\" sayfasını görür; yeni sipariş alınmaz.", confirmLabel: "Kapat", destructive: true }
      );
      if (!ok) return;
    }
    op.current = true;
    setBusy(kind);
    try {
      const path = kind === "pub" ? "publication-status" : "cart-reservations";
      const body = kind === "pub" ? publicationBody(pub, on) : reservationBody(res, on);
      const out = await request<any>(`/settings/website/${path}`, { method: "PUT", body: JSON.stringify(body) }, token);
      if (kind === "pub") setPub(out);
      else setRes({ ...res, ...out });
      toast(kind === "pub" ? (on ? "Mağaza yayında." : "Mağaza kapatıldı.") : on ? "Sepet rezervasyonu açıldı." : "Sepet rezervasyonu kapatıldı.", "success");
    } catch (e: any) {
      const err = storeError(e);
      toast(err.text, "error");
      if (err.reload) load();
    } finally {
      op.current = false;
      setBusy("");
    }
  };

  if (!pub && !error)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Web Mağaza" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  const sw = (testID: string, value: boolean, kind: "pub" | "res") => (
    <Switch testID={testID} value={value} disabled={!owner || !!busy} onValueChange={(v) => toggle(kind, v)} trackColor={{ true: colors.primary, false: colors.border }} />
  );
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="web-store-screen">
      <StackHeader title="Web Mağaza" subtitle={pub ? (pub.is_published ? "Yayında" : "Kapalı") : undefined} />
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Web mağaza açılamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
        >
          <SectionTitle title="Yayın" />
          <Card style={styles.block}>
            <ListRow title="Mağazayı yayınla" subtitle={publicationText(pub)} trailing={sw("web-store-publish", pub?.is_published === true, "pub")} />
          </Card>
          <SectionTitle title="Sepet rezervasyonu" />
          <Card style={styles.block}>
            <ListRow title="Sepetteki ürünü ayır" subtitle={reservationText(res)} trailing={sw("web-store-reserve", res?.enabled === true, "res")} />
          </Card>
          {!owner ? <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>Bu ayarları yalnız firma sahibi değiştirebilir.</Text> : null}
          {owner && members ? (
            <>
              <SectionTitle title="Üyelik" />
              <Card style={styles.block}>
                <ListRow
                  title={members.enabled ? "Müşteri üyeliği açık" : "Müşteri üyeliği kapalı"}
                  trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "600" }]}>{`${Number(members.member_count) || 0} üye`}</Text>}
                />
              </Card>
            </>
          ) : null}
          {owner && monitor ? (
            <>
              <SectionTitle title="Ödemeler" action={<Text style={[type.caption, { color: colors.textTertiary }]}>Son 100</Text>} />
              <Card style={styles.block}>
                {monitor.length ? (
                  monitor.slice(0, 30).map((r, i) => (
                    <View key={r.id} style={[styles.payRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={styles.payTop}>
                        <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{formatTry(r.total)}</Text>
                        <StatusBadge label={r.state} kind={r.tone === "neutral" ? "info" : r.tone} size="sm" />
                      </View>
                      <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${formatDate(r.createdAt)} · ${r.code}`}</Text>
                      {r.note ? <Text style={[type.caption, { color: r.tone === "error" ? colors.error : colors.textSecondary }]}>{r.note}</Text> : null}
                    </View>
                  ))
                ) : (
                  <ListRow title="Henüz web ödemesi yok" />
                )}
              </Card>
              <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>Havale onayı sipariş detayından yapılır. Tema, kampanya, teslimat ve ödeme ayarları web panelindedir.</Text>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  payRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  payTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
});
