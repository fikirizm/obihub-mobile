import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { downloadInvoicePdf, getInvoiceDetail, officializeInvoice } from "../../src/api";
import { formatTry } from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { ArrowLeftIcon, CheckIcon, DownloadIcon, ReceiptIcon } from "../../src/components/Icons";
import type { Invoice } from "../../src/types";

export default function InvoiceDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const invoiceId = String(params.id || "");
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [officialBusy, setOfficialBusy] = useState(false);

  const load = async () => {
    if (!token || !invoiceId) return;
    setLoading(true);
    try {
      const inv = await getInvoiceDetail(token, invoiceId);
      setInvoice(inv);
    } catch {}
    finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, invoiceId]);

  const handleDownload = async () => {
    if (!token || !invoice) return;
    setPdfBusy(true);
    try {
      const r = await downloadInvoicePdf(token, invoice.id);
      const data = r?.data_base64 || r?.data || "";
      if (!data) {
        Alert.alert("PDF yok", "Bu fatura için PDF verisi alınamadı.");
        return;
      }
      const path = `${FileSystem.cacheDirectory}invoice-${invoice.id}.pdf`;
      await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
      try {
        await Print.printAsync({ uri: path });
      } catch {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: "application/pdf" });
        }
      }
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "PDF açılamadı.");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleOfficialize = async () => {
    if (!token || !invoice) return;
    setOfficialBusy(true);
    try {
      await officializeInvoice(token, invoice.id);
      Alert.alert("Resmileşti", "Fatura resmileştirildi.");
      await load();
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Resmileştirme başarısız.");
    } finally {
      setOfficialBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textPrimary }}>Fatura bulunamadı.</Text>
      </View>
    );
  }

  const isOfficial = invoice.can_officialize === false;
  const total = invoice.display_gross_total || invoice.gross_total || invoice.net_total || 0;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <PressableScale
          testID="back-btn"
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
        >
          <ArrowLeftIcon size={18} color={colors.textPrimary} />
        </PressableScale>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.headerLabel, { color: colors.textTertiary }]}>FATURA</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            #{invoice.invoice_no || invoice.id}
          </Text>
        </View>
        <View style={[styles.iconBtn, { backgroundColor: isOfficial ? colors.successBg : colors.warningBg, borderColor: "transparent" }]}>
          {isOfficial ? <CheckIcon size={18} color={colors.success} /> : <ReceiptIcon size={18} color={colors.warning} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Hero summary */}
        <SafeAnimatedView entering={FadeIn.duration(400)} style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.md]}>
          <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>GENEL TOPLAM</Text>
          <Text style={[styles.heroValue, { color: colors.textPrimary }]}>{formatTry(total)}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.xs, alignItems: "center" }}>
            <StatusBadge label={isOfficial ? "Resmileşti" : "Beklemede"} kind={isOfficial ? "success" : "warning"} />
            <Text style={[styles.heroDate, { color: colors.textTertiary }]}>{invoice.issue_date || "-"}</Text>
          </View>
        </SafeAnimatedView>

        {/* Actions */}
        <SafeAnimatedView entering={FadeInDown.delay(80).duration(400)} style={styles.actionRow}>
          <PressableScale
            testID="download-pdf"
            onPress={handleDownload}
            disabled={pdfBusy}
            style={[styles.actionBtn, { backgroundColor: colors.primary }, shadows.primary]}
          >
            {pdfBusy ? <ActivityIndicator color="#FFF" /> : (
              <>
                <DownloadIcon size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>PDF</Text>
              </>
            )}
          </PressableScale>
          <PressableScale
            testID="officialize"
            onPress={handleOfficialize}
            disabled={officialBusy || isOfficial}
            style={[styles.actionBtnSecondary, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm, (officialBusy || isOfficial) && { opacity: 0.55 }]}
          >
            {officialBusy ? <ActivityIndicator color={colors.success} /> : (
              <>
                <CheckIcon size={18} color={isOfficial ? colors.success : colors.success} />
                <Text style={[styles.actionBtnSecondaryText, { color: colors.success }]}>
                  {isOfficial ? "Resmileşti" : "Resmileştir"}
                </Text>
              </>
            )}
          </PressableScale>
        </SafeAnimatedView>

        {/* Customer card */}
        <SafeAnimatedView entering={FadeInDown.delay(140).duration(400)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Müşteri Bilgileri</Text>
          <Field label="Müşteri" value={invoice.contact_name || invoice.contact?.name || "-"} colors={colors} />
          <Field label="Sipariş No" value={invoice.order_no || "-"} colors={colors} />
          <Field label="Vergi Dairesi" value={invoice.contact?.tax_office || "-"} colors={colors} />
          <Field label="Vergi/TC No" value={invoice.tax_number || invoice.contact?.tax_number || "-"} colors={colors} />
          <Field label="Adres" value={invoice.billing_address || invoice.contact?.address || "-"} colors={colors} multiline />
          <Field label="Şehir/İlçe" value={`${invoice.contact?.district || "-"} / ${invoice.contact?.city || "-"}`} colors={colors} last />
        </SafeAnimatedView>

        {/* Lines */}
        <SafeAnimatedView entering={FadeInDown.delay(200).duration(400)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Fatura İçerikleri</Text>
          {(invoice.details || []).length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>Satır detayı yok.</Text>
          ) : (
            (invoice.details || []).map((d: any, idx: number) => (
              <View key={`${d.id || "line"}-${idx}`} style={[styles.lineRow, idx > 0 && { borderTopWidth: 1, borderColor: colors.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lineName, { color: colors.textPrimary }]} numberOfLines={2}>{d.product_name || "-"}</Text>
                  <Text style={[styles.lineMeta, { color: colors.textTertiary }]}>KDV %{d.vat_rate ?? 0} · Adet {d.quantity ?? 1}</Text>
                </View>
                <Text style={[styles.linePrice, { color: colors.textPrimary }]}>{formatTry(d.net_total ?? d.unit_price ?? 0)}</Text>
              </View>
            ))
          )}
          <View style={[styles.totalRow, { borderColor: colors.borderSubtle }]}>
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>Genel Toplam</Text>
            <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatTry(total)}</Text>
          </View>
        </SafeAnimatedView>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, colors, multiline, last }: { label: string; value: string; colors: any; multiline?: boolean; last?: boolean }) {
  return (
    <View style={[styles.fieldRow, !last && { borderColor: colors.borderSubtle, borderBottomWidth: 1 }]}>
      <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.textPrimary }]} numberOfLines={multiline ? 4 : 2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 10,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headerLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  headerTitle: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  heroCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  heroLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  heroValue: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8, marginTop: 2 },
  heroDate: { fontSize: 12, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: spacing.md },
  actionBtn: { flex: 1, height: 50, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  actionBtnSecondary: { flex: 1, height: 50, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  actionBtnSecondaryText: { fontSize: 14, fontWeight: "700" },
  card: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2, marginBottom: spacing.xs },
  empty: { fontSize: 13, fontWeight: "500", paddingVertical: 16 },
  fieldRow: { paddingVertical: 10, gap: 4 },
  fieldLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  fieldValue: { fontSize: 13.5, fontWeight: "600" },
  lineRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  lineName: { fontSize: 13.5, fontWeight: "700" },
  lineMeta: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
  linePrice: { fontSize: 13, fontWeight: "800" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  totalValue: { fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
});
