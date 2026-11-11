import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import { getSalesOfferDetail, getOfferPayment, createOfferPayment, getWooIntegrations, updateSalesOffer } from "../../src/api";
import { formatTry } from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import {
  ArrowLeftIcon,
  FileTextIcon,
  LinkIcon,
  MailIcon,
  CheckIcon,
  ClockIcon,
} from "../../src/components/Icons";
import type { SalesOffer, OfferPayment } from "../../src/types";

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  accepted:  { bg: "#DCFCE7", text: "#16A34A", label: "Onaylı" },
  approved:  { bg: "#DCFCE7", text: "#16A34A", label: "Onaylı" },
  draft:     { bg: "#F1F5F9", text: "#64748B", label: "Taslak" },
  waiting:   { bg: "#FEF3C7", text: "#D97706", label: "Beklemede" },
  sent:      { bg: "#DBEAFE", text: "#2563EB", label: "Gönderildi" },
  cancelled: { bg: "#FEE2E2", text: "#DC2626", label: "İptal" },
  rejected:  { bg: "#FEE2E2", text: "#DC2626", label: "Reddedildi" },
};

function fmtQty(v: any) {
  const n = parseFloat(String(v ?? 1));
  return Number.isNaN(n) ? "1" : n % 1 === 0 ? String(Math.round(n)) : String(n);
}

