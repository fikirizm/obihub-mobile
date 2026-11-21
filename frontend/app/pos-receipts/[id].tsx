// Faz A (M2a): Satış fişi detayı — GET /pos/receipts/{id} (404 "Satış fişi bulunamadı."). Web: pages/POSReceiptsPage.jsx.
// Fiş silme ve faturaya dönüştürme Dalga 2'de (M3a/M3b).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { readError, receiptDetail, receiptPath } from "../../src/pos-receipts";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

const dateTime = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const qty = (n: number) => String(n).replace(".", ",");

export default function PosReceiptScreen() {
  const id = String(useLocalSearchParams<{ id: string }>().id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const [raw, setRaw] = useState<any>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setRaw(await request<any>(receiptPath(id), { method: "GET" }, token));
      setError("");
    } catch (e: any) {
      setError(readError(e));
    }
  }, [token, id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error || !raw)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Satış fişi" />
        {error ? <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Satış fişi açılamadı" description={error} actionLabel="Tekrar dene" onAction={load} /> : <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />}
      </View>
    );
  const d = receiptDetail(raw);
  const value = (t: string, c = colors.textPrimary) => <Text style={[type.callout, tabular, { color: c }]}>{t}</Text>;
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="pos-receipt-detail">
      <StackHeader title={d.number} subtitle="Satış fişi" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}>
        <View style={[styles.block, styles.badges]}>
          <StatusBadge label={d.status} kind={d.status === "Tamamlandı" ? "success" : d.status === "İşlem tamamlanıyor" ? "info" : "warning"} size="sm" />
          {d.badges.map((b) => (
            <StatusBadge key={b.label} label={b.label} kind={b.tone === "neutral" ? "info" : b.tone} size="sm" />
          ))}
        </View>
        <SectionTitle title="Bilgiler" />
        <Card style={styles.block}>
          <ListRow title="Müşteri" trailing={value(d.customer)} />
          <ListRow divider title="Satış tarihi" trailing={value(dateTime(d.createdAt))} />
          <ListRow divider title="Ödeme yöntemi" trailing={value(d.method)} />
          {d.invoiceId ? (
            <ListRow
              divider
              title="Fatura"
              trailing={value(raw.invoice_number || "Aç", colors.primary)}
              chevron
              onPress={() => router.push({ pathname: "/local-invoices/[id]", params: { id: d.invoiceId! } })}
            />
          ) : null}
        </Card>
        <SectionTitle title="Kalemler" action={<Text style={[type.caption, { color: colors.textTertiary }]}>{`${d.lines.length} kalem`}</Text>} />
        <Card style={styles.block}>
          {d.lines.map((l, i) => (
            <ListRow
              key={i}
              divider={i > 0}
              title={l.name}
              subtitle={[`${qty(l.quantity)} × ${formatTry(l.unitPrice)}`, l.discountPercent ? `İndirim %${qty(l.discountPercent)}` : null, `KDV %${qty(l.vatRate)}`, l.sku || null].filter(Boolean).join(" · ")}
              trailing={<Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{formatTry(l.total)}</Text>}
            />
          ))}
        </Card>
        <SectionTitle title="Tutar" />
        <Card style={styles.block}>
          <ListRow title="Ara toplam" trailing={value(formatTry(d.subtotal))} />
          {d.discount ? <ListRow divider title="Genel indirim" trailing={value(`−${formatTry(d.discount)}`)} /> : null}
          <ListRow divider title="KDV (dahil)" trailing={value(formatTry(d.vat))} />
          <ListRow divider title="Toplam" trailing={<Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]} testID="pos-receipt-total">{formatTry(d.total)}</Text>} />
        </Card>
        {d.notes ? <Text style={[type.footnote, styles.block, { color: colors.textSecondary }]}>{d.notes}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg }, badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs } });
