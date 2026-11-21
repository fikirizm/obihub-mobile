// Faz A (M2a): Satış fişi detayı — GET /pos/receipts/{id} (404 "Satış fişi bulunamadı."). Web: pages/POSReceiptsPage.jsx.
// M3a/M3b: fiş silme (DELETE, açık onay, pending → yeniden denenebilir) ve faturaya dönüştürme (POST …/invoice → taslak fatura).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canSell } from "../../src/auth/permissions";
import { deleteConfirmText, deleteResult, receiptActions, receiptErrorText } from "../../src/pos-invoice";
import { request } from "../../src/api";
import { readError, receiptDetail, receiptPath } from "../../src/pos-receipts";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

const dateTime = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const qty = (n: number) => String(n).replace(".", ",");

export default function PosReceiptScreen() {
  const id = String(useLocalSearchParams<{ id: string }>().id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [raw, setRaw] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "convert" | "delete">("");
  const [notice, setNotice] = useState("");
  const op = useRef(false);

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

  // Faturaya dönüştür: taslak fatura açılır (tekrarında aynı fatura döner). Bağlıysa yalnız açılır.
  const convert = async () => {
    if (!token || op.current) return;
    if (raw?.invoice_id && raw?.status === "completed") {
      router.push({ pathname: "/local-invoices/[id]", params: { id: String(raw.invoice_id) } });
      return;
    }
    op.current = true;
    setBusy("convert");
    try {
      const r = await request<any>(`${receiptPath(id)}/invoice`, { method: "POST", body: "{}" }, token);
      if (r?.invoice_id) router.push({ pathname: "/local-invoices/[id]", params: { id: String(r.invoice_id) } });
      load();
    } catch (e: any) {
      toast(receiptErrorText(e, "convert"), "error");
    } finally {
      op.current = false;
      setBusy("");
    }
  };

  // Sil: açık onay; tamamlanmadıysa (pending) "silindi" denmez, aynı çağrı yeniden denenebilir (sunucu idempotent).
  const remove = async () => {
    if (!token || op.current || !raw) return;
    const ok = await confirm({ title: "Satış fişi silinsin mi?", message: deleteConfirmText(raw, formatTry(raw.total)), confirmLabel: "Fişi ve tahsilatı sil", destructive: true });
    if (!ok || op.current) return;
    op.current = true;
    setBusy("delete");
    try {
      const res = deleteResult(await request<any>(receiptPath(id), { method: "DELETE" }, token));
      if (res.done) {
        toast(res.text, "success");
        if (router.canGoBack()) router.back();
        else router.replace("/pos-receipts" as any);
        return;
      }
      setNotice(res.text);
      load();
    } catch (e: any) {
      toast(receiptErrorText(e, "delete"), "error");
    } finally {
      op.current = false;
      setBusy("");
    }
  };

  if (error || !raw)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Satış fişi" />
        {error ? <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Satış fişi açılamadı" description={error} actionLabel="Tekrar dene" onAction={load} /> : <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />}
      </View>
    );
  const d = receiptDetail(raw);
  const acts = receiptActions(raw);
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
        {notice ? (
          <View style={[styles.block, styles.notice, { backgroundColor: colors.warningBg }]} testID="pos-receipt-notice" accessibilityRole="alert">
            <Text style={[type.footnote, { color: colors.textPrimary }]}>{notice}</Text>
          </View>
        ) : null}
        {canSell(user) ? (
          <View style={[styles.block, { gap: spacing.xs, marginTop: spacing.md }]}>
            {acts.convert ? <Button testID="pos-receipt-convert" label={acts.convert} busy={busy === "convert"} disabled={!!busy} onPress={convert} /> : null}
            {acts.removeNote ? <Text style={[type.caption, { color: colors.textTertiary }]}>{acts.removeNote}</Text> : null}
            {acts.remove ? <Button testID="pos-receipt-delete" variant="ghost" label="Satış fişini sil" busy={busy === "delete"} disabled={!!busy} onPress={remove} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg }, badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, notice: { padding: spacing.md, borderRadius: 12 } });
