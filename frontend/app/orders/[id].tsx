import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import {
  createHepsiJetShipment,
  enqueueOrderCloudPrint,
  getHepsiJetLabel,
  getHepsiJetLabelWithProducts,
  getHepsiburadaOrderLabel,
  getOrderDetail,
  getShippingLabel,
  getTrendyolOrderLabel,
} from "../../src/api";
import {
  displayOrderNo,
  displayOrderStatus,
  formatTry,
  providerKey,
  providerLabel,
  relativeDateLabel,
  statusKindFromOrder,
} from "../../src/utils";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import { ArrowLeftIcon, CloudIcon, PackageIcon, PrinterIcon } from "../../src/components/Icons";
import type { Order } from "../../src/types";

export default function OrderDetail() {
  const params = useLocalSearchParams<{ id: string; provider?: string }>();
  const orderId = String(params.id || "");
  const providerHint = String(params.provider || "");
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [printBusy, setPrintBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token || !orderId) return;
      setLoading(true);
      try {
        const o = await getOrderDetail(token, orderId);
        setOrder(o);
      } catch {}
      finally {
        setLoading(false);
      }
    })();
  }, [token, orderId]);

  const provider = providerHint || (order ? String((order as any).integration_provider || (order as any).provider || order.channel || "") : "");

  const fetchLabelData = async (): Promise<string> => {
    if (!token || !order) return "";
    const k = providerKey(provider);
    if (k === "trendyol") {
      const r = await getTrendyolOrderLabel(token, order.id);
      return r?.data || (r as any)?.label_data || "";
    }
    if (k === "hepsiburada") {
      const r = await getHepsiburadaOrderLabel(token, order.id);
      return r?.data || (r as any)?.data_base64 || "";
    }
    // default fallback
    const r = await getShippingLabel(token, order.id);
    return r?.data || "";
  };

  const handlePrint = async () => {
    if (!token || !order) return;
    setPrintBusy(true);
    try {
      const data = await fetchLabelData();
      if (!data) {
        Alert.alert("Etiket bulunamadı", "Bu sipariş için etiket verisi alınamadı.");
        return;
      }
      const path = `${FileSystem.cacheDirectory}order-${order.id}.pdf`;
      await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
      try {
        await Print.printAsync({ uri: path });
      } catch {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: "application/pdf" });
        }
      }
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Yazdırma başarısız.");
    } finally {
      setPrintBusy(false);
    }
  };

  const handleCloud = async () => {
    if (!token || !order) return;
    setCloudBusy(true);
    try {
      const r = await enqueueOrderCloudPrint(token, order.id);
      Alert.alert("Bulut Yazıcı", r?.message || "Yazdırma kuyruğa eklendi.");
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Bulut yazdırma başarısız.");
    } finally {
      setCloudBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textPrimary }}>Sipariş bulunamadı.</Text>
      </View>
    );
  }

  const kind = statusKindFromOrder(order, provider);
  const items = (order.items || []) as any[];
  const subtotal = items.reduce((a, b) => a + Number(b.total_price ?? Number(b.unit_price || 0) * Number(b.quantity || 0)), 0);

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
          <Text style={[styles.headerLabel, { color: colors.textTertiary }]}>SİPARİŞ</Text>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            #{displayOrderNo(order)}
          </Text>
        </View>
        <PlatformLogo provider={provider} size="sm" />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Top summary */}
        <SafeAnimatedView
          entering={FadeIn.duration(400)}
          style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.md]}
        >
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customerLabel, { color: colors.textTertiary }]}>MÜŞTERİ</Text>
              <Text style={[styles.customerName, { color: colors.textPrimary }]} numberOfLines={1}>
                {order.customer_name || "-"}
              </Text>
              <Text style={[styles.dateText, { color: colors.textSecondary }]} numberOfLines={1}>
                {relativeDateLabel(order)} · {providerLabel(provider)}
              </Text>
            </View>
            <StatusBadge label={displayOrderStatus(order, provider)} kind={kind} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.summaryFoot}>
            <View style={styles.summaryFootCell}>
              <Text style={[styles.fcLabel, { color: colors.textTertiary }]}>Adet</Text>
              <Text style={[styles.fcValue, { color: colors.textPrimary }]}>{items.reduce((a, b) => a + Number(b.quantity || 0), 0)}</Text>
            </View>
            <View style={[styles.fcDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.summaryFootCell}>
              <Text style={[styles.fcLabel, { color: colors.textTertiary }]}>Toplam</Text>
              <Text style={[styles.fcValue, { color: colors.textPrimary }]}>{formatTry(order.total_amount || subtotal)}</Text>
            </View>
          </View>
        </SafeAnimatedView>

        {/* Action buttons */}
        <SafeAnimatedView entering={FadeInDown.delay(80).duration(400)} style={styles.actionRow}>
          <PressableScale
            testID="print-btn"
            onPress={handlePrint}
            disabled={printBusy}
            style={[styles.actionBtn, { backgroundColor: colors.primary }, shadows.primary]}
          >
            {printBusy ? <ActivityIndicator color="#FFF" /> : (
              <>
                <PrinterIcon size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Yazdır</Text>
              </>
            )}
          </PressableScale>
          <PressableScale
            testID="cloud-btn"
            onPress={handleCloud}
            disabled={cloudBusy}
            style={[styles.actionBtnSecondary, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            {cloudBusy ? <ActivityIndicator color={colors.primary} /> : (
              <>
                <CloudIcon size={18} color={colors.primary} />
                <Text style={[styles.actionBtnSecondaryText, { color: colors.primary }]}>Bulut Yaz.</Text>
              </>
            )}
          </PressableScale>
        </SafeAnimatedView>

        {/* Items */}
        <SafeAnimatedView
          entering={FadeInDown.delay(140).duration(400)}
          style={[styles.itemsCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Sipariş İçeriği</Text>
            <Text style={[styles.cardHint, { color: colors.textTertiary }]}>{items.length} ürün</Text>
          </View>

          {items.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>Bu siparişte ürün detayı yok.</Text>
          ) : (
            items.map((it, idx) => {
              const img = String(it?.image_url || it?.image || it?.images?.[0]?.url || it?.images?.[0] || "").trim();
              const valid = /^https?:\/\//i.test(img);
              return (
                <SafeAnimatedView key={`${it.sku || it.product_name || idx}-${idx}`} entering={FadeInDown.delay(idx * 40)}>
                  <View style={[styles.itemRow, idx > 0 && { borderTopWidth: 1, borderColor: colors.borderSubtle }]}>
                    <View style={[styles.itemImg, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                      {valid ? (
                        <Image source={{ uri: img }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      ) : (
                        <PackageIcon size={20} color={colors.textTertiary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={2}>
                        {it.product_name || "Ürün"}
                      </Text>
                      <Text style={[styles.itemSku, { color: colors.textTertiary }]} numberOfLines={1}>
                        SKU: {it.sku || "-"}
                      </Text>
                      <Text style={[styles.itemPrice, { color: colors.textSecondary }]}>
                        {formatTry(it.total_price ?? it.unit_price ?? 0)}
                      </Text>
                    </View>
                    <View style={[styles.qtyBadge, { backgroundColor: colors.primarySoft }]}>
                      <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>x{it.quantity || 1}</Text>
                    </View>
                  </View>
                </SafeAnimatedView>
              );
            })
          )}

          <View style={[styles.totalRow, { borderColor: colors.borderSubtle }]}>
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>Genel Toplam</Text>
            <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatTry(order.total_amount || subtotal)}</Text>
          </View>
        </SafeAnimatedView>
      </ScrollView>
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
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  customerLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  customerName: { fontSize: 18, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  dateText: { fontSize: 12.5, fontWeight: "600", marginTop: 4 },
  divider: { height: 1, marginVertical: spacing.sm },
  summaryFoot: { flexDirection: "row", alignItems: "center" },
  summaryFootCell: { flex: 1 },
  fcDivider: { width: 1, height: 28 },
  fcLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  fcValue: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  actionBtnSecondary: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
  },
  actionBtnSecondaryText: { fontSize: 14, fontWeight: "700" },
  itemsCard: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  cardHint: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  empty: { fontSize: 13, fontWeight: "500", paddingVertical: 16 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  itemImg: { width: 52, height: 52, borderRadius: 10, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 13.5, fontWeight: "700", letterSpacing: -0.1 },
  itemSku: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  itemPrice: { fontSize: 12.5, fontWeight: "600", marginTop: 4 },
  qtyBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999 },
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
