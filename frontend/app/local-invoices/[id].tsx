import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { addLocalInvoicePayment, getLocalInvoice, officializeLocalInvoice } from "../../src/api";
import { invoiceStatus, PAYMENT_METHODS, todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { ReceiptIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { LocalInvoice } from "../../src/types";

// Sunucu kalem tutarını `line_total` adıyla döndürür.
function lineTotal(l: { total?: number; line_total?: number }) {
  return l.line_total ?? l.total;
}

export default function LocalInvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user, parasutConnected } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm, promptEntry } = useFeedback();
  const [inv, setInv] = useState<LocalInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"official" | "payment" | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setInv(await getLocalInvoice(token, id));
    } catch {
      // Yüklenemezse eldeki kayıt kalır.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }
  if (!inv) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <EmptyState icon={<ReceiptIcon size={30} color={colors.textTertiary} />} title="Fatura bulunamadı" description="Fatura silinmiş olabilir." />
      </View>
    );
  }

  const st = invoiceStatus(inv.display_status || inv.status);
  const cur = inv.currency;
  const remaining = Number(inv.remaining_amount ?? Number(inv.total || 0) - Number(inv.paid_amount || 0));
  const isDraft = inv.status === "taslak";
  const isCancelled = inv.status === "iptal";
  // Resmileştirme Paraşüt üzerinden yapılır.
  const mayWrite = canManage(user, "billing");
  const canOfficialize = mayWrite && isDraft && parasutConnected === true && !inv.parasut_invoice_id;
  const canCollect = mayWrite && !isCancelled && remaining > 0.004;

  const onOfficialize = async () => {
    if (!token) return;
    const ok = await confirm({
      title: "Fatura resmileştirilsin mi?",
      message: "Fatura Paraşüt üzerinden e-belge olarak gönderilir. Bu işlem geri alınamaz.",
      confirmLabel: "Resmileştir",
    });
    if (!ok) return;
    setBusy("official");
    try {
      const r = await officializeLocalInvoice(token, inv.id);
      toast(r?.message || (r?.pending ? "E-belge sıraya alındı" : "Fatura resmileşti"), "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Resmileştirilemedi.", "error");
    } finally {
      setBusy(null);
    }
  };

  const onCollect = async () => {
    if (!token) return;
    const entry = await promptEntry({
      title: "Tahsilat ekle",
      message: `Kalan ${formatMoney(remaining, cur)}`,
      initial: remaining,
      decimal: true,
      noteLabel: "Not (isteğe bağlı)",
      methods: [...PAYMENT_METHODS],
    });
    if (!entry || entry.amount <= 0) return;
    if (entry.amount > remaining + 0.004) {
      toast("Tutar kalan borçtan büyük olamaz.", "error");
      return;
    }
    const method = entry.method || "nakit";
    setBusy("payment");
    try {
      await addLocalInvoicePayment(token, inv.id, { amount: entry.amount, date: todayIso(), method, notes: entry.note || undefined });
      toast("Tahsilat kaydedildi", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Tahsilat kaydedilemedi.", "error");
    } finally {
      setBusy(null);
    }
  };

  const lines = inv.items || [];
  const payments = inv.payments || [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-detail">
      <StackHeader title={inv.invoice_number || "Fatura"} subtitle={formatDate(inv.issue_date)} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <Card padded style={styles.block}>
          <View style={styles.headRow}>
            <Text style={[type.headline, { color: colors.textPrimary, flex: 1 }]}>{inv.customer_name || "Müşteri"}</Text>
            <StatusBadge label={st.label} kind={st.kind} />
          </View>
          <Text style={[type.largeTitle, tabular, { color: colors.textPrimary, marginTop: spacing.sm }]}>{formatMoney(inv.total, cur)}</Text>
          {inv.due_date ? <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 2 }]}>Vade {formatDate(inv.due_date)}</Text> : null}
          {inv.edoc_error ? <Text style={[type.footnote, { color: colors.error, marginTop: spacing.xs }]}>E-belge hatası: {inv.edoc_error}</Text> : null}
        </Card>

        {canOfficialize || canCollect ? (
          <View style={styles.actions}>
            {canCollect ? <Button testID="invoice-collect" label="Tahsilat ekle" busy={busy === "payment"} disabled={Boolean(busy)} onPress={onCollect} style={{ flex: 1 }} /> : null}
            {canOfficialize ? (
              <Button testID="invoice-officialize" label="Resmileştir" variant="secondary" busy={busy === "official"} disabled={Boolean(busy)} onPress={onOfficialize} style={{ flex: 1 }} />
            ) : null}
          </View>
        ) : null}

        <SectionTitle title="Tutarlar" />
        <Card style={styles.block}>
          <ListRow title="Ara toplam" trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{formatMoney(inv.subtotal, cur)}</Text>} />
          {Number(inv.discount_amount || 0) > 0 ? (
            <ListRow divider title="İndirim" trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary }]}>-{formatMoney(inv.discount_amount, cur)}</Text>} />
          ) : null}
          <ListRow divider title="KDV" trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{formatMoney(inv.vat_amount, cur)}</Text>} />
          <ListRow divider title="Ödenen" trailing={<Text style={[type.callout, tabular, { color: colors.success }]}>{formatMoney(inv.paid_amount || 0, cur)}</Text>} />
          <ListRow divider title="Kalan" trailing={<Text style={[type.bodyStrong, tabular, { color: remaining > 0.004 ? colors.textPrimary : colors.success }]}>{formatMoney(Math.max(0, remaining), cur)}</Text>} />
        </Card>

        {lines.length > 0 ? (
          <>
            <SectionTitle title="Kalemler" />
            <Card style={styles.block}>
              {lines.map((l, i) => (
                <ListRow
                  key={i}
                  divider={i > 0}
                  title={l.name || l.product_name || l.description || "Kalem"}
                  subtitle={`${Number(l.quantity || 0)} × ${formatMoney(l.unit_price, cur)}${l.vat_rate != null ? ` · KDV %${l.vat_rate}` : ""}`}
                  trailing={lineTotal(l) != null ? <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{formatMoney(lineTotal(l), cur)}</Text> : undefined}
                />
              ))}
            </Card>
          </>
        ) : null}

        {payments.length > 0 ? (
          <>
            <SectionTitle title="Tahsilatlar" />
            <Card style={styles.block}>
              {payments.map((p, i) => (
                <ListRow
                  key={p.id || i}
                  divider={i > 0}
                  title={PAYMENT_METHODS.find((m) => m.value === p.method)?.label || p.method || "Ödeme"}
                  subtitle={formatDate(p.date)}
                  trailing={<Text style={[type.callout, tabular, { color: colors.success }]}>{formatMoney(p.amount, cur)}</Text>}
                />
              ))}
            </Card>
          </>
        ) : null}

        {inv.notes ? (
          <>
            <SectionTitle title="Not" />
            <Card padded style={styles.block}>
              <Text style={[type.body, { color: colors.textSecondary }]}>{inv.notes}</Text>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
});
