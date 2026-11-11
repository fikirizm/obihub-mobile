import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import {
  createHepsiJetShipment,
  enqueueOrderCloudPrint,
  getHepsiJetLabelWithProducts,
  getHepsiburadaOrderLabel,
  getOrderDetail,
  getShippingLabel,
  getTrendyolOrderLabel,
} from "../../src/api";
import {
  displayOrderNo,
  displayOrderStatus,
  formatOrderDateTime,
  formatTry,
  getOrderTrackingNo,
  providerKey,
  providerLabel,
  relativeDateLabel,
  statusKindFromOrder,
} from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { CloudIcon, PackageIcon, PrinterIcon, TruckIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { saveCache, loadCache } from "../../src/offlineCache";
import type { Order } from "../../src/types";

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

  // Etiket PDF'ini cihaza yazar; dosya yolunu döndürür. Etiket yoksa nedenini açıklayan hata fırlatır.
  const fetchLabelFile = async (): Promise<string> => {
    if (!token || !order) throw new Error("Oturum bulunamadı.");
    const path = `${FileSystem.cacheDirectory}order-${order.id}.pdf`;
    const writeBase64 = async (data: string) => {
      await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
      return path;
    };
    const k = providerKey(provider);
    if (k === "trendyol") {
      const r = await getTrendyolOrderLabel(token, order.id);
      const data = r?.data || r?.label_data || "";
      if (data) return writeBase64(data);
      throw new Error("Trendyol bu sipariş için etiket döndürmedi.");
    }
    if (k === "hepsiburada") {
      const r = await getHepsiburadaOrderLabel(token, order.id);
      const data = r?.data || r?.data_base64 || "";
      if (data) return writeBase64(data);
      // Hepsiburada bazı paketlerde dosya yerine indirme bağlantısı verir.
      if (r?.url && /^https:\/\//i.test(r.url)) {
        const dl = await FileSystem.downloadAsync(r.url, path);
        if (dl.status >= 200 && dl.status < 300) return path;
      }
      throw new Error("Hepsiburada bu sipariş için etiket döndürmedi.");
    }
    // Diğer kanallar (WooCommerce, n11 vb.): etiket, sipariş için oluşturulmuş kargo gönderisinden gelir.
    const info = await getShippingLabel(token, order.id);
    const barcode = String(info?.barcode || info?.cargo_barcodes?.[0]?.barcode || "").trim();
    const cargoProvider = String(info?.cargo_provider || "").trim().toLowerCase();
    if (!barcode && cargoProvider !== "yurtici") {
      throw new Error("Bu sipariş için henüz kargo gönderisi oluşturulmamış. Önce web panelden gönderi oluşturun.");
    }
    const r = await getHepsiJetLabelWithProducts(token, order.id, barcode || undefined);
    const data = r?.data || r?.data_base64 || "";
    if (data) return writeBase64(data);
    throw new Error(r?.message || "Kargo firması bu gönderi için etiket döndürmedi.");
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
      try {
        await Print.printAsync({ uri: path });
      } catch {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: "application/pdf" });
        }
      }
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
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
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

  const shareTracking = async () => {
    try {
      await Share.share({ message: trackingNo });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackHeader
        title={`#${displayOrderNo(order)}`}
        subtitle={isOffline ? "Çevrimdışı · önbellekten gösteriliyor" : "Sipariş"}
        right={<PlatformLogo provider={provider} size="sm" />}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
          />
        }
      >
        <Card style={styles.block}>
          <View style={styles.summaryHead}>
            <View style={styles.headRow}>
              <View style={styles.flexText}>
                <Text style={[type.caption, { color: colors.textTertiary }]}>Müşteri</Text>
                <Text style={[type.headline, { color: colors.textPrimary, marginTop: 2 }]} numberOfLines={2}>
                  {order.customer_name || "-"}
                </Text>
              </View>
              <StatusBadge label={displayOrderStatus(order, provider)} kind={kind} />
            </View>
            <Text style={[type.footnote, { color: colors.textSecondary, marginTop: spacing.xs }]} numberOfLines={1}>
              {relativeDateLabel(order)} · {providerLabel(provider)}
            </Text>
            <Text style={[type.footnote, tabular, { color: colors.textTertiary, marginTop: 2 }]}>
              Sipariş tarihi: {formatOrderDateTime(order)}
            </Text>
          </View>
          <ListRow divider title="Adet" trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{totalQty}</Text>} />
          <ListRow divider title="Toplam" trailing={<Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{totalText}</Text>} />
          {trackingNo ? (
            <ListRow
              divider
              title="Kargo takip numarası"
              subtitle={trackingNo}
              onPress={shareTracking}
              accessibilityLabel={`Kargo takip numarası ${trackingNo}, kopyalamak için dokunun`}
              trailing={<Text style={[type.callout, { color: colors.primary }]}>Kopyala</Text>}
            />
          ) : null}
        </Card>

        <View style={styles.actions}>
          <Button
            testID="print-btn"
            label="Yazdır"
            icon={<PrinterIcon size={18} color="#FFFFFF" />}
            busy={printBusy}
            onPress={handlePrint}
            style={styles.flexBtn}
          />
          <Button
            testID="cloud-btn"
            label="Bulut yazıcı"
            variant="secondary"
            icon={<CloudIcon size={18} color={colors.textPrimary} />}
            busy={cloudBusy}
            onPress={handleCloud}
            style={styles.flexBtn}
          />
        </View>

        {canCreateShipment ? (
          <Button
            testID="create-shipment-btn"
            label="Kargo gönderisi oluştur"
            variant="secondary"
            icon={<TruckIcon size={18} color={colors.textPrimary} />}
            busy={shipBusy}
            onPress={handleCreateShipment}
            style={styles.fullBtn}
          />
        ) : null}
        {order.cargo_error_message && String(order.cargo_status || "") === "error" ? (
          <Text style={[type.footnote, styles.note, { color: colors.error }]}>Son kargo denemesi: {order.cargo_error_message}</Text>
        ) : null}

        {printStatus ? (
          <View
            accessibilityLiveRegion="polite"
            style={[styles.printStatusRow, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>{printStatus}</Text>
          </View>
        ) : null}

        <SectionTitle
          title="Sipariş içeriği"
          action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{items.length} ürün</Text>}
        />
        <Card style={styles.block}>
          {items.length === 0 ? (
            <Text style={[type.footnote, styles.empty, { color: colors.textTertiary }]}>Bu siparişte ürün detayı yok.</Text>
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
                      <PackageIcon size={20} color={colors.textTertiary} />
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
          <ListRow divider title="Genel toplam" trailing={<Text style={[type.headline, tabular, { color: colors.textPrimary }]}>{totalText}</Text>} />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  summaryHead: { padding: spacing.md },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  flexText: { flex: 1, minWidth: 0 },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  flexBtn: { flex: 1 },
  fullBtn: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
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
  empty: { padding: spacing.md },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  itemImg: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  itemImgFill: { width: "100%", height: "100%" },
  qtyBadge: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
});
