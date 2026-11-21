import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Clipboard, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { printOrShare } from "../../src/pdf";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { createHepsiJetShipment } from "../../src/api";
import {
  ORDER_STATUS_OPTIONS,
  STOCK_RESTORE_STATUSES,
  MARKETPLACE_LABEL_CHANNELS,
  channelKeyOf,
  createOrderInvoice,
  deleteHepsiJetBarcode,
  enqueueCloudPrint,
  needsTakeInProcessing,
  orderInvoiceState,
  shareOrderInvoiceToStore,
  takeOrderInProcessing,
  getOrderDetailFull,
  mergeOrderDetail,
  rememberOrderRow,
  rememberedOrderRow,
  updateOrderStatus,
  type OrderFull,
} from "../../src/api-siparis";
import { canManage, isOwner } from "../../src/auth/permissions";
import { request } from "../../src/api";
import { canConfirmTransfer, CONFIRM_TEXT, confirmPath, invoiceRows, isWebOrder, paymentMethodText, paymentStatusText, shipWarning, transferErrorText } from "../../src/web-order";
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
import { returnBadge } from "../../src/recurring";
import { PlatformLogo } from "../../src/components/PlatformLogo";
import {
  AlertIcon,
  ArrowRightIcon,
  BarcodeIcon,
  CheckIcon,
  ClockIcon,
  CloudIcon,
  CopyIcon,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  PrinterIcon,
  TruckIcon,
  UserIcon,
} from "../../src/components/Icons";
import { amountBreakdown, currentStatusOption, customerContact, itemImage, matchParty, primaryAction, trackingRows } from "../../src/order-detail-ui";
import { getPartiesCompat } from "../../src/api-gider";
import { partyRouteParams } from "../../src/cari-ui";
import type { PartyView } from "../../src/types";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Button } from "../../src/ui/Button";
import { PressableScale } from "../../src/components/KPICard";
import { useFeedback } from "../../src/ui/Feedback";
import { fetchOrderLabelFile, labelOptionsFor, orderDisplayCodes, orderHasPrintableLabel, type LabelTemplate } from "../../src/labels";
import { Chip } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { DetailHero, type HeroStat } from "../../src/ui/DetailHero";
import { ON_HERO } from "../../src/ui/HeroCard";
import { saveCache, loadCache } from "../../src/offlineCache";

