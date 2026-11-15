import React, { useCallback, useEffect, useState } from "react";
import { Clipboard, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { getOfferPayment, getSalesOfferDetail } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { CheckIcon, FileTextIcon, LinkIcon, MailIcon, TagIcon, WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { DetailHero } from "../../src/ui/DetailHero";
import type { HeroStat } from "../../src/ui/DetailHero";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
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

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toLocaleUpperCase("tr-TR");
}

// Yükleme iskeleti: özet kartı, işlem düğmeleri ve kalem satırlarıyla aynı biçimde.
function OfferSkeleton() {
  const { colors } = useTheme();
  const bar = (w: number | `${number}%`, h: number) => (
    <View style={{ width: w, height: h, borderRadius: radius.sm, backgroundColor: colors.border }} />
  );
  return (
    <View accessible accessibilityLabel="Teklif yükleniyor" testID="offer-loading">
      <Card padded style={[styles.block, { gap: spacing.sm, minHeight: 196 }]}>
        <View style={styles.skelRow}>
          <View style={[styles.skelAvatar, { backgroundColor: colors.border }]} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            {bar("70%", 16)}
            {bar("45%", 12)}
          </View>
        </View>
        <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
          {bar("30%", 12)}
          {bar("60%", 32)}
        </View>
        <View style={[styles.skelRow, { marginTop: spacing.sm }]}>
          {bar("30%", 28)}
          {bar("30%", 28)}
          {bar("30%", 28)}
        </View>
      </Card>
      <View style={styles.actions}>
        <View style={[styles.skelButton, { backgroundColor: colors.border }]} />
        <View style={[styles.skelButton, { backgroundColor: colors.border }]} />
      </View>
      <View style={styles.skelSection}>{bar(96, 16)}</View>
      <Card style={styles.block}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.skelItem,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
          >
            <View style={[styles.skelTile, { backgroundColor: colors.border }]} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              {bar("65%", 14)}
              {bar("40%", 12)}
            </View>
            {bar(64, 14)}
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function OfferDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const offerId = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();

  const [offer, setOffer] = useState<SalesOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payment, setPayment] = useState<OfferPayment | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [detail, pay] = await Promise.all([getSalesOfferDetail(token, offerId), getOfferPayment(token, offerId)]);
      setOffer(detail ?? null);
      setLoadError(null);
      setPayment(pay ?? null);
    } catch (e: any) {
      setLoadError(e?.message || "Teklif yüklenirken sorun oluştu.");
      toast("Teklif yüklenirken sorun oluştu.", "error");
    } finally {
      setLoading(false);
    }
  }, [token, offerId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleCopyLink = useCallback((url: string) => {
    Clipboard.setString(url);
    toast("Ödeme linki panoya kopyalandı.", "success");
  }, [toast]);

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Teklif" />
        <OfferSkeleton />
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Teklif" />
        <EmptyState
          icon={<FileTextIcon size={30} color={colors.violet} />}
          title={loadError ? "Teklif yüklenemedi" : "Teklif bulunamadı"}
          description={loadError || "Teklif silinmiş olabilir. Listeden yeniden açmayı deneyin."}
          actionLabel={loadError ? "Tekrar dene" : undefined}
          onAction={loadError ? () => load() : undefined}
        />
      </View>
    );
  }

  const st = STATUS_META[offer.status || ""] ?? { kind: "neutral" as StatusKind, label: offer.status || "-" };
  const lineItems = Array.isArray(offer.line_items) ? offer.line_items : [];
  const hasPayment = payment?.exists !== false && !!payment?.payment_url;
  const isPaid = payment?.status === "paid";
  const isPending = payment?.status === "pending_payment";
  // Sunucu WooCommerce siparişi iptal, iade ya da başarısız olduğunda "cancelled" döndürür.
  const isCancelled = payment?.status === "cancelled";
  const money = (v: number | string | undefined | null) => formatMoney(v, offer.currency);
  const totalDiscount = Number((offer as any).total_discount || offer.computed_total_discount || 0);
  const title = offer.description || `Teklif #${offer.id}`;
  const heroTitle = offer.contact_name || title;
  const initials = initialsOf(offer.contact_name || "");
  // Tarih önce gelir: alt başlık iki satırda kesildiğinde kırpılan kısım, üst başlıkta da görünen açıklama olur.
  const heroSubtitle = [offer.issue_date ? `Tarih ${formatDate(offer.issue_date)}` : null, offer.contact_name ? title : null]
    .filter(Boolean)
    .join(" · ");
  const heroStats: HeroStat[] = [];
  if (offer.due_date) heroStats.push({ label: "Son geçerlilik", value: formatDate(offer.due_date) });
  if (lineItems.length > 0) heroStats.push({ label: "Kalem", value: String(lineItems.length) });
  if (totalDiscount > 0) heroStats.push({ label: "Toplam indirim", value: `-${money(totalDiscount)}`, tone: "bad" });
  const payLabel = isPaid ? "Ödeme alındı" : isPending ? "Ödeme bekleniyor" : isCancelled ? "İptal edildi" : payment?.status || "-";
  const payTint = isPaid ? colors.successBg : isPending ? colors.warningBg : isCancelled ? colors.errorBg : colors.surfaceMuted;
  const payColor = isPaid ? colors.success : isPending ? colors.warning : isCancelled ? colors.error : colors.textSecondary;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="offer-detail">
      <StackHeader title={title} subtitle={offer.contact_name || undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: spacing.sm }}>
          <DetailHero
            tone="violet"
            leading={
              <View style={styles.avatar}>
                {initials ? (
                  <Text style={styles.avatarText}>{initials}</Text>
                ) : (
                  <FileTextIcon size={20} color={ON_HERO.text} />
                )}
              </View>
            }
            title={heroTitle}
            subtitle={heroSubtitle || undefined}
            badge={<StatusBadge label={st.label} kind={st.kind} />}
            valueLabel="Toplam tutar"
            value={money(Number(offer.net_total || 0))}
            stats={heroStats}
          />
        </View>

        {/* PM 15 Kas 2026 (web WP-21): Paraşüt teklifleri salt okuma; yeni teklif ObiHub'da açılır. */}
        <View testID="offer-readonly-note" style={[styles.note, { backgroundColor: colors.infoBg }]}>
          <Text style={[type.footnote, { color: colors.textPrimary }]}>Yeni teklifler ObiHub'da oluşturulur.</Text>
        </View>

        {lineItems.length > 0 ? (
          <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
            <SectionTitle
              title="Kalemler"
              action={
                <Text style={[type.footnote, tabular, { color: colors.textTertiary }]}>{lineItems.length} kalem</Text>
              }
            />
            <Card style={styles.block}>
              {lineItems.map((item, idx) => (
                <ListRow
                  key={item.id || idx}
                  divider={idx > 0}
                  leading={
                    <IconTile tint={colors.violetSoft}>
                      <TagIcon size={18} color={colors.violet} />
                    </IconTile>
                  }
                  title={(item as any).product_name || item.description || "Ürün/Hizmet"}
                  subtitle={`${fmtQty(item.quantity)} adet × ${money(Number(item.unit_price || 0))}`}
                  trailing={
                    <>
                      <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>
                        {money(Number((item as any).total || item.net_total || 0))}
                      </Text>
                      {Number(item.discount_value || 0) > 0 ? (
                        <Text style={[type.caption, tabular, { color: colors.error }]}>
                          -{item.discount_type === "percentage"
                            ? `%${Number(item.discount_value).toFixed(2)}`
                            : money(Number(item.discount_value))}
                        </Text>
                      ) : null}
                    </>
                  }
                />
              ))}
            </Card>
          </SafeAnimatedView>
        ) : null}

        {/* Salt okuma: yalnız daha önce oluşturulmuş ödeme linki ve durumu gösterilir. */}
        {hasPayment ? (
          <SafeAnimatedView entering={FadeInDown.delay(210).duration(380)}>
            <SectionTitle title="Ödeme" />
            <Card padded style={styles.block}>
              {hasPayment ? (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.payHead}>
                    <IconTile tint={payTint}>
                      {isPaid ? <CheckIcon size={18} color={payColor} /> : <WalletIcon size={18} color={payColor} />}
                    </IconTile>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                        Ödeme linki
                      </Text>
                      {payment?.woo_order_id ? (
                        <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 1 }]} numberOfLines={1}>
                          WooCommerce siparişi #{payment.woo_order_id}
                        </Text>
                      ) : null}
                    </View>
                    <StatusBadge label={payLabel} kind={isPaid ? "success" : isPending ? "warning" : isCancelled ? "error" : "neutral"} />
                  </View>

                  <View style={[styles.linkBox, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                    <PressableScale
                      testID="offer-payment-open"
                      onPress={() => { if (payment?.payment_url) Linking.openURL(payment.payment_url); }}
                      accessibilityRole="link"
                      accessibilityLabel="Ödeme linkini aç"
                      style={styles.linkPress}
                    >
                      <IconTile tint={colors.primarySoft}>
                        <LinkIcon size={16} color={colors.primary} />
                      </IconTile>
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

                  {isCancelled ? (
                    <Text style={[type.caption, { color: colors.error }]}>
                      Bu ödeme iptal edilmiş; link artık geçerli olmayabilir.
                    </Text>
                  ) : null}

                </View>
              ) : null}
            </Card>
          </SafeAnimatedView>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ON_HERO.faint,
  },
  avatarText: { color: ON_HERO.text, fontSize: 16, fontWeight: "700" },
  payHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skelAvatar: { width: 44, height: 44, borderRadius: 22 },
  skelButton: { flex: 1, height: 48, borderRadius: radius.md },
  skelSection: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  skelItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  skelTile: { width: 36, height: 36, borderRadius: 10 },
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