export default function OfferDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const offerId = String(params.id || "");
  const { token } = useAuth();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [offer, setOffer] = useState<SalesOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<OfferPayment | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
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
    } catch (e: any) {
      Alert.alert("Hata", "Teklif yüklenirken sorun oluştu.");
    } finally {
      setLoading(false);
    }
  }, [token, offerId]);

  useEffect(() => { load(); }, [load]);

  const handleCreatePayment = useCallback(async () => {
    if (!token) return;
    if (!selectedIntegrationId) {
      Alert.alert("Entegrasyon Seçin", "Lütfen bir WooCommerce entegrasyonu seçin.");
      return;
    }
    setCreating(true);
    try {
      const res = await createOfferPayment(token, offerId, sendEmail, selectedIntegrationId);
      setPayment(res);
      Alert.alert(
        "Ödeme Linki Oluşturuldu",
        sendEmail && res?.email_sent
          ? "Ödeme linki oluşturuldu ve müşteriye mail gönderildi."
          : "Ödeme linki oluşturuldu.",
        [{ text: "Tamam" }]
      );
    } catch (e: any) {
      Alert.alert("Hata", "Ödeme linki oluşturulurken sorun oluştu.");
    } finally {
      setCreating(false);
    }
  }, [token, offerId, sendEmail, selectedIntegrationId]);

  const handleStatusChange = useCallback(async (newStatus: "accepted" | "rejected") => {
    if (!token || !offer) return;
    const label = newStatus === "accepted" ? "onaylamak" : "reddetmek";
    Alert.alert(
      newStatus === "accepted" ? "Teklifi Onayla" : "Teklifi Reddet",
      `Bu teklifi ${label} istediğinize emin misiniz?`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: newStatus === "accepted" ? "Onayla" : "Reddet",
          style: newStatus === "rejected" ? "destructive" : "default",
          onPress: async () => {
            setStatusUpdating(true);
            try {
              await updateSalesOffer(token, offerId, { status: newStatus });
              setOffer((prev) => prev ? { ...prev, status: newStatus } : prev);
            } catch {
              Alert.alert("Hata", "Durum güncellenirken sorun oluştu.");
            } finally {
              setStatusUpdating(false);
            }
          },
        },
      ]
    );
  }, [token, offerId, offer]);

  const handleCopyLink = useCallback((url: string) => {
    Clipboard.setString(url);
    Alert.alert("Kopyalandı", "Ödeme linki panoya kopyalandı.");
  }, []);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#D97706" />
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Teklif bulunamadı.</Text>
      </View>
    );
  }

  const st = STATUS_META[offer.status || ""] ?? { bg: "#F1F5F9", text: "#64748B", label: offer.status || "—" };
  const lineItems = Array.isArray(offer.line_items) ? offer.line_items : [];
  const hasPayment = payment?.exists !== false && !!payment?.payment_url;
  const isPaid = payment?.status === "paid";
  const isPending = payment?.status === "pending_payment";

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surface,
            borderBottomColor: colors.borderSubtle,
          },
        ]}
      >
        <PressableScale onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeftIcon size={22} color={colors.textPrimary} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {offer.description || `Teklif #${offer.id}`}
          </Text>
          {offer.contact_name ? (
            <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {offer.contact_name}
            </Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusText, { color: st.text }]}>{st.label}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <Animated.View entering={FadeIn.duration(300)}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>Toplam Tutar</Text>
              <Text style={[styles.cardBigValue, { color: colors.textPrimary }]}>
                {formatTry(Number(offer.net_total || 0))}
              </Text>
            </View>
            {Number((offer as any).total_discount || offer.computed_total_discount || 0) > 0 && (
              <View style={[styles.cardRow, { marginTop: 6 }]}>
                <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>Toplam İndirim</Text>
                <Text style={[styles.discountVal, { color: "#EF4444" }]}>
                  -{formatTry(Number((offer as any).total_discount || offer.computed_total_discount))}
                </Text>
              </View>
            )}
            {offer.issue_date || offer.due_date ? (
              <View style={[styles.dateRow, { marginTop: 10, borderTopColor: colors.borderSubtle }]}>
                {offer.issue_date ? (
                  <Text style={[styles.dateText, { color: colors.textTertiary }]}>
                    Tarih: <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{offer.issue_date}</Text>
                  </Text>
                ) : null}
                {offer.due_date ? (
                  <Text style={[styles.dateText, { color: colors.textTertiary }]}>
                    Son: <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{offer.due_date}</Text>
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Approve / Reject actions */}
        {(offer.status === "waiting" || offer.status === "sent" || offer.status === "draft" || offer.status === "approved") && (
          <SafeAnimatedView entering={FadeInDown.delay(40).springify().damping(18)}>
            <View style={styles.actionRow}>
              <PressableScale
                onPress={() => handleStatusChange("accepted")}
                disabled={statusUpdating}
                style={[styles.actionBtn, styles.approveBtn]}
              >
                {statusUpdating ? (
                  <ActivityIndicator size="small" color="#16A34A" />
                ) : (
                  <>
                    <CheckIcon size={16} color="#16A34A" />
                    <Text style={[styles.actionBtnText, { color: "#16A34A" }]}>Onayla</Text>
                  </>
                )}
              </PressableScale>
              <PressableScale
                onPress={() => handleStatusChange("rejected")}
                disabled={statusUpdating}
                style={[styles.actionBtn, styles.rejectBtn]}
              >
                {statusUpdating ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <ClockIcon size={16} color="#DC2626" />
                    <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Reddet</Text>
                  </>
                )}
              </PressableScale>
            </View>
          </SafeAnimatedView>
        )}

        {/* Line items */}
        {lineItems.length > 0 && (
          <SafeAnimatedView entering={FadeInDown.delay(80).springify().damping(18)}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Kalemler</Text>
              {lineItems.map((item, idx) => (
                <View
                  key={item.id || idx}
                  style={[
                    styles.lineRow,
                    idx < lineItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {(item as any).product_name || item.description || "Ürün/Hizmet"}
                    </Text>
                    <Text style={[styles.lineMeta, { color: colors.textTertiary }]}>
                      {fmtQty(item.quantity)} adet × {formatTry(Number(item.unit_price || 0))}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={[styles.lineTotal, { color: colors.textPrimary }]}>
                      {formatTry(Number((item as any).total || item.net_total || 0))}
                    </Text>
                    {Number(item.discount_value || 0) > 0 && (
                      <Text style={[styles.lineDiscount, { color: "#EF4444" }]}>
                        -{item.discount_type === "percentage"
                          ? `%${Number(item.discount_value).toFixed(2)}`
                          : formatTry(Number(item.discount_value))}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </SafeAnimatedView>
        )}

        {/* Payment section — sadece WooCommerce entegrasyonu varsa veya zaten ödeme oluşturulmuşsa göster */}
        {(hasPayment || wooIntegrations.length > 0) && <SafeAnimatedView entering={FadeInDown.delay(160).springify().damping(18)}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ödeme</Text>

            {hasPayment ? (
              <View style={{ gap: spacing.sm }}>
                {/* Status row */}
                <View style={styles.payStatusRow}>
                  <View
                    style={[
                      styles.payStatusDot,
                      { backgroundColor: isPaid ? "#16A34A" : isPending ? "#F59E0B" : "#94A3B8" },
                    ]}
                  />
                  <Text style={[styles.payStatusText, { color: colors.textSecondary }]}>
                    {isPaid ? "Ödeme Alındı" : isPending ? "Ödeme Bekleniyor" : payment?.status || "—"}
                  </Text>
                </View>

                {/* Payment link button */}
                <View style={[styles.linkBtn, { borderColor: colors.borderSubtle }]}>
                  <LinkIcon size={16} color="#2563EB" />
                  <Text
                    style={styles.linkBtnText}
                    numberOfLines={1}
                    onPress={() => payment?.payment_url && Linking.openURL(payment.payment_url)}
                  >
                    {payment?.payment_url ?? "—"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => payment?.payment_url && handleCopyLink(payment.payment_url)}
                    style={styles.copyBtn}
                  >
                    <Text style={styles.copyBtnText}>Kopyala</Text>
                  </TouchableOpacity>
                </View>

                {payment?.contact_email && (
                  <View style={styles.emailRow}>
                    <MailIcon size={14} color={colors.textTertiary} />
                    <Text style={[styles.emailText, { color: colors.textTertiary }]}>
                      Gönderildi: {payment.contact_email}
                    </Text>
                  </View>
                )}

                {/* Re-create */}
                {!isPaid && (
                  <PressableScale
                    onPress={handleCreatePayment}
                    style={[styles.secondaryBtn, { borderColor: colors.borderSubtle }]}
                    disabled={creating}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#D97706" />
                    ) : (
                      <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                        Yeniden Oluştur
                      </Text>
                    )}
                  </PressableScale>
                )}
              </View>
            ) : (
              /* No payment yet */
              <View style={{ gap: spacing.sm }}>
                {wooIntegrations.length > 1 && (
                  <View style={{ gap: 6 }}>
                    <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>Mağaza Seç</Text>
                    {wooIntegrations.map((integ) => (
                      <PressableScale
                        key={integ.id}
                        onPress={() => setSelectedIntegrationId(integ.id)}
                        style={[
                          styles.integRow,
                          {
                            borderColor: selectedIntegrationId === integ.id ? "#D97706" : colors.borderSubtle,
                            backgroundColor: selectedIntegrationId === integ.id ? "#FEF3C7" : colors.background,
                          },
                        ]}
                      >
                        <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{integ.name || integ.id}</Text>
                        {selectedIntegrationId === integ.id && <CheckIcon size={16} color="#D97706" />}
                      </PressableScale>
                    ))}
                  </View>
                )}
                {wooIntegrations.length === 0 && (
                  <Text style={[styles.toggleSub, { color: "#EF4444" }]}>
                    WooCommerce entegrasyonu bulunamadı. Lütfen önce entegrasyon ekleyin.
                  </Text>
                )}
                {offer.contact_email ? (
                  <View style={[styles.emailToggleRow, { backgroundColor: colors.background, borderColor: colors.borderSubtle }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Müşteriye Mail Gönder</Text>
                      <Text style={[styles.toggleSub, { color: colors.textTertiary }]}>{offer.contact_email}</Text>
                    </View>
                    <Switch
                      value={sendEmail}
                      onValueChange={setSendEmail}
                      trackColor={{ false: colors.borderSubtle, true: "#FDE68A" }}
                      thumbColor={sendEmail ? "#D97706" : "#94A3B8"}
                    />
                  </View>
                ) : null}

                <PressableScale
                  onPress={handleCreatePayment}
                  style={styles.primaryBtn}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Ödeme Linki Oluştur</Text>
                  )}
                </PressableScale>
              </View>
            )}
          </View>
        </SafeAnimatedView>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: fontWeight.bold, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  statusText: { fontSize: 11, fontWeight: "700" },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 0 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  cardBigValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  discountVal: { fontSize: 14, fontWeight: "700" },
  dateRow: { flexDirection: "row", gap: 16, paddingTop: 10, borderTopWidth: 1 },
  dateText: { fontSize: 12, fontWeight: "500" },
  sectionTitle: { fontSize: 13, fontWeight: "800", letterSpacing: -0.2, marginBottom: spacing.sm },
  lineRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, gap: 8 },
  lineName: { fontSize: 13, fontWeight: "700", letterSpacing: -0.1 },
  lineMeta: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
  lineTotal: { fontSize: 13, fontWeight: "800" },
  lineDiscount: { fontSize: 11, fontWeight: "700" },
  payStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  payStatusDot: { width: 8, height: 8, borderRadius: 4 },
  payStatusText: { fontSize: 13, fontWeight: "600" },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  linkBtnText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#2563EB" },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  emailText: { fontSize: 12, fontWeight: "500" },
  emailToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  toggleLabel: { fontSize: 13, fontWeight: "700" },
  toggleSub: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
  primaryBtn: {
    backgroundColor: "#0F172A",
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "700" },
  integRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  approveBtn: { borderColor: "#16A34A", backgroundColor: "#F0FDF4" },
  rejectBtn: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
  },
  copyBtnText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
});
