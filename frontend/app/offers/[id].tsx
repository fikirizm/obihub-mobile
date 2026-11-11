import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Clipboard, Linking, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { createOfferPayment, getOfferPayment, getSalesOfferDetail, getWooIntegrations, updateSalesOffer } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatTry } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { CheckIcon, FileTextIcon, LinkIcon, MailIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { OfferPayment, SalesOffer } from "../../src/types";

const STATUS_META: Record<string, { kind: StatusKind; label: string }> = {
  accepted: { kind: "success", label: "Onaylı" },
  approved: { kind: "success", label: "Onaylı" },
  draft: { kind: "neutral", label: "Taslak" },
  waiting: { kind: "warning", label: "Beklemede" },
  sent: { kind: "info", label: "Gönderildi" },
  cancelled: { kind: "error", label: "İptal" },
  rejected: { kind: "error", label: "Reddedildi" },
};

function fmtQty(v: any) {
  const n = parseFloat(String(v ?? 1));
  return Number.isNaN(n) ? "1" : n % 1 === 0 ? String(Math.round(n)) : String(n);
}

export default function OfferDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const offerId = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();

  const [offer, setOffer] = useState<SalesOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<OfferPayment | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<"accepted" | "rejected" | null>(null);
  const [wooIntegrations, setWooIntegrations] = useState<any[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [detail, pay, integData] = await Promise.all([
        getSalesOfferDetail(token, offerId),
        getOfferPayment(token, offerId),
        getWooIntegrations(token),
      ]);
      setOffer(detail ?? null);
      setSendEmail(!!(detail?.contact_email));
      setPayment(pay ?? null);

      const intList: any[] = Array.isArray(integData)
        ? integData
        : Array.isArray(integData?.integrations)
          ? integData.integrations
          : [];
      const wooList = intList.filter((i: any) => i.provider === "woocommerce" && i.status !== "deleted");
      setWooIntegrations(wooList);
      if (wooList.length === 1) setSelectedIntegrationId(wooList[0].id);
    } catch {
      toast("Teklif yüklenirken sorun oluştu.", "error");
    } finally {
      setLoading(false);
    }
  }, [token, offerId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreatePayment = useCallback(async () => {
    if (!token) return;
    if (!selectedIntegrationId) {
      toast("Lütfen bir WooCommerce entegrasyonu seçin.", "info");
      return;
    }
    setCreating(true);
    try {
      const res = await createOfferPayment(token, offerId, sendEmail, selectedIntegrationId);
      setPayment(res);
      toast(
        sendEmail && res?.email_sent
          ? "Ödeme linki oluşturuldu ve müşteriye e-posta gönderildi."
          : "Ödeme linki oluşturuldu.",
        "success"
      );
    } catch {
      toast("Ödeme linki oluşturulurken sorun oluştu.", "error");
    } finally {
      setCreating(false);
    }
  }, [token, offerId, sendEmail, selectedIntegrationId, toast]);

  const handleStatusChange = useCallback(async (newStatus: "accepted" | "rejected") => {
    if (!token || !offer) return;
    const accepting = newStatus === "accepted";
    const ok = await confirm({
      title: accepting ? "Teklif onaylansın mı?" : "Teklif reddedilsin mi?",
      message: `Bu teklifi ${accepting ? "onaylamak" : "reddetmek"} istediğinize emin misiniz?`,
      confirmLabel: accepting ? "Onayla" : "Reddet",
      destructive: !accepting,
    });
    if (!ok) return;
    setStatusUpdating(newStatus);
    try {
      await updateSalesOffer(token, offerId, { status: newStatus });
      setOffer((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast(accepting ? "Teklif onaylandı." : "Teklif reddedildi.", "success");
    } catch {
      toast("Durum güncellenirken sorun oluştu.", "error");
    } finally {
      setStatusUpdating(null);
    }
  }, [token, offerId, offer, confirm, toast]);

  const handleCopyLink = useCallback((url: string) => {
    Clipboard.setString(url);
    toast("Ödeme linki panoya kopyalandı.", "success");
  }, [toast]);

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Teklif" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Teklif" />
        <EmptyState
          icon={<FileTextIcon size={30} color={colors.textTertiary} />}
          title="Teklif bulunamadı"
          description="Teklif silinmiş olabilir. Listeden yeniden açmayı deneyin."
        />
      </View>
    );
  }

  const st = STATUS_META[offer.status || ""] ?? { kind: "neutral" as StatusKind, label: offer.status || "-" };
  const lineItems = Array.isArray(offer.line_items) ? offer.line_items : [];
  const hasPayment = payment?.exists !== false && !!payment?.payment_url;
  const isPaid = payment?.status === "paid";
  const isPending = payment?.status === "pending_payment";
  const totalDiscount = Number((offer as any).total_discount || offer.computed_total_discount || 0);
  const canDecide = offer.status === "waiting" || offer.status === "sent" || offer.status === "draft" || offer.status === "approved";
  const title = offer.description || `Teklif #${offer.id}`;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="offer-detail">
      <StackHeader title={title} subtitle={offer.contact_name || undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
        <Card padded style={styles.block}>
          <View style={styles.headRow}>
            <Text style={[type.headline, { color: colors.textPrimary, flex: 1, minWidth: 0 }]} numberOfLines={2}>
              {offer.contact_name || title}
            </Text>
            <StatusBadge label={st.label} kind={st.kind} />
          </View>
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>Toplam tutar</Text>
          <Text style={[type.largeTitle, tabular, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatTry(Number(offer.net_total || 0))}
          </Text>
          {totalDiscount > 0 ? (
            <Text style={[type.footnote, tabular, { color: colors.error, marginTop: 2 }]}>
              Toplam indirim -{formatTry(totalDiscount)}
            </Text>
          ) : null}
          {offer.issue_date || offer.due_date ? (
            <View style={[styles.dateRow, { borderTopColor: colors.border }]}>
              {offer.issue_date ? (
                <Text style={[type.footnote, { color: colors.textSecondary }]}>Tarih {formatDate(offer.issue_date)}</Text>
              ) : null}
              {offer.due_date ? (
                <Text style={[type.footnote, { color: colors.textSecondary }]}>Son geçerlilik {formatDate(offer.due_date)}</Text>
              ) : null}
            </View>
          ) : null}
        </Card>

        {canDecide ? (
          <View style={styles.actions}>
            <Button
              testID="offer-approve"
              label="Onayla"
              busy={statusUpdating === "accepted"}
              disabled={Boolean(statusUpdating)}
              onPress={() => handleStatusChange("accepted")}
              style={{ flex: 1 }}
            />
            <Button
              testID="offer-reject"
              label="Reddet"
              variant="secondary"
              busy={statusUpdating === "rejected"}
              disabled={Boolean(statusUpdating)}
              onPress={() => handleStatusChange("rejected")}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}

        {lineItems.length > 0 ? (
          <>
            <SectionTitle title="Kalemler" />
            <Card style={styles.block}>
              {lineItems.map((item, idx) => (
                <ListRow
                  key={item.id || idx}
                  divider={idx > 0}
                  title={(item as any).product_name || item.description || "Ürün/Hizmet"}
                  subtitle={`${fmtQty(item.quantity)} adet × ${formatTry(Number(item.unit_price || 0))}`}
                  trailing={
                    <>
                      <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>
                        {formatTry(Number((item as any).total || item.net_total || 0))}
                      </Text>
                      {Number(item.discount_value || 0) > 0 ? (
                        <Text style={[type.caption, tabular, { color: colors.error }]}>
                          -{item.discount_type === "percentage"
                            ? `%${Number(item.discount_value).toFixed(2)}`
                            : formatTry(Number(item.discount_value))}
                        </Text>
                      ) : null}
                    </>
                  }
                />
              ))}
            </Card>
          </>
        ) : null}

        {/* Ödeme bölümü yalnızca WooCommerce entegrasyonu varsa veya ödeme zaten oluşturulmuşsa gösterilir. */}
        {hasPayment || wooIntegrations.length > 0 ? (
          <>
            <SectionTitle title="Ödeme" />
            <Card padded style={styles.block}>
              {hasPayment ? (
                <View style={{ gap: spacing.sm }}>
                  <StatusBadge
                    label={isPaid ? "Ödeme alındı" : isPending ? "Ödeme bekleniyor" : payment?.status || "-"}
                    kind={isPaid ? "success" : isPending ? "warning" : "neutral"}
                  />

                  <View style={[styles.linkBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                    <PressableScale
                      testID="offer-payment-open"
                      onPress={() => { if (payment?.payment_url) Linking.openURL(payment.payment_url); }}
                      accessibilityRole="link"
                      accessibilityLabel="Ödeme linkini aç"
                      style={styles.linkPress}
                    >
                      <LinkIcon size={16} color={colors.primary} />
                      <Text style={[type.callout, { color: colors.primary, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                        {payment?.payment_url ?? "-"}
                      </Text>
                    </PressableScale>
                    <Button
                      testID="offer-payment-copy"
                      label="Kopyala"
                      variant="secondary"
                      size="sm"
                      onPress={() => { if (payment?.payment_url) handleCopyLink(payment.payment_url); }}
                    />
                  </View>

                  {payment?.contact_email ? (
                    <View style={styles.emailRow}>
                      <MailIcon size={14} color={colors.textTertiary} />
                      <Text style={[type.caption, { color: colors.textTertiary, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                        Gönderildi: {payment.contact_email}
                      </Text>
                    </View>
                  ) : null}

                  {!isPaid ? (
                    <Button
                      testID="offer-payment-recreate"
                      label="Yeniden oluştur"
                      variant="secondary"
                      busy={creating}
                      onPress={handleCreatePayment}
                    />
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {wooIntegrations.length > 1 ? (
                    <View style={{ gap: spacing.xs }} accessibilityRole="radiogroup">
                      <Text style={[type.caption, { color: colors.textSecondary }]}>Mağaza seçin</Text>
                      {wooIntegrations.map((integ) => {
                        const active = selectedIntegrationId === integ.id;
                        return (
                          <PressableScale
                            key={integ.id}
                            testID={`offer-integration-${integ.id}`}
                            onPress={() => setSelectedIntegrationId(integ.id)}
                            accessibilityRole="radio"
                            accessibilityLabel={String(integ.name || integ.id)}
                            accessibilityState={{ selected: active }}
                            style={[
                              styles.optionRow,
                              {
                                borderColor: active ? colors.primary : colors.border,
                                backgroundColor: active ? colors.primarySoft : colors.surface,
                              },
                            ]}
                          >
                            <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                              {integ.name || integ.id}
                            </Text>
                            {active ? <CheckIcon size={16} color={colors.primary} /> : null}
                          </PressableScale>
                        );
                      })}
                    </View>
                  ) : null}

                  {offer.contact_email ? (
                    <View style={[styles.optionRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Müşteriye e-posta gönder</Text>
                        <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                          {offer.contact_email}
                        </Text>
                      </View>
                      <Switch
                        testID="offer-send-email"
                        value={sendEmail}
                        onValueChange={setSendEmail}
                        accessibilityLabel="Müşteriye e-posta gönder"
                        trackColor={{ false: colors.border, true: colors.primary }}
                        ios_backgroundColor={colors.border}
                      />
                    </View>
                  ) : null}

                  <Button testID="offer-payment-create" label="Ödeme linki oluştur" busy={creating} onPress={handleCreatePayment} />
                </View>
              )}
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
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.md,
    rowGap: spacing.xxs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 56,
  },
  linkPress: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  emailRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
