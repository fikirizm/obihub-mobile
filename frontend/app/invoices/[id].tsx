import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { printOrShare } from "../../src/pdf";
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { downloadInvoicePdf, getInvoiceDetail, officializeInvoice } from "../../src/api";
import { formatDate, formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusBadge } from "../../src/components/StatusBadge";
import { BagIcon, CheckIcon, DownloadIcon, FileTextIcon, HomeIcon, PackageIcon, ReceiptIcon, TagIcon, UserIcon } from "../../src/components/Icons";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { NetworkErrorBanner } from "../../src/components/NetworkErrorBanner";
import { saveCache, loadCache } from "../../src/offlineCache";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { DetailHero } from "../../src/ui/DetailHero";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, SectionTitle } from "../../src/ui/ListRow";
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(null);
      setIsOffline(false);
      await saveCache(cacheKey, inv);
    } catch (e: any) {
      // Sunucuya ulaşılamazsa önbellekteki kayıt gösterilmeye devam eder; kayıt yoksa hata gösterilir.
      setLoadError(e?.message || "Fatura yüklenemedi.");
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
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Fatura yükleniyor" style={{ paddingTop: spacing.xs }}>
          <View style={[styles.block, styles.skelHero, { backgroundColor: colors.border }]} />
          <View style={styles.actions}>
            <View style={[styles.skelButton, { backgroundColor: colors.border }]} />
            <View style={[styles.skelButton, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.skelTitle, { backgroundColor: colors.border }]} />
          <Card style={styles.block}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.fieldRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[styles.skelTile, { backgroundColor: colors.border }]} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <View style={[styles.skelLine, { width: "32%", backgroundColor: colors.border }]} />
                  <View style={[styles.skelLine, { width: "68%", backgroundColor: colors.border }]} />
                </View>
              </View>
            ))}
          </Card>
        </View>
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <EmptyState
          icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
          title={loadError ? "Fatura yüklenemedi" : "Fatura bulunamadı"}
          description={loadError || "Fatura silinmiş olabilir."}
          actionLabel={loadError ? "Tekrar dene" : undefined}
          onAction={loadError ? () => load() : undefined}
        />
      </View>
    );
  }

  const isOfficial = invoice.can_officialize === false;
  const total = invoice.display_gross_total || invoice.gross_total || invoice.net_total || 0;
  const lines = invoice.details || [];
  const contactName = invoice.contact_name || invoice.contact?.name || "-";
  const hasVat = invoice.total_vat !== undefined && invoice.total_vat !== null && invoice.total_vat !== "";

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <StackHeader title={`#${invoice.invoice_no || invoice.id}`} subtitle="Fatura" />
      <NetworkErrorBanner visible={isOffline} offline />

      <ScrollView contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.huge }}>
        <DetailHero
          tone="emerald"
          leading={
            <View style={styles.heroTile}>
              <ReceiptIcon size={22} color={ON_HERO.text} />
            </View>
          }
          eyebrow="Fatura"
          title={`#${invoice.invoice_no || invoice.id}`}
          subtitle={contactName}
          badge={<StatusBadge label={isOfficial ? "Resmileşti" : "Beklemede"} kind={isOfficial ? "success" : "warning"} />}
          valueLabel="Genel toplam"
          value={formatTry(total)}
          stats={[
            { label: "Düzenleme", value: formatDate(invoice.issue_date) },
            { label: "Vade", value: formatDate(invoice.due_date) },
            { label: "KDV", value: hasVat ? formatTry(invoice.total_vat as string | number) : "-" },
          ]}
        />

        <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)} style={styles.actions}>
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
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
          <SectionTitle title="Müşteri bilgileri" />
          <Card style={styles.block}>
            <Field
              icon={<UserIcon size={18} color={colors.emerald} />}
              tint={colors.emeraldSoft}
              label="Müşteri"
              value={contactName}
            />
            <Field
              divider
              icon={<BagIcon size={18} color={colors.emerald} />}
              tint={colors.emeraldSoft}
              label="Sipariş no"
              value={invoice.order_no || "-"}
            />
            <Field
              divider
              icon={<ReceiptIcon size={18} color={colors.info} />}
              tint={colors.infoBg}
              label="Vergi dairesi"
              value={invoice.contact?.tax_office || "-"}
            />
            <Field
              divider
              icon={<FileTextIcon size={18} color={colors.info} />}
              tint={colors.infoBg}
              label="Vergi/TC no"
              value={invoice.tax_number || invoice.contact?.tax_number || "-"}
              numeric
            />
            <Field
              divider
              icon={<HomeIcon size={18} color={colors.info} />}
              tint={colors.infoBg}
              label="Adres"
              value={invoice.billing_address || invoice.contact?.address || "-"}
              multiline
            />
            <Field
              divider
              icon={<TagIcon size={18} color={colors.info} />}
              tint={colors.infoBg}
              label="Şehir/ilçe"
              value={`${invoice.contact?.district || "-"} / ${invoice.contact?.city || "-"}`}
            />
          </Card>
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(210).duration(380)}>
          <SectionTitle
            title="Fatura içerikleri"
            action={
              lines.length > 0 ? (
                <Text style={[type.footnote, tabular, { color: colors.textTertiary }]}>{lines.length} kalem</Text>
              ) : undefined
            }
          />
          <Card style={styles.block}>
            {lines.length === 0 ? (
              <View style={styles.emptyRow}>
                <IconTile tint={colors.surfaceMuted}>
                  <PackageIcon size={18} color={colors.textTertiary} />
                </IconTile>
                <Text style={[type.footnote, { color: colors.textTertiary, flex: 1 }]}>Satır detayı yok.</Text>
              </View>
            ) : (
              lines.map((d: any, idx: number) => (
                <View
                  key={`${d.id || "line"}-${idx}`}
                  style={[styles.lineRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <IconTile tint={colors.emeraldSoft}>
                    <PackageIcon size={18} color={colors.emerald} />
                  </IconTile>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                      {d.product_name || "-"}
                    </Text>
                    <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                      KDV %{d.vat_rate ?? 0} · Adet {d.quantity ?? 1}
                    </Text>
                  </View>
                  <Text
                    style={[type.callout, tabular, styles.lineAmount, { color: colors.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatTry(d.net_total ?? d.unit_price ?? 0)}
                  </Text>
                </View>
              ))
            )}
            <View style={[styles.totalRow, { backgroundColor: colors.surfaceMuted, borderTopColor: colors.border }]}>
              <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                Genel toplam
              </Text>
              <Text
                style={[type.headline, tabular, styles.totalAmount, { color: colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatTry(total)}
              </Text>
            </View>
          </Card>
        </SafeAnimatedView>
      </ScrollView>
    </View>
  );
}

// Etiket üstte, değer altta: uzun adres ve unvanlar dar ekranda kesilmeden sığar.
function Field({
  label,
  value,
  multiline,
  divider,
  icon,
  tint,
  numeric,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  divider?: boolean;
  icon: React.ReactNode;
  tint: string;
  numeric?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fieldRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <IconTile tint={tint}>{icon}</IconTile>
      <View style={styles.fieldText}>
        <Text style={[type.caption, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[type.callout, numeric && tabular, { color: colors.textPrimary }]} numberOfLines={multiline ? 4 : 2} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  heroTile: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  fieldText: { flex: 1, minWidth: 0, gap: spacing.xxs },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  lineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  lineAmount: { maxWidth: "38%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.lg - 1,
    borderBottomRightRadius: radius.lg - 1,
  },
  totalAmount: { maxWidth: "60%", textAlign: "right" },
  skelHero: { height: 232, borderRadius: radius.xxl },
  skelButton: { flex: 1, height: 48, borderRadius: radius.md },
  skelTitle: { width: 140, height: 18, borderRadius: radius.xs, marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  skelTile: { width: 36, height: 36, borderRadius: 10 },
  skelLine: { height: 12, borderRadius: radius.xs },
});
