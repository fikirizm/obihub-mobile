import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { printOrShare } from "../../src/pdf";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import {
  createHepsiJetShipment,
  enqueueOrderCloudPrint,
  getOrderDetail,
} from "../../src/api";
import {
  displayOrderNo,
  orderTimestamp,
  displayOrderStatus,
  formatOrderDateTime,
  formatTry,
  getOrderTrackingNo,
  providerLabel,
  relativeDateLabel,
  statusKindFromOrder,
} from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { AlertIcon, ClockIcon, CloudIcon, PackageIcon, PrinterIcon, TruckIcon } from "../../src/components/Icons";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { fetchOrderLabelFile } from "../../src/labels";
import { StackHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { DetailHero, type HeroStat } from "../../src/ui/DetailHero";
import { ON_HERO } from "../../src/ui/HeroCard";
import { saveCache, loadCache } from "../../src/offlineCache";
import type { Order } from "../../src/types";

// Yüklenirken içerikle aynı biçimde yer tutucular: özet kartı, işlem düğmeleri, ürün satırları.
function DetailSkeleton() {
  const { colors } = useTheme();
  const bar = { backgroundColor: colors.border, borderRadius: radius.xs };
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Sipariş yükleniyor">
      <View style={[styles.skHero, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
        <View style={styles.skRow}>
          <View style={[styles.skLogo, { backgroundColor: colors.border }]} />
          <View style={styles.flexText}>
            <View style={[bar, { height: 16, width: "62%" }]} />
            <View style={[bar, { height: 12, width: "84%", marginTop: spacing.xs }]} />
          </View>
        </View>
        <View style={[bar, { height: 30, width: "48%", marginTop: spacing.lg }]} />
        <View style={[styles.skRow, { marginTop: spacing.lg }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[bar, { flex: 1, height: 34 }]} />
          ))}
        </View>
      </View>
      <View style={[styles.skBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]} />
      <View style={[styles.skCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.itemRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          >
            <View style={[styles.itemImg, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]} />
            <View style={styles.flexText}>
              <View style={[bar, { height: 14, width: "78%" }]} />
              <View style={[bar, { height: 12, width: "44%", marginTop: spacing.xs }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function OrderDetail() {
  const params = useLocalSearchParams<{ id: string; provider?: string }>();
  const orderId = String(params.id || "");
  const providerHint = String(params.provider || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [shipBusy, setShipBusy] = useState(false);
  const { toast, confirm } = useFeedback();

  const load = async (silent = false) => {
    if (!token || !orderId) return;
    if (!silent) setLoading(true);
    const cacheKey = `order_detail_${orderId}`;
    if (!silent) {
      const cached = await loadCache<Order>(cacheKey);
      if (cached) {
        setOrder(cached);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      const o = await getOrderDetail(token, orderId);
      setOrder(o);
      setIsOffline(false);
      await saveCache(cacheKey, o);
    } catch {
      // Ağ hatası — cache gösterilmeye devam eder
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, orderId]);

  const provider = providerHint || (order ? String(order.integration_provider || order.provider || order.channel || "") : "");

  const fetchLabelFile = async (): Promise<string> => {
    if (!token || !order) throw new Error("Oturum bulunamadı.");
    return fetchOrderLabelFile(token, order.id, provider);
  };

  const handlePrint = async () => {
    if (!token || !order) return;
    setPrintBusy(true);
    try {
      setPrintStatus("Etiket alınıyor...");
      let path: string;
      try {
        path = await fetchLabelFile();
      } catch (e: any) {
        toast(e?.message || "Bu sipariş için etiket alınamadı.", "error");
        setPrintStatus(null);
        return;
      }
      setPrintStatus("Yazıcıya gönderiliyor...");
      await printOrShare(path);
      setPrintStatus(null);
    } catch (e: any) {
      toast(e?.message || "Yazdırma başarısız.", "error");
      setPrintStatus(null);
    } finally {
      setPrintBusy(false);
    }
  };

  // Web panelindeki kuralla aynı: pazaryerinin kendi kargosu olan kanallarda ve gönderisi olan siparişte gösterilmez.
  const canCreateShipment = (() => {
    if (!order) return false;
    const status = String(order.status || "").toLowerCase();
    if (status === "cancelled" || status === "deleted") return false;
    const channel = String(order.channel || provider || "").toLowerCase();
    if (["trendyol", "hepsiburada", "idefix", "pazarama"].some((c) => channel.includes(c))) return false;
    if (channel.includes("n11")) return !order.n11_cargo_tracking;
    const hasBarcode = (order.cargo_barcodes || []).some((b) => b?.barcode) || Boolean(order.cargo_tracking);
    return !hasBarcode;
  })();

  const handleCreateShipment = async () => {
    if (!token || !order) return;
    const ok = await confirm({
      title: "Kargo gönderisi oluşturulsun mu?",
      message: "Sipariş için kargo firmasında gönderi açılır ve barkod üretilir.",
      confirmLabel: "Gönderi oluştur",
    });
    if (!ok) return;
    setShipBusy(true);
    try {
      const r = await createHepsiJetShipment(token, order.id);
      if (r?.success) {
        toast(r.barcode ? `Gönderi oluşturuldu: ${r.barcode}` : r.message || "Gönderi oluşturuldu", "success");
        await load(true);
      } else {
        toast(r?.message || "Gönderi oluşturulamadı.", "error");
      }
    } catch (e: any) {
      toast(e?.message || "Gönderi oluşturulamadı.", "error");
    } finally {
      setShipBusy(false);
    }
  };

  const handleCloud = async () => {
    if (!token || !order) return;
    setCloudBusy(true);
    try {
      const r = await enqueueOrderCloudPrint(token, order.id);
      toast(r?.message || "Yazdırma kuyruğa eklendi.", "success");
    } catch (e: any) {
      toast(e?.message || "Bulut yazdırma başarısız.", "error");
    } finally {
      setCloudBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackHeader title="Sipariş" />
        <DetailSkeleton />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackHeader title="Sipariş" />
        <EmptyState
          icon={<PackageIcon size={30} color={colors.textTertiary} />}
          title="Sipariş bulunamadı"
          description="Sipariş silinmiş olabilir veya bağlantı kurulamadı."
        />
      </View>
    );
  }

  const kind = statusKindFromOrder(order, provider);
  const trackingNo = getOrderTrackingNo(order);
  const items = order.items || [];
  const subtotal = items.reduce((a, b) => a + Number(b.total_price ?? Number(b.unit_price || 0) * Number(b.quantity || 0)), 0);
  const totalQty = items.reduce((a, b) => a + Number(b.quantity || 0), 0);
  const totalText = formatTry(order.total_amount || subtotal);
  const orderDateTime = formatOrderDateTime(order);
  // Özet kartında kısa tarih ("11 Kas"); tam tarih ve saat aşağıdaki satırda gösterilir.
  const orderTs = orderTimestamp(order);
  const shortOrderDate = orderTs ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(orderTs)) : "-";
  const cargoError = Boolean(order.cargo_error_message) && String(order.cargo_status || "") === "error";

  const shareTracking = async () => {
    try {
      await Share.share({ message: trackingNo });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  const heroStats: HeroStat[] = [
    { label: "Adet", value: String(totalQty) },
    // Karttaki hücre dar olduğu için yalnızca gün gösterilir; saatli hali aşağıdaki satırdadır.
    { label: "Tarih", value: shortOrderDate },
    trackingNo
      ? { label: "Kargo", value: "Hazır", tone: "good" }
      : cargoError
        ? { label: "Kargo", value: "Hata", tone: "bad" }
        : { label: "Kargo", value: "Yok" },
  ];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackHeader
        title={`#${displayOrderNo(order)}`}
        subtitle={isOffline ? "Çevrimdışı · önbellekten gösteriliyor" : "Sipariş"}
        right={<PlatformLogo provider={provider} size="sm" />}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.huge }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
          />
        }
      >
        <DetailHero
          tone="blue"
          leading={
            <View style={styles.heroLogo}>
              <PlatformLogo provider={provider} size="sm" />
            </View>
          }
          eyebrow="Müşteri"
          title={order.customer_name || "-"}
          subtitle={`#${displayOrderNo(order)} · ${providerLabel(provider)} · ${relativeDateLabel(order)}`}
          value={totalText}
          valueLabel="Toplam"
          stats={heroStats}
        >
          {/* Rozet başlık satırında müşteri adını daralttığı için kartın altında ayrı satırda gösterilir. */}
          <View style={styles.heroStatusRow}>
            <Text style={styles.heroStatusLabel}>Durum</Text>
            <View style={styles.heroStatusBadge}>
              <StatusBadge label={displayOrderStatus(order, provider)} kind={kind} size="sm" />
            </View>
          </View>
        </DetailHero>

        {isOffline ? (
          <View
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.warningBg, borderColor: colors.borderSubtle }]}
          >
            <CloudIcon size={16} color={colors.warning} />
            <Text style={[type.footnote, styles.flexText, { color: colors.textPrimary }]}>
              Çevrimdışısınız. Önbellekteki son bilgiler gösteriliyor.
            </Text>
          </View>
        ) : null}

        <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
          <Button
            testID="print-btn"
            label="Yazdır"
            icon={<PrinterIcon size={18} color="#FFFFFF" />}
            busy={printBusy}
            onPress={handlePrint}
            style={styles.primaryBtn}
          />
          <View style={styles.actions}>
            <Button
              testID="cloud-btn"
              label="Bulut yazıcı"
              variant="secondary"
              icon={<CloudIcon size={16} color={colors.textPrimary} />}
              busy={cloudBusy}
              onPress={handleCloud}
              style={styles.flexBtn}
            />
            {canCreateShipment ? (
              <Button
                testID="create-shipment-btn"
                label="Gönderi oluştur"
                variant="secondary"
                icon={<TruckIcon size={16} color={colors.textPrimary} />}
                busy={shipBusy}
                onPress={handleCreateShipment}
                style={styles.flexBtn}
              />
            ) : null}
          </View>

          {printStatus ? (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.printStatusRow, { backgroundColor: colors.primarySoft, borderColor: colors.borderSubtle }]}
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{printStatus}</Text>
            </View>
          ) : null}

          {cargoError ? (
            <View
              accessibilityRole="alert"
              style={[styles.notice, { backgroundColor: colors.errorBg, borderColor: colors.borderSubtle }]}
            >
              <AlertIcon size={16} color={colors.error} />
              <Text style={[type.footnote, styles.flexText, { color: colors.error }]}>
                Son kargo denemesi: {order.cargo_error_message}
              </Text>
            </View>
          ) : null}
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
          <SectionTitle title="Sipariş bilgileri" />
          <Card style={styles.block}>
            <ListRow
              leading={
                <IconTile tint={colors.primarySoft}>
                  <ClockIcon size={18} color={colors.primary} />
                </IconTile>
              }
              title="Sipariş tarihi"
              subtitle={`${relativeDateLabel(order)} · ${providerLabel(provider)}`}
              trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{orderDateTime}</Text>}
            />
            {trackingNo ? (
              <ListRow
                divider
                leading={
                  <IconTile tint={colors.infoBg}>
                    <TruckIcon size={18} color={colors.info} />
                  </IconTile>
                }
                title="Kargo takip numarası"
                subtitle={trackingNo}
                onPress={shareTracking}
                accessibilityLabel={`Kargo takip numarası ${trackingNo}, kopyalamak için dokunun`}
                trailing={
                  <View style={[styles.copyPill, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[type.caption, { color: colors.primary, fontWeight: "600" }]}>Kopyala</Text>
                  </View>
                }
              />
            ) : null}
          </Card>
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(210).duration(380)}>
          <SectionTitle
            title="Sipariş içeriği"
            action={
              <View style={[styles.countPill, { backgroundColor: colors.primarySoft }]}>
                <Text style={[type.caption, tabular, { color: colors.primary, fontWeight: "600" }]}>{items.length} ürün</Text>
              </View>
            }
          />
          <Card style={styles.block}>
            {items.length === 0 ? (
              <View style={styles.emptyRow}>
                <IconTile tint={colors.surfaceMuted}>
                  <PackageIcon size={18} color={colors.textTertiary} />
                </IconTile>
                <Text style={[type.footnote, styles.flexText, { color: colors.textSecondary }]}>Bu siparişte ürün detayı yok.</Text>
              </View>
            ) : (
              items.map((it, idx) => {
                const img0 = it?.images?.[0];
                const img0Url = typeof img0 === "object" ? (img0?.url ?? img0?.src ?? "") : (img0 ?? "");
                const img = String(
                  it?.image_url || it?.imageUrl || it?.pictureUrl || it?.picture_url ||
                  it?.image || it?.picture || it?.img || it?.thumbnail ||
                  it?.src || it?.url || img0Url || ""
                ).trim();
                const valid = /^https?:\/\//i.test(img);
                const displayName = (
                  it?.product_name || it?.name || it?.sku || it?.barcode || it?.product_id || "Ürün"
                ).trim();
                const genericNames = ["ürün", "urun", "product", "bilinmeyen"];
                const isGenericName = genericNames.includes(displayName.toLowerCase());
                const unitPrice = Number(it?.unit_price || it?.price || (it?.total_price && it?.quantity ? Number(it.total_price) / Math.max(1, Number(it.quantity)) : 0) || 0);
                return (
                  <View
                    key={`${it.sku || it.product_name || idx}-${idx}`}
                    style={[styles.itemRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={[styles.itemImg, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                      {valid ? (
                        <ExpoImage source={{ uri: img }} style={styles.itemImgFill} contentFit="cover" transition={200} />
                      ) : (
                        <PackageIcon size={22} color={colors.textTertiary} />
                      )}
                    </View>
                    <View style={styles.flexText}>
                      <Text style={[type.bodyStrong, { color: isGenericName ? colors.textSecondary : colors.textPrimary }]} numberOfLines={2}>
                        {displayName}
                      </Text>
                      <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                        {it.sku || it.barcode ? `SKU: ${it.sku || it.barcode}` : "SKU: -"}
                      </Text>
                      <Text style={[type.footnote, tabular, { color: colors.textSecondary, marginTop: 2 }]}>
                        Birim: {formatTry(unitPrice)}
                      </Text>
                    </View>
                    <View style={[styles.qtyBadge, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[type.callout, tabular, { color: colors.primary, fontWeight: "700" }]}>x{it.quantity || 1}</Text>
                    </View>
                  </View>
                );
              })
            )}
            <View style={[styles.totalRow, { backgroundColor: colors.surfaceMuted, borderTopColor: colors.border }]}>
              <View style={styles.flexText}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Genel toplam</Text>
                <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 1 }]}>{totalQty} adet</Text>
              </View>
              <Text
                style={[type.title, tabular, styles.totalValue, { color: colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {totalText}
              </Text>
            </View>
          </Card>
        </SafeAnimatedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  flexText: { flex: 1, minWidth: 0 },
  heroLogo: { padding: 2, borderRadius: radius.md + 2, backgroundColor: ON_HERO.text },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: ON_HERO.faint,
  },
  heroStatusLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  heroStatusBadge: { flexShrink: 1, minWidth: 0 },
  primaryBtn: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  flexBtn: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  printStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  copyPill: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
  countPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  itemImg: { width: 56, height: 56, borderRadius: radius.md, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  itemImgFill: { width: "100%", height: "100%" },
  qtyBadge: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.lg - 1,
    borderBottomRightRadius: radius.lg - 1,
  },
  totalValue: { flexShrink: 1, textAlign: "right", maxWidth: "62%" },
  skHero: { marginHorizontal: spacing.lg, marginTop: spacing.xs, padding: spacing.lg, borderRadius: radius.xxl, borderWidth: 1 },
  skRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skLogo: { width: 44, height: 44, borderRadius: radius.md },
  skBtn: { height: 50, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  skCard: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1 },
});