// Yüklenirken içerikle aynı biçimde yer tutucular: özet kartı, işlem düğmeleri, ürün satırları.
function DetailSkeleton() {
  const { colors } = useTheme();
  const bar = { backgroundColor: colors.border, borderRadius: radius.xs };
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Sipariş yükleniyor">
      <View
        style={[
          styles.skHero,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
          },
        ]}
      >
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
      <View
        style={[
          styles.skBtn,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
          },
        ]}
      />
      <View style={[styles.skCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.itemRow,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.itemImg,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.borderSubtle,
                },
              ]}
            />
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
  const { token, user } = useAuth();
  const { colors } = useTheme();
  // Liste satırı varsa ilk çizim ondan yapılır; detay gelince birleştirilir.
  const [order, setOrder] = useState<OrderFull | null>(() => rememberedOrderRow(orderId) || null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [printBusy, setPrintBusy] = useState<LabelTemplate | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [shipBusy, setShipBusy] = useState(false);
  // Dalga 1: fatura, mağazaya iletme, işleme alma, barkod iptali.
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [takeBusy, setTakeBusy] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState<string | null>(null);
  // Müşteri kartı: siparişin carisi (ad / e-posta / telefonla bulunursa) ve özetten karta kaydırma.
  const [party, setParty] = useState<PartyView | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const customerY = useRef(0);
  const { toast, confirm } = useFeedback();
  // Faz A M2c: web havalesini onayla (yalnız firma sahibi). Tekrarında sunucu aynı sonucu döner; çift dokunuş tek istek.
  const [transferBusy, setTransferBusy] = useState(false);
  const transferOp = useRef(false);
  const confirmTransfer = async () => {
    if (!token || !order || transferOp.current) return;
    const ok = await confirm({ title: "Havale onaylansın mı?", message: `${CONFIRM_TEXT}\nTutar: ${formatTry((order as any).total_amount || 0)}`, confirmLabel: "Tahsilatı onayla" });
    if (!ok || transferOp.current) return;
    transferOp.current = true;
    setTransferBusy(true);
    try {
      await request<any>(confirmPath(String(order.id)), { method: "POST", body: "{}" }, token);
      toast("Havale onaylandı; sipariş hazırlanmaya alındı.", "success");
      load(true);
    } catch (e: any) {
      toast(transferErrorText(e), "error");
    } finally {
      transferOp.current = false;
      setTransferBusy(false);
    }
  };

  const load = async (silent = false) => {
    if (!token || !orderId) return;
    if (!silent) setLoading(true);
    const cacheKey = `order_detail_${orderId}`;
    if (!silent) {
      const cached = await loadCache<OrderFull>(cacheKey);
      if (cached) {
        setOrder((cur) => cur || cached);
        setIsOffline(true);
        setLoading(false);
      }
    }
    try {
      // Detay ucu (response_model=Order) wc_status, idefix_* gibi alanları atar; liste satırıyla birleştirilir.
      // Yenilemede satır da sunucudan yeniden alınır.
      const o = await getOrderDetailFull(token, orderId, silent);
      rememberOrderRow(o);
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

  // Siparişte cari kimliği yok: carilerde müşteri adıyla aranır, e-posta / telefon / tek tam ad eşleşmesi kullanılır.
  const customerName = String(order?.customer_name || "").trim();
  useEffect(() => {
    if (!token || customerName.length < 2) return;
    let live = true;
    getPartiesCompat(token, { search: customerName })
      .then((r) => live && setParty(matchParty(order || {}, (r.items || []) as any) as PartyView | null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token, customerName]);

  const copyText = (text: string, what: string) => {
    try {
      Clipboard.setString(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(`${what} kopyalandı`, "success");
    } catch {
      toast("Kopyalanamadı.", "error");
    }
  };

  const openLink = (url: string, failText: string) => {
    Linking.openURL(url).catch(() => toast(failText, "error"));
  };

  const provider = providerHint || (order ? String(order.integration_provider || order.provider || order.channel || "") : "");

  const channel = channelKeyOf(provider || order?.channel);
  // Web CargoLabelSidebar: ilk seçenek varsayılan şablon; Hepsiburada ve Idefix'te ikinci şablon aynı ekranda seçilir.
  const labelOptions = labelOptionsFor(provider || String(order?.channel || ""));

  const handlePrint = async (template: LabelTemplate) => {
    if (!token || !order || printBusy) return;
    setPrintBusy(template);
    try {
      setPrintStatus("Etiket alınıyor...");
      let file: { path: string; notice?: string };
      try {
        file = await fetchOrderLabelFile(token, order.id, provider, {
          template,
          order,
        });
      } catch (e: any) {
        toast(e?.message || "Bu sipariş için etiket alınamadı.", "error");
        setPrintStatus(null);
        return;
      }
      if (file.notice) toast(file.notice);
      setPrintStatus("Yazıcıya gönderiliyor...");
      await printOrShare(file.path);
      setPrintStatus(null);
    } catch (e: any) {
      toast(e?.message || "Yazdırma başarısız.", "error");
      setPrintStatus(null);
    } finally {
      setPrintBusy(null);
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
      } else if (r?.in_progress) {
        // Aynı sipariş için başka bir istek (web ya da ikinci dokunuş) gönderiyi zaten açıyor.
        toast(r.message || "Bu sipariş için kargo oluşturma sürüyor.", "info");
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

  // Web'de "Uzaktan yazdır" yalnız etiketi basılabilir siparişte görünür: pazaryerlerinde (n11/Idefix kargo koduyla)
  // barkodsuz, diğer kanallarda siparişe açılmış her barkod için ayrı iş.
  const cloudBarcodes: string[] | null = (() => {
    if (!order) return null;
    if (MARKETPLACE_LABEL_CHANNELS.includes(channel)) return orderHasPrintableLabel(order, provider) ? [""] : null;
    const codes = orderDisplayCodes(order, provider);
    return codes.length > 0 ? codes : null;
  })();

  const handleCloud = async () => {
    if (!token || !order || !cloudBarcodes) return;
    setCloudBusy(true);
    try {
      let ok = 0;
      for (const bc of cloudBarcodes) {
        // Sunucu otomatik yazdırma kapalıyken HTTP 200 + success:false döner.
        const r = await enqueueCloudPrint(token, order.id, bc || undefined);
        if (!r?.success) {
          const base = r?.message || "Uzaktan yazdırma kuyruğa eklenemedi.";
          // Önceki barkodlar kuyruğa eklenmiş olabilir; tekrar denemede çift basılmasın diye söylenir.
          toast(ok > 0 ? `${base} (${ok} etiket zaten kuyruğa eklendi; tekrar denemeden önce yazıcıyı kontrol edin.)` : base, "error");
          return;
        }
        ok += 1;
      }
      toast(ok > 1 ? `${ok} etiket uzaktan yazdırma kuyruğuna eklendi.` : "Uzaktan yazdırma kuyruğa eklendi.", "success");
    } catch (e: any) {
      toast(e?.message || "Uzaktan yazdırma başarısız.", "error");
      // (Döngü içinde kalan barkod sayısı bilinmez; kullanıcı yazıcıyı kontrol etmeli.)
    } finally {
      setCloudBusy(false);
    }
  };

  // Web sipariş detayı: Trendyol dışındaki kanallarda durum değiştirilebilir. Web ayrı izin istemez;
  // mobilde siparişe yazma izni (orders.manage) aranır.
  const canChangeStatus = Boolean(order) && channel !== "trendyol" && canManage(user, "orders");

  const handleStatusChange = async (next: string) => {
    if (!token || !order || statusBusy || order.status === next) return;
    const label = ORDER_STATUS_OPTIONS.find((o) => o.value === next)?.label || next;
    const restores = STOCK_RESTORE_STATUSES.includes(next);
    const ok = await confirm({
      title: `Durum "${label}" yapılsın mı?`,
      message: restores
        ? "Siparişin ObiHub'da düşülen stoğu geri eklenir."
        : channel === "woocommerce"
          ? "Yeni durum WooCommerce mağazasına da iletilir."
          : undefined,
      confirmLabel: "Durumu değiştir",
      destructive: restores,
    });
    if (!ok) return;
    setStatusBusy(next);
    try {
      const updated = await updateOrderStatus(token, order.id, next);
      const merged = {
        ...mergeOrderDetail(updated, order),
        status: updated?.status || next,
      };
      setOrder(merged);
      rememberOrderRow(merged);
      await saveCache(`order_detail_${order.id}`, merged);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast("Sipariş durumu güncellendi", "success");
    } catch (e: any) {
      if (e?.status === 409) {
        // Durum kaydedildi, yalnız stok iadesi yapılamadı: eski hale döndürülmez, sipariş yeniden çekilir.
        toast(e?.message || "Durum güncellendi ancak stok iadesi yapılamadı.", "error");
        await load(true);
      } else {
        // 502: WooCommerce'e iletilemedi, durum kaydedilmedi.
        toast(e?.message || "Durum güncellenemedi.", "error");
      }
    } finally {
      setStatusBusy(null);
    }
  };

  const canWriteOrder = canManage(user, "orders");

  // Web handleInvoice: faturası olan siparişte fatura açılır, yoksa kesilir.
  const handleCreateInvoice = async () => {
    if (!token || !order || invoiceBusy) return;
    const ok = await confirm({
      title: "Fatura kesilsin mi?",
      message: "Sipariş için muhasebe programınızda satış faturası oluşturulur.",
      confirmLabel: "Fatura kes",
    });
    if (!ok) return;
    setInvoiceBusy(true);
    try {
      const r = await createOrderInvoice(token, order.id);
      if (r?.success) {
        toast(r.message || "Fatura oluşturuldu.", "success");
      } else if (r?.in_progress) {
        // Aynı sipariş için başka bir istek (web ya da ikinci dokunuş) faturayı zaten kesiyor.
        toast(r.message || "Bu sipariş için fatura kesimi sürüyor.", "info");
      } else {
        toast(r?.message || "Fatura oluşturulamadı.", "error");
      }
      await load(true);
    } catch (e: any) {
      toast(e?.message || "Fatura oluşturulamadı.", "error");
      await load(true);
    } finally {
      setInvoiceBusy(false);
    }
  };

  // Web handleOpenInvoice: Paraşüt faturası uygulama içinde, diğerleri bağlantıyla açılır.
  const handleOpenInvoice = () => {
    if (!order) return;
    if (order.parasut_invoice_id) {
      router.push({
        pathname: "/invoices/[id]",
        params: { id: String(order.parasut_invoice_id) },
      });
      return;
    }
    if (order.parasut_invoice_url) {
      Linking.openURL(String(order.parasut_invoice_url)).catch(() => toast("Fatura bağlantısı açılamadı.", "error"));
    }
  };

  const handleShareInvoice = async () => {
    if (!token || !order || shareBusy) return;
    setShareBusy(true);
    try {
      const r = await shareOrderInvoiceToStore(token, order.id);
      if (r?.success) toast(r.message || "Fatura mağazaya iletildi.", "success");
      else toast(r?.message || "Fatura mağazaya iletilemedi.", "error");
      await load(true);
    } catch (e: any) {
      toast(e?.message || "Fatura mağazaya iletilemedi.", "error");
    } finally {
      setShareBusy(false);
    }
  };

  const handleTakeInProcessing = async () => {
    if (!token || !order || takeBusy) return;
    setTakeBusy(true);
    try {
      const r = await takeOrderInProcessing(token, order.id, channel);
      if (r?.success) {
        toast(r.message || "Sipariş işleme alındı.", "success");
        await load(true);
      } else {
        toast(r?.message || "Sipariş işleme alınamadı.", "error");
      }
    } catch (e: any) {
      toast(e?.message || "Sipariş işleme alınamadı.", "error");
    } finally {
      setTakeBusy(false);
    }
  };

  // Web CargoLabelSidebar handleDeleteBarcode: HepsiJet'te gönderi iptal edilir, barkod siparişten düşer.
  const handleDeleteBarcode = async (barcode: string) => {
    if (!token || !order || barcodeBusy) return;
    const ok = await confirm({
      title: "Barkod iptal edilsin mi?",
      message: `${barcode} numaralı HepsiJet gönderisi iptal edilir. Gerekirse sonra yeni gönderi oluşturabilirsiniz.`,
      confirmLabel: "Barkodu iptal et",
      destructive: true,
    });
    if (!ok) return;
    setBarcodeBusy(barcode);
    try {
      const r = await deleteHepsiJetBarcode(token, barcode);
      if (String(r?.status || "").toUpperCase() === "OK") toast(`${barcode} iptal edildi.`, "success");
      else toast(r?.message || "Barkod iptal edilemedi.", "error");
      await load(true);
    } catch (e: any) {
      toast(e?.message || "Barkod iptal edilemedi.", "error");
    } finally {
      setBarcodeBusy(null);
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
  const shortOrderDate = orderTs
    ? new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "short",
      }).format(new Date(orderTs))
    : "-";
  const cargoError = Boolean(order.cargo_error_message) && String(order.cargo_status || "") === "error";
  const inv = orderInvoiceState(order, channel);
  const closedOrder = ["cancelled", "deleted"].includes(String(order.status || "").toLowerCase());
  const takeNeeded = canWriteOrder && needsTakeInProcessing(order, channel);
  // HepsiJet barkodları yalnız kendi kargosu olmayan kanallarda açılır (pazaryeri etiketleri iptal edilemez).
  const hjBarcodes: string[] = ["trendyol", "hepsiburada", "idefix", "pazarama"].includes(channel)
    ? []
    : Array.from(new Set((order.cargo_barcodes || []).map((b) => String(b?.barcode || "").trim()).filter(Boolean)));

  const contact = customerContact(order, Platform.OS);
  const trackRows = trackingRows(trackingNo, hjBarcodes, canWriteOrder);
  const breakdown = amountBreakdown(order);
  const currentStatus = currentStatusOption(order.status, ORDER_STATUS_OPTIONS);
  // Ekranda tek birincil (mavi) eylem: işleme al > fatura kes > gönderi oluştur > yazdır.
  const primary = primaryAction({
    takeNeeded,
    canInvoice: canWriteOrder && inv.canCreate,
    canShip: canCreateShipment,
    canPrint: Boolean(cloudBarcodes) || Boolean(trackingNo),
    closed: closedOrder,
  });
  const shipLabel = channel === "n11" ? "Etiketi hazırla" : "Gönderi oluştur";
  const printOptions = primary === "print" ? labelOptions.slice(1) : labelOptions;
  const showShipInCard = canCreateShipment && primary !== "ship";
  const showLabelCard =
    trackRows.length > 0 || printOptions.length > 0 || Boolean(cloudBarcodes) || showShipInCard || Boolean(printStatus) || cargoError;
  const goCustomerCard = () =>
    scrollRef.current?.scrollTo({
      y: Math.max(0, customerY.current - spacing.md),
      animated: true,
    });

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
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: spacing.xs,
          paddingBottom: spacing.huge,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
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
          onHeadPress={goCustomerCard}
          headHint="Müşteri bilgileri"
          headTestID="hero-customer"
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
        {/* Dalga 5a: pazaryeri iade talebi — yalnız bilgi; stoğu geri alma web'deki öneriyle onaylanır, otomatik stok girişi yok. */}
        {returnBadge(order as any) ? (
          <View testID="order-return-request" style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.warningBg }}>
            <Text style={[type.footnote, { color: colors.textPrimary }]}>
              {[returnBadge(order as any)!.label, returnBadge(order as any)!.reason].filter(Boolean).join(" · ")}
            </Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>Sipariş durumu ve stok değişmez; iade gerçekleşince kanal durumuyla güncellenir.</Text>
          </View>
        ) : null}

        {isOffline ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.notice,
              {
                backgroundColor: colors.warningBg,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <CloudIcon size={16} color={colors.warning} />
            <Text style={[type.footnote, styles.flexText, { color: colors.textPrimary }]}>
              Çevrimdışısınız. Önbellekteki son bilgiler gösteriliyor.
            </Text>
          </View>
        ) : null}

        {takeNeeded ? (
          <SafeAnimatedView entering={FadeInDown.delay(50).duration(380)}>
            <View
              style={[
                styles.takeCard,
                {
                  backgroundColor: colors.amberSoft,
                  borderColor: colors.borderSubtle,
                },
              ]}
              testID="take-card"
            >
              <View style={styles.takeHead}>
                <ClockIcon size={18} color={colors.amber} />
                <View style={styles.flexText}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Sipariş onay bekliyor</Text>
                  <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    {providerLabel(provider)} siparişi işleme alınınca hazırlanmaya başlar ve etiketi oluşur.
                  </Text>
                </View>
              </View>
              <Button testID="take-btn" label="İşleme al" busy={takeBusy} onPress={handleTakeInProcessing} style={styles.takeBtn} />
            </View>
          </SafeAnimatedView>
        ) : null}

        {/* Faz A: havalesi onaylanmamış web siparişinde kargo/fatura eylemlerinin hemen üstünde uyarı. */}
        {shipWarning(order as any) ? (
          <View testID="web-order-warning" accessibilityRole="alert" style={[styles.block, { flexDirection: "row", gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningBg, marginTop: spacing.md, marginBottom: spacing.sm }]}>
            <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{shipWarning(order as any)}</Text>
          </View>
        ) : null}
        {primary && primary !== "take" ? (
          <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
            {primary === "invoice" ? (
              <Button
                testID="invoice-create-btn"
                label="Fatura kes"
                icon={<FileTextIcon size={18} color="#FFFFFF" />}
                busy={invoiceBusy}
                onPress={handleCreateInvoice}
                style={styles.primaryBtn}
              />
            ) : primary === "ship" ? (
              <Button
                testID="create-shipment-btn"
                label={shipLabel}
                icon={<TruckIcon size={18} color="#FFFFFF" />}
                busy={shipBusy}
                onPress={handleCreateShipment}
                style={styles.primaryBtn}
              />
            ) : (
              <Button
                testID="print-btn"
                label={labelOptions.length > 1 ? `Yazdır · ${labelOptions[0].label}` : "Etiketi yazdır"}
                icon={<PrinterIcon size={18} color="#FFFFFF" />}
                busy={printBusy === labelOptions[0].template}
                disabled={Boolean(printBusy)}
                onPress={() => handlePrint(labelOptions[0].template)}
                style={styles.primaryBtn}
              />
            )}
          </SafeAnimatedView>
        ) : null}

        {/* Konum ScrollView içeriğine göre ölçülür (özetteki müşteri alanından buraya kaydırılır). */}
        <View testID="customer-card" onLayout={(e) => (customerY.current = e.nativeEvent.layout.y)}>
          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
            <View>
              <SectionTitle title="Müşteri" />
              <Card style={styles.block}>
                <ListRow
                  testID="customer-name-row"
                  leading={
                    <IconTile tint={colors.primarySoft}>
                      <UserIcon size={18} color={colors.primary} />
                    </IconTile>
                  }
                  title={contact.name}
                  subtitle={party ? "Cari kaydı var" : contact.hasAny ? `${providerLabel(provider)} müşterisi` : "Kanal iletişim bilgisi göndermedi"}
                  onPress={
                    party
                      ? () =>
                          router.push({
                            pathname: "/customers/[id]",
                            params: partyRouteParams(party),
                          })
                      : undefined
                  }
                  accessibilityLabel={party ? `${contact.name}, cariye git` : undefined}
                  trailing={
                    party ? (
                      <View testID="customer-party-link" style={[styles.pill, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[type.caption, { color: colors.primary, fontWeight: "700" }]}>Cariye git</Text>
                        <ArrowRightIcon size={14} color={colors.primary} />
                      </View>
                    ) : undefined
                  }
                />
                {contact.phone ? (
                  <ListRow
                    divider
                    testID="customer-phone"
                    leading={
                      <IconTile tint={colors.successBg}>
                        <PhoneIcon size={18} color={colors.success} />
                      </IconTile>
                    }
                    title="Telefon"
                    subtitle={contact.phone.text}
                    onPress={() => openLink(contact.phone!.href, "Arama başlatılamadı.")}
                    accessibilityLabel={`Telefon ${contact.phone.text}, aramak için dokunun`}
                    trailing={
                      <View style={[styles.pill, { backgroundColor: colors.successBg }]}>
                        <Text style={[type.caption, { color: colors.success, fontWeight: "700" }]}>Ara</Text>
                      </View>
                    }
                  />
                ) : null}
                {contact.email ? (
                  <ListRow
                    divider
                    testID="customer-email"
                    leading={
                      <IconTile tint={colors.infoBg}>
                        <MailIcon size={18} color={colors.info} />
                      </IconTile>
                    }
                    title="E-posta"
                    subtitle={contact.email.text}
                    onPress={() => openLink(contact.email!.href, "E-posta uygulaması açılamadı.")}
                    accessibilityLabel={`E-posta ${contact.email.text}, yazmak için dokunun`}
                    trailing={
                      <View style={[styles.pill, { backgroundColor: colors.infoBg }]}>
                        <Text style={[type.caption, { color: colors.info, fontWeight: "700" }]}>Yaz</Text>
                      </View>
                    }
                  />
                ) : null}
                {contact.address ? (
                  <View testID="customer-address" style={[styles.addressRow, { borderTopColor: colors.border }]}>
                    <View style={styles.addressHead}>
                      <IconTile tint={colors.amberSoft}>
                        <MapPinIcon size={18} color={colors.amber} />
                      </IconTile>
                      <View style={styles.flexText}>
                        <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Teslimat adresi</Text>
                        <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 2 }]} selectable>
                          {contact.address.text}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.addressActions}>
                      <Button
                        testID="customer-address-copy"
                        size="sm"
                        variant="secondary"
                        label="Kopyala"
                        icon={<CopyIcon size={14} color={colors.textPrimary} />}
                        onPress={() => copyText(contact.address!.text, "Adres")}
                        style={styles.flexBtn}
                      />
                      <Button
                        testID="customer-address-map"
                        size="sm"
                        variant="secondary"
                        label="Haritada aç"
                        icon={<MapPinIcon size={14} color={colors.textPrimary} />}
                        onPress={() => openLink(contact.address!.mapsUrl, "Harita açılamadı.")}
                        style={styles.flexBtn}
                      />
                    </View>
                  </View>
                ) : null}
              {contact.billing ? (
                <ListRow
                  divider
                  testID="customer-billing"
                  leading={
                    <IconTile tint={colors.surfaceMuted}>
                      <FileTextIcon size={18} color={colors.textSecondary} />
                    </IconTile>
                  }
                  title="Fatura adresi"
                  subtitle={contact.billing}
                  onPress={() => copyText(contact.billing!, "Fatura adresi")}
                  accessibilityLabel={`Fatura adresi ${contact.billing}, kopyalamak için dokunun`}
                  trailing={
                    <View style={[styles.iconPill, { backgroundColor: colors.primarySoft }]}>
                      <CopyIcon size={14} color={colors.primary} />
                    </View>
                  }
                />
              ) : null}
              </Card>
            </View>
          </SafeAnimatedView>
        </View>

        {order && isWebOrder(order as any) ? (
          <SafeAnimatedView entering={FadeInDown.delay(75).duration(380)}>
            <SectionTitle title="Web Mağaza ödemesi" />
            <Card style={styles.block}>
              {(() => {
                const o: any = order;
                const rows: [string, string][] = [];
                if (o.payment_method) rows.push(["Ödeme yöntemi", paymentMethodText(o.payment_method)]);
                if (o.payment_status) rows.push(["Ödeme durumu", paymentStatusText(o.payment_status) || String(o.payment_status)]);
                if (o.shipping_fee != null) rows.push(["Kargo ücreti", formatTry(o.shipping_fee)]);
                const all = [...rows, ...invoiceRows(o.invoice_details)];
                return all.map(([k, v], i) => (
                  <ListRow
                    key={k}
                    divider={i > 0}
                    title={k}
                    subtitle={k === "Teslimat adresi" ? v : undefined}
                    trailing={k === "Teslimat adresi" ? undefined : <Text style={[type.callout, { color: k === "Ödeme durumu" && o.payment_status === "awaiting_transfer" ? colors.amber : colors.textPrimary, fontWeight: "600" }]}>{v}</Text>}
                  />
                ));
              })()}
            </Card>
            {canConfirmTransfer(order as any, isOwner(user)) ? (
              <View style={[styles.block, { marginTop: spacing.sm }]}>
                <Button testID="web-transfer-confirm" label="Havaleyi doğrula" busy={transferBusy} disabled={transferBusy} onPress={confirmTransfer} />
              </View>
            ) : null}
          </SafeAnimatedView>
        ) : null}

        {showLabelCard ? (
          <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)}>
            <SectionTitle title="Kargo ve etiket" />
            <Card style={styles.block}>
              {trackRows.map((r, idx) => (
                <ListRow
                  key={r.code}
                  divider={idx > 0}
                  testID={r.kind === "tracking" ? "tracking-row" : `barcode-${r.code}`}
                  leading={
                    <IconTile tint={r.kind === "hepsijet" ? colors.surfaceMuted : colors.infoBg}>
                      {r.kind === "hepsijet" ? <BarcodeIcon size={18} color={colors.textSecondary} /> : <TruckIcon size={18} color={colors.info} />}
                    </IconTile>
                  }
                  title={r.title}
                  subtitle={r.code}
                  onPress={() => copyText(r.code, r.kind === "hepsijet" ? "Barkod" : "Takip numarası")}
                  accessibilityLabel={`${r.title} ${r.code}, kopyalamak için dokunun`}
                  trailing={
                    <View style={styles.rowActions}>
                      <View style={[styles.iconPill, { backgroundColor: colors.primarySoft }]}>
                        <CopyIcon size={14} color={colors.primary} />
                      </View>
                      {r.cancellable ? (
                        <PressableScale
                          testID={`barcode-delete-${r.code}`}
                          onPress={barcodeBusy ? undefined : () => handleDeleteBarcode(r.code)}
                          accessibilityRole="button"
                          accessibilityLabel={`${r.code} gönderisini iptal et`}
                          hitSlop={6}
                          style={[styles.pill, { backgroundColor: colors.errorBg, opacity: barcodeBusy && barcodeBusy !== r.code ? 0.5 : 1 }]}
                        >
                          {barcodeBusy === r.code ? (
                            <ActivityIndicator size="small" color={colors.error} />
                          ) : (
                            <Text style={[type.caption, { color: colors.error, fontWeight: "700" }]}>İptal et</Text>
                          )}
                        </PressableScale>
                      ) : null}
                    </View>
                  }
                />
              ))}
              {printOptions.length > 0 || cloudBarcodes || showShipInCard ? (
                <View
                  style={[
                    styles.cardActions,
                    trackRows.length > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  {printOptions.map((opt, i) => (
                    <Button
                      key={opt.template}
                      testID={i === 0 && primary !== "print" ? "print-btn" : `print-${opt.template}-btn`}
                      size="sm"
                      variant="secondary"
                      label={labelOptions.length > 1 ? opt.label : "Yazdır"}
                      icon={<PrinterIcon size={14} color={colors.textPrimary} />}
                      busy={printBusy === opt.template}
                      disabled={Boolean(printBusy)}
                      onPress={() => handlePrint(opt.template)}
                      style={[styles.gridBtn, opt.label.length > 16 && labelOptions.length > 1 && styles.fullBtn]}
                    />
                  ))}
                  {cloudBarcodes ? (
                    <Button
                      testID="cloud-btn"
                      size="sm"
                      label="Uzaktan yazdır"
                      variant="secondary"
                      icon={<CloudIcon size={14} color={colors.textPrimary} />}
                      busy={cloudBusy}
                      onPress={handleCloud}
                      style={styles.gridBtn}
                    />
                  ) : null}
                  {showShipInCard ? (
                    <Button
                      testID="create-shipment-btn"
                      size="sm"
                      label={shipLabel}
                      variant="secondary"
                      icon={<TruckIcon size={14} color={colors.textPrimary} />}
                      busy={shipBusy}
                      onPress={handleCreateShipment}
                      style={styles.gridBtn}
                    />
                  ) : null}
                </View>
              ) : null}
              {printStatus ? (
                <View accessibilityLiveRegion="polite" style={[styles.cardNotice, { backgroundColor: colors.primarySoft }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{printStatus}</Text>
                </View>
              ) : null}
              {cargoError ? (
                <View accessibilityRole="alert" style={[styles.cardNotice, { backgroundColor: colors.errorBg }]}>
                  <AlertIcon size={16} color={colors.error} />
                  <Text style={[type.footnote, styles.flexText, { color: colors.error }]}>Son kargo denemesi: {order.cargo_error_message}</Text>
                </View>
              ) : null}
            </Card>
          </SafeAnimatedView>
        ) : null}

        <SafeAnimatedView entering={FadeInDown.delay(90).duration(380)}>
          <SectionTitle title="Fatura" />
          <Card style={styles.block}>
            <ListRow
              testID="invoice-row"
              leading={
                <IconTile tint={inv.invoiced ? colors.successBg : colors.warningBg}>
                  {inv.invoiced ? <CheckIcon size={18} color={colors.success} /> : <FileTextIcon size={18} color={colors.amber} />}
                </IconTile>
              }
              title={inv.invoiced ? "Faturalandı" : closedOrder ? "Fatura yok" : "Fatura kesilmedi"}
              subtitle={
                inv.invoiced
                  ? [order.invoice_number ? `No ${order.invoice_number}` : null, inv.sharedToTrendyol ? "Trendyol'a iletildi" : null]
                      .filter(Boolean)
                      .join(" · ") || "Muhasebe programında kayıtlı"
                  : closedOrder
                    ? "İptal ya da silinmiş siparişe fatura kesilmez."
                    : "Muhasebe programınızda satış faturası oluşturun."
              }
              onPress={inv.canOpen ? handleOpenInvoice : undefined}
              trailing={
                inv.canOpen ? (
                  <View style={[styles.copyPill, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[type.caption, { color: colors.primary, fontWeight: "600" }]}>Aç</Text>
                  </View>
                ) : undefined
              }
            />
          </Card>
          {canWriteOrder && ((inv.canCreate && primary !== "invoice") || inv.canShare) ? (
            <View style={styles.actions}>
              {inv.canCreate && primary !== "invoice" ? (
                <Button
                  testID="invoice-create-btn"
                  label="Fatura kes"
                  variant="secondary"
                  icon={<FileTextIcon size={16} color={colors.textPrimary} />}
                  busy={invoiceBusy}
                  onPress={handleCreateInvoice}
                  style={styles.flexBtn}
                />
              ) : null}
              {inv.canShare ? (
                <Button
                  testID="invoice-share-btn"
                  label={inv.sharedToTrendyol ? "Mağazaya yeniden ilet" : "Mağazaya ilet"}
                  variant="secondary"
                  busy={shareBusy}
                  onPress={handleShareInvoice}
                  style={styles.flexBtn}
                />
              ) : null}
            </View>
          ) : null}
          {/* Dalga 5a: siparişten irsaliye (kargo firması/takip no dolu gelir; sipariş stoğu zaten düştüğü için irsaliye stoğa dokunmaz). */}
          {canManage(user, "inventory") ? (
            <View style={styles.actions}>
              <Button
                testID="order-dispatch-btn"
                label="İrsaliye oluştur"
                variant="ghost"
                onPress={() => router.push({ pathname: "/dispatch/new", params: { orderId: String(order.id), title: String(order.channel_order_id || "") } } as any)}
                style={styles.flexBtn}
              />
            </View>
          ) : null}
        </SafeAnimatedView>

        {canChangeStatus ? (
          <SafeAnimatedView entering={FadeInDown.delay(105).duration(380)}>
            <SectionTitle title="Durumu değiştir" />
            <View style={styles.statusWrap} testID="status-chips">
              {ORDER_STATUS_OPTIONS.map((opt) => {
                const isCurrent = currentStatus === opt.value;
                return (
                  <Chip
                    key={opt.value}
                    testID={`status-${opt.value}`}
                    label={statusBusy === opt.value ? `${opt.label}…` : isCurrent ? `✓ ${opt.label}` : opt.label}
                    selected={isCurrent}
                    onPress={isCurrent ? undefined : () => handleStatusChange(opt.value)}
                  />
                );
              })}
            </View>
            <Text style={[type.caption, styles.statusHint, { color: colors.textTertiary }]}>
              {currentStatus ? "Yeni durumu seçin; onaydan sonra kaydedilir." : `Mevcut durum: ${displayOrderStatus(order, provider)}`}
            </Text>
          </SafeAnimatedView>
        ) : null}

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
                const img = itemImage(it);
                const displayName = (it?.product_name || it?.name || it?.sku || it?.barcode || it?.product_id || "Ürün").trim();
                const genericNames = ["ürün", "urun", "product", "bilinmeyen"];
                const isGenericName = genericNames.includes(displayName.toLowerCase());
                const unitPrice = Number(
                  it?.unit_price ||
                    it?.price ||
                    (it?.total_price && it?.quantity ? Number(it.total_price) / Math.max(1, Number(it.quantity)) : 0) ||
                    0,
                );
                return (
                  <View
                    key={`${it.sku || it.product_name || idx}-${idx}`}
                    style={[
                      styles.itemRow,
                      idx > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.itemImg,
                        {
                          backgroundColor: colors.surfaceMuted,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      {img ? (
                        <ExpoImage source={{ uri: img }} style={styles.itemImgFill} contentFit="cover" transition={200} />
                      ) : (
                        <PackageIcon size={22} color={colors.textTertiary} />
                      )}
                    </View>
                    <View style={styles.flexText}>
                      <Text
                        style={[
                          type.bodyStrong,
                          {
                            color: isGenericName ? colors.textSecondary : colors.textPrimary,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {displayName}
                      </Text>
                      <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                        {it.sku || it.barcode ? `SKU: ${it.sku || it.barcode}` : "SKU: -"}
                      </Text>
                      <Text style={[type.footnote, tabular, { color: colors.textSecondary, marginTop: 2 }]}>Birim: {formatTry(unitPrice)}</Text>
                    </View>
                    <View style={[styles.qtyBadge, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[type.callout, tabular, { color: colors.primary, fontWeight: "700" }]}>x{it.quantity || 1}</Text>
                    </View>
                  </View>
                );
              })
            )}
            {breakdown.rows.length > 0 ? (
              <View testID="amount-breakdown" style={[styles.breakdown, { borderTopColor: colors.border }]}>
                {breakdown.rows.map((r) => (
                  <View key={r.key} style={styles.breakdownRow}>
                    <Text style={[type.footnote, { color: colors.textSecondary }]}>{r.label}</Text>
                    <Text
                      style={[
                        type.callout,
                        tabular,
                        {
                          color: r.key === "discount" ? colors.success : colors.textPrimary,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {r.amount < 0 ? `−${formatTry(-r.amount)}` : formatTry(r.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View
              style={[
                styles.totalRow,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.flexText}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Genel toplam</Text>
                <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 1 }]}>{totalQty} adet</Text>
              </View>
              <Text style={[type.title, tabular, styles.totalValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
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
  takeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  takeHead: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  takeBtn: { alignSelf: "stretch" },
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  flexText: { flex: 1, minWidth: 0 },
  heroLogo: {
    padding: 2,
    borderRadius: radius.md + 2,
    backgroundColor: ON_HERO.text,
  },
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
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
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

  copyPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  addressRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  addressHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  addressActions: { flexDirection: "row", gap: spacing.sm },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
  },
  fullBtn: { flexBasis: "100%" },
  gridBtn: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  cardNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  statusWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  statusHint: { paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  breakdown: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  countPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemImg: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  itemImgFill: { width: "100%", height: "100%" },
  qtyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
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
  skHero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.xxl,
    borderWidth: 1,
  },
  skRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skLogo: { width: 44, height: 44, borderRadius: radius.md },
  skBtn: {
    height: 50,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  skCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
