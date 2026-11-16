// Dalga 5a (P5.1): irsaliye detayı — GET /dispatch-notes/{id}. PDF, e-İrsaliye (yalnız onayla; belirsiz sonuçta Paraşüt'te kontrol edip
// retry_uncertain), faturaya çevir, sil (faturalanmış / e-İrsaliyesi gönderilmiş irsaliye silinmez — sunucu bayrakları).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { API_BASE_URL, newIdempotencyKey, request } from "../../src/api";
import { bytesToBase64 } from "../../src/inbox-ui";
import { printOrShare } from "../../src/pdf";
import { dispatchErrorText, edocBody, noteActions, statusBadges } from "../../src/dispatch";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

export default function DispatchDetailScreen() {
  const id = String(useLocalSearchParams<{ id: string }>().id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "inventory");
  const [n, setN] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setN(await request<any>(`/dispatch-notes/${encodeURIComponent(id)}`, { method: "GET" }, token));
      setError("");
    } catch (e: any) {
      setError(dispatchErrorText(e));
    }
  }, [token, id]);
  useEffect(() => {
    load();
  }, [load]);

  const pdf = async () => {
    if (!token || busy) return;
    setBusy("pdf");
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch-notes/${encodeURIComponent(id)}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw { status: res.status };
      const b64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
      if (Platform.OS === "web") toast("PDF hazır (web önizlemesinde açılmaz).", "info");
      else {
        const file = `${FileSystem.cacheDirectory}${String(n?.number || "irsaliye").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        await FileSystem.writeAsStringAsync(file, b64, { encoding: FileSystem.EncodingType.Base64 });
        await printOrShare(file);
      }
    } catch {
      toast("İrsaliye PDF'i alınamadı.", "error");
    } finally {
      setBusy("");
    }
  };
  const sendEdoc = async (retry: boolean) => {
    if (!token || busy) return;
    const ok = await confirm(
      retry
        ? {
            title: "e-İrsaliye yeniden gönderilsin mi?",
            message: "Önceki gönderimin sonucu belirsiz. Önce Paraşüt'te İrsaliyeler'de bu belgenin açılmadığını kontrol edin; açılmışsa yeniden göndermeyin.",
            confirmLabel: "Kontrol ettim, gönder",
            destructive: true,
          }
        : { title: "e-İrsaliye gönderilsin mi?", message: "İrsaliye Paraşüt üzerinden e-İrsaliye olarak gönderilir. Gönderildikten sonra irsaliye değiştirilemez ve silinemez.", confirmLabel: "Gönder" }
    );
    if (!ok) return;
    setBusy("edoc");
    try {
      setN(await request<any>(`/dispatch-notes/${encodeURIComponent(id)}/e-dispatch`, { method: "POST", body: JSON.stringify(edocBody(retry)) }, token));
      toast("e-İrsaliye gönderildi.", "success");
    } catch (e: any) {
      toast(dispatchErrorText(e), "error");
      load();
    } finally {
      setBusy("");
    }
  };
  const toInvoice = async () => {
    if (!token || busy) return;
    const ok = await confirm({ title: "Faturaya çevrilsin mi?", message: "Taslak satış faturası oluşturulur; stok irsaliyede düştüğü için faturada ikinci kez düşmez.", confirmLabel: "Faturaya çevir" });
    if (!ok) return;
    setBusy("invoice");
    try {
      const r = await request<any>("/dispatch-notes/invoice", { method: "POST", body: JSON.stringify({ note_ids: [id] }), headers: { "Idempotency-Key": newIdempotencyKey("dninv") } }, token);
      toast("Taslak fatura oluşturuldu.", "success");
      if (r?.invoice?.id) router.replace({ pathname: "/local-invoices/[id]", params: { id: String(r.invoice.id) } });
    } catch (e: any) {
      toast(dispatchErrorText(e), "error");
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    if (!token || busy) return;
    const ok = await confirm({ title: "İrsaliye silinsin mi?", message: "İrsaliyenin stok hareketleri ters kayıtla geri alınır.", confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    setBusy("delete");
    try {
      await request<any>(`/dispatch-notes/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
      toast("İrsaliye silindi.", "success");
      router.back();
    } catch (e: any) {
      toast(dispatchErrorText(e), "error");
    } finally {
      setBusy("");
    }
  };

  if (error || !n)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="İrsaliye" />
        {error ? <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="İrsaliye açılamadı" description={error} actionLabel="Tekrar dene" onAction={load} /> : <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />}
      </View>
    );
  const acts = noteActions(n);
  const lines: any[] = Array.isArray(n.lines) ? n.lines : [];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dispatch-detail">
      <StackHeader title={n.number || "İrsaliye"} subtitle={n.direction === "in" ? "Gelen irsaliye" : "Giden irsaliye"} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}>
        <View style={[styles.block, styles.badges]}>
          {statusBadges(n).map((b) => (
            <StatusBadge key={b.label} label={b.label} kind={b.kind} size="sm" />
          ))}
        </View>
        <SectionTitle title="Bilgiler" />
        <Card style={styles.block}>
          <ListRow title={n.direction === "in" ? "Tedarikçi" : "Müşteri"} trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{n.party_name}</Text>} />
          <ListRow divider title="Düzenleme tarihi" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{formatDate(n.issue_date)}</Text>} />
          {n.shipment_date ? <ListRow divider title="Sevk tarihi" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{`${formatDate(n.shipment_date)}${n.shipment_time ? ` ${n.shipment_time}` : ""}`}</Text>} /> : null}
          {n.cargo?.carrier || n.cargo?.tracking_no ? (
            <ListRow divider title="Kargo" subtitle={n.cargo?.tracking_no ? `Takip ${n.cargo.tracking_no}` : undefined} trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{n.cargo?.carrier || "—"}</Text>} />
          ) : null}
          {n.vehicle_plate ? <ListRow divider title="Plaka" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{n.vehicle_plate}</Text>} /> : null}
          {n.order_no ? <ListRow divider title="Sipariş" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{n.order_no}</Text>} /> : null}
          {n.invoice_link?.invoice_id ? (
            <ListRow
              divider
              title="Fatura"
              trailing={<Text style={[type.callout, { color: colors.primary }]}>{n.invoice_link.invoice_number || "Aç"}</Text>}
              chevron
              onPress={() => router.push({ pathname: "/local-invoices/[id]", params: { id: String(n.invoice_link.invoice_id) } })}
            />
          ) : null}
        </Card>
        <SectionTitle title="Kalemler" action={<Text style={[type.caption, { color: colors.textTertiary }]}>{`${lines.length} kalem`}</Text>} />
        <Card style={styles.block}>
          {lines.map((l, i) => (
            <ListRow
              key={l.line_key || i}
              divider={i > 0}
              title={l.product_name || l.description || "Kalem"}
              subtitle={[l.sku, l.warehouse_name].filter(Boolean).join(" · ") || undefined}
              trailing={<Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{`${String(l.quantity).replace(".", ",")} ${l.unit || ""}`}</Text>}
            />
          ))}
        </Card>
        {n.order_id ? <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>Siparişe bağlı irsaliye stoğa dokunmaz; stok siparişte düştü.</Text> : null}
        {n.notes ? <Text style={[type.footnote, styles.block, { color: colors.textSecondary }]}>{n.notes}</Text> : null}
        <View style={[styles.block, { gap: spacing.xs, marginTop: spacing.md }]}>
          <Button testID="dispatch-pdf" variant="secondary" label="PDF / Yazdır" busy={busy === "pdf"} onPress={pdf} />
          {mayWrite && acts.edoc ? <Button testID="dispatch-edoc" label="e-İrsaliye gönder" busy={busy === "edoc"} onPress={() => sendEdoc(false)} /> : null}
          {mayWrite && acts.retryUncertain ? <Button testID="dispatch-edoc-retry" variant="secondary" label="e-İrsaliyeyi yeniden dene" busy={busy === "edoc"} onPress={() => sendEdoc(true)} /> : null}
          {mayWrite && canManage(user, "billing") && acts.invoice ? <Button testID="dispatch-to-invoice" variant="secondary" label="Faturaya çevir" busy={busy === "invoice"} onPress={toInvoice} /> : null}
          {mayWrite && acts.remove ? <Button testID="dispatch-delete" variant="ghost" label="İrsaliyeyi sil" busy={busy === "delete"} onPress={remove} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg }, badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs } });
