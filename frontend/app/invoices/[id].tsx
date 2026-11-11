import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { printOrShare } from "../../src/pdf";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { downloadInvoicePdf, getInvoiceDetail, officializeInvoice } from "../../src/api";
import { formatDate, formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusBadge } from "../../src/components/StatusBadge";
import { CheckIcon, DownloadIcon, ReceiptIcon } from "../../src/components/Icons";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../../src/offlineCache";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import type { Invoice } from "../../src/types";

export default function InvoiceDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const invoiceId = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [officialBusy, setOfficialBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !invoiceId) return;
    const cacheKey = `invoice_detail_${invoiceId}`;
    setLoading(true);
    const cached = await loadCache<Invoice>(cacheKey);
    if (cached) {
      setInvoice(cached);
      setIsOffline(true);
      setLoading(false);
    }
    try {
      const inv = await getInvoiceDetail(token, invoiceId);
      setInvoice(inv);
      setIsOffline(false);
      await saveCache(cacheKey, inv);
    } catch {
      // Sunucuya ulaşılamazsa önbellekteki kayıt gösterilmeye devam eder.
    } finally {
      setLoading(false);
    }
  }, [token, invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async () => {
    if (!token || !invoice) return;
    setPdfBusy(true);
    try {
      const r = await downloadInvoicePdf(token, invoice.id);
      const data = r?.data_base64 || r?.data || "";
      if (!data) {
        toast("Bu fatura için PDF verisi alınamadı.", "error");
        return;
      }
      const path = `${FileSystem.cacheDirectory}invoice-${invoice.id}.pdf`;
      await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
      await printOrShare(path);
    } catch (e: any) {
      toast(e?.message || "PDF açılamadı.", "error");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleOfficialize = async () => {
    if (!token || !invoice) return;
    const ok = await confirm({
      title: "Fatura resmileştirilsin mi?",
      message: "Fatura Paraşüt üzerinden e-belge olarak gönderilir. Bu işlem geri alınamaz.",
      confirmLabel: "Resmileştir",
    });
    if (!ok) return;
    setOfficialBusy(true);
    try {
      await officializeInvoice(token, invoice.id);
      toast("Fatura resmileştirildi.", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Resmileştirme başarısız.", "error");
    } finally {
      setOfficialBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <EmptyState
          icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
          title="Fatura bulunamadı"
          description="Fatura silinmiş olabilir veya bağlantı kurulamadı."
        />
      </View>
    );
  }

  const isOfficial = invoice.can_officialize === false;
  const total = invoice.display_gross_total || invoice.gross_total || invoice.net_total || 0;
  const lines = invoice.details || [];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <StackHeader title={`#${invoice.invoice_no || invoice.id}`} subtitle="Fatura" />
      <NetworkErrorBanner visible={isOffline} offline />

      <ScrollView contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.huge }}>
        <Card padded style={styles.block}>
          <View style={styles.headRow}>
            <Text style={[type.caption, { color: colors.textTertiary, flex: 1 }]}>Genel toplam</Text>
            <StatusBadge label={isOfficial ? "Resmileşti" : "Beklemede"} kind={isOfficial ? "success" : "warning"} />
          </View>
          <Text style={[type.largeTitle, tabular, { color: colors.textPrimary, marginTop: spacing.xxs }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatTry(total)}
          </Text>
          <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 2 }]}>{formatDate(invoice.issue_date)}</Text>
        </Card>

        <View style={styles.actions}>
          <Button
            testID="download-pdf"
            label="PDF"
            icon={<DownloadIcon size={18} color="#FFFFFF" />}
            busy={pdfBusy}
            onPress={handleDownload}
            style={{ flex: 1 }}
          />
          <Button
            testID="officialize"
            label={isOfficial ? "Resmileşti" : "Resmileştir"}
            variant="secondary"
            icon={<CheckIcon size={18} color={isOfficial ? colors.success : colors.textPrimary} />}
            busy={officialBusy}
            disabled={isOfficial}
            onPress={handleOfficialize}
            style={[{ flex: 1 }, isOfficial && { opacity: 0.55 }]}
          />
        </View>

        <SectionTitle title="Müşteri bilgileri" />
        <Card style={styles.block}>
          <Field label="Müşteri" value={invoice.contact_name || invoice.contact?.name || "-"} />
          <Field divider label="Sipariş no" value={invoice.order_no || "-"} />
          <Field divider label="Vergi dairesi" value={invoice.contact?.tax_office || "-"} />
          <Field divider label="Vergi/TC no" value={invoice.tax_number || invoice.contact?.tax_number || "-"} />
          <Field divider label="Adres" value={invoice.billing_address || invoice.contact?.address || "-"} multiline />
          <Field divider label="Şehir/ilçe" value={`${invoice.contact?.district || "-"} / ${invoice.contact?.city || "-"}`} />
        </Card>

        <SectionTitle title="Fatura içerikleri" />
        <Card style={styles.block}>
          {lines.length === 0 ? (
            <Text style={[type.footnote, styles.empty, { color: colors.textTertiary }]}>Satır detayı yok.</Text>
          ) : (
            lines.map((d: any, idx: number) => (
              <View
                key={`${d.id || "line"}-${idx}`}
                style={[styles.lineRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                    {d.product_name || "-"}
                  </Text>
                  <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]}>
                    KDV %{d.vat_rate ?? 0} · Adet {d.quantity ?? 1}
                  </Text>
                </View>
                <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{formatTry(d.net_total ?? d.unit_price ?? 0)}</Text>
              </View>
            ))
          )}
          <View style={[styles.lineRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>Genel toplam</Text>
            <Text style={[type.headline, tabular, { color: colors.textPrimary }]}>{formatTry(total)}</Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

// Etiket üstte, değer altta: uzun adres ve unvanlar dar ekranda kesilmeden sığar.
function Field({ label, value, multiline, divider }: { label: string; value: string; multiline?: boolean; divider?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fieldRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Text style={[type.caption, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[type.callout, { color: colors.textPrimary }]} numberOfLines={multiline ? 4 : 2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  fieldRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.xxs },
  empty: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  lineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
