// HepsiJet manuel gönderi (13 Kas 2026 yeniden düzen, kullanıcı isteği):
//  • Menü'den açılır; alt sekmede değil. Yalnız HepsiJet entegrasyonu kurulu ve etkin firmada görünür (src/hepsijet-ui.ts).
//  • Ekran ikiye ayrıldı: üstte sabit "Etiket oluştur" bölümü, altta kendi içinde kayan ve aranan Alıcılar / Gönderiler listesi.
//  • Alıcı listesinden doğrudan silme yok: satıra dokunmak alıcıyı etikete seçer, ">" ayrıntıyı açar; düzeltme ve silme
//    (onaylı) ayrıntı ekranında (app/hepsijet/recipient.tsx).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  RefreshControl,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { printOrShare } from "../../src/pdf";
import { InlineEmpty } from "../../src/components/InlineEmpty";
import { RowsSkeleton } from "../../src/components/Skeleton";
import { createHepsiJetManualShipmentsBulk } from "../../src/api-hepsijet";
import { filterRecipients } from "../../src/hepsijet-ui";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import {
  createHepsiJetManualShipment,
  deleteHepsiJetManualShipment,
  enqueueHepsiJetManualShipmentCloudPrint,
  getHepsiJetManualShipmentLabel,
  listHepsiJetManualCustomers,
  listHepsiJetManualShipments,
  trackHepsiJetManualShipment,
} from "../../src/api";
import { PressableScale } from "../../src/components/KPICard";
import { ArrowRightIcon, CheckIcon, CloudIcon, PackageIcon, PlusIcon, PrinterIcon, RefreshIcon, TrashIcon, TruckIcon, UserIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, IconTile } from "../../src/ui/ListRow";
import { SearchField } from "../../src/ui/SearchField";
import type { HepsiJetManualCustomer, HepsiJetManualShipment } from "../../src/types";
import type { StatusKind } from "../../src/utils";

const initialsOf = (name: string) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR") || "?";

export default function HepsiJetScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const params = useLocalSearchParams<{ select?: string; t?: string }>();
  const [customers, setCustomers] = useState<HepsiJetManualCustomer[]>([]);
  const [shipments, setShipments] = useState<HepsiJetManualShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [labelBusyId, setLabelBusyId] = useState<string | null>(null);
  const [cloudBusyId, setCloudBusyId] = useState<string | null>(null);
  const [trackBusyId, setTrackBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [view, setView] = useState<"recipients" | "shipments">("recipients");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [parcels, setParcels] = useState("1");
  const [desi, setDesi] = useState("1");
  // E1: aynı alıcıya birden çok gönderi (web create_count → /shipments/bulk).
  const [count, setCount] = useState("1");

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      try {
        const [cs, sh] = await Promise.all([
          listHepsiJetManualCustomers(token, { page: 1, perPage: 100 }),
          listHepsiJetManualShipments(token, { page: 1, perPage: 50 }),
        ]);
        setCustomers(cs);
        setShipments(sh);
      } catch {
        // Yüklenemezse eldeki liste kalır.
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Ayrıntı ekranından dönüşte (düzeltme / silme / yeni alıcı) liste yenilenir; "etikete seç" ile gelindiyse alıcı seçilir.
  const focusedOnce = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) load(true);
      focusedOnce.current = true;
    }, [load])
  );
  useEffect(() => {
    if (params.select) {
      setSelectedCustomerId(String(params.select));
      setView("recipients");
    }
  }, [params.select, params.t]);

  useEffect(() => {
    if (!token || !shipments.length) return undefined;
    const timer = setInterval(async () => {
      const active = shipments
        .filter((shipment) => Boolean(shipment.barcode))
        .filter((shipment) => {
          const st = shipmentStage(shipment.status);
          return !["delivered", "cancelled"].includes(st) && !String(shipment.status || "").toLocaleLowerCase("tr-TR").includes("iade");
        })
        .slice(0, 8);
      if (!active.length) return;
      try {
        const results = await Promise.allSettled(active.map((shipment) => trackHepsiJetManualShipment(token, shipment.id)));
        const updates = results
          .filter((r): r is PromiseFulfilledResult<{ shipment?: HepsiJetManualShipment }> => r.status === "fulfilled")
          .map((r) => r.value?.shipment)
          .filter((x): x is HepsiJetManualShipment => Boolean(x?.id));
        if (updates.length) setShipments((prev) => prev.map((x) => updates.find((u) => u.id === x.id) || x));
      } catch {
        // Arka plan takibi sessizce yeniden denenir.
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [token, shipments]);

  const filteredCustomers = useMemo(() => filterRecipients(customers, search), [customers, search]);
  const filteredShipments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return shipments;
    return shipments.filter((x) =>
      [x.barcode, x.customer_name, x.customer?.full_name, x.customer_phone, x.customer_city].some((v) => v && String(v).toLocaleLowerCase("tr-TR").includes(q))
    );
  }, [shipments, search]);
  const selectedCustomer = useMemo(() => customers.find((c) => c.id === selectedCustomerId) || null, [customers, selectedCustomerId]);

  const submitShipment = async () => {
    if (!token) return;
    Keyboard.dismiss();
    if (!selectedCustomerId) {
      toast("Önce aşağıdaki listeden bir alıcı seçin.", "error");
      return;
    }
    const n = Math.trunc(Number(count) || 1);
    if (n < 1 || n > 50) {
      toast("Adet 1 ile 50 arasında olmalıdır.", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        customer_id: selectedCustomerId,
        total_parcels: Number(parcels) || 1,
        desi: Number(String(desi).replace(",", ".")) || 1,
      };
      if (n > 1) {
        // Web ile aynı: create_count > 1 → toplu uç; kısmi başarısızlık açıkça söylenir.
        const r = await createHepsiJetManualShipmentsBulk(token, payload, n);
        if (r.created.length) setShipments((prev) => [...r.created, ...prev.filter((x) => !r.created.some((c) => c.id === x.id))]);
        if (r.failed) toast(`${r.failed}/${r.total} etiket oluşturulamadı: ${r.firstError}`, "error");
        else toast(`${r.created.length} etiket oluşturuldu.`, "success");
      } else {
        const sh = await createHepsiJetManualShipment(token, payload);
        if (!sh?.id) throw new Error("Etiket oluşturma yanıtı eksik.");
        setShipments((prev) => [sh, ...prev]);
        toast(`Etiket oluşturuldu. Barkod: ${sh.barcode || sh.id}`, "success");
      }
      setView("shipments");
      setSearch("");
    } catch (e: any) {
      toast(e?.message || "Etiket oluşturulamadı.", "error");
    } finally {
      setBusy(false);
    }
  };

  const fetchLabelFile = async (x: HepsiJetManualShipment): Promise<string | null> => {
    if (!token) return null;
    const resp = await getHepsiJetManualShipmentLabel(token, x.id);
    const data = resp?.data || resp?.data_base64 || "";
    if (!data) {
      toast(resp?.message || "Etiket verisi alınamadı.", "error");
      return null;
    }
    const path = `${FileSystem.cacheDirectory}hepsijet-${x.id}.pdf`;
    await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
    return path;
  };

  const printLabel = async (x: HepsiJetManualShipment) => {
    setLabelBusyId(x.id);
    try {
      const path = await fetchLabelFile(x);
      if (path) await printOrShare(path);
    } catch (e: any) {
      toast(e?.message || "Etiket açılamadı.", "error");
    } finally {
      setLabelBusyId(null);
    }
  };

  const cloudPrintLabel = async (x: HepsiJetManualShipment) => {
    if (!token) return;
    setCloudBusyId(x.id);
    try {
      const res = await enqueueHepsiJetManualShipmentCloudPrint(token, x.id);
      if (!res?.success) throw new Error(res?.message || "Bulut yazdırma başlatılamadı.");
      toast("Bulut yazdırma isteği kuyruğa alındı", "success");
    } catch (e: any) {
      toast(e?.message || "Bulut yazdırma başlatılamadı.", "error");
    } finally {
      setCloudBusyId(null);
    }
  };

  const refreshShipmentStatus = async (shipmentId: string) => {
    if (!token) return;
    setTrackBusyId(shipmentId);
    try {
      const res = await trackHepsiJetManualShipment(token, shipmentId);
      const next = (res as { shipment?: HepsiJetManualShipment })?.shipment;
      if (next?.id) setShipments((prev) => prev.map((x) => (x.id === next.id ? { ...x, ...next } : x)));
      else await load(true);
    } catch (e: any) {
      toast(e?.message || "Durum güncellenemedi. Tekrar deneyin.", "error");
    } finally {
      setTrackBusyId(null);
    }
  };

  const deleteShipment = async (shipmentId: string) => {
    if (!token) return;
    const ok = await confirm({ title: "Etiket silinsin mi?", message: "Teslim edilmemiş etiket silinir.", confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    setDeleteBusyId(shipmentId);
    try {
      await deleteHepsiJetManualShipment(token, shipmentId);
      setShipments((prev) => prev.filter((x) => x.id !== shipmentId));
      toast("Etiket silindi", "success");
    } catch (e: any) {
      toast(e?.message || "Etiket silinemedi.", "error");
    } finally {
      setDeleteBusyId(null);
    }
  };

  const openRecipient = (id?: string) => router.push({ pathname: "/hepsijet/recipient", params: id ? { id } : {} });

  const renderRecipient = ({ item: c, index }: { item: HepsiJetManualCustomer; index: number }) => {
    const active = selectedCustomerId === c.id;
    const name = c.full_name || "(İsimsiz)";
    const meta = [c.phone, [c.district, c.town, c.city].filter(Boolean).join(" / ")].filter(Boolean).join(" · ") || "Detay yok";
    return (
      <View style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, active && { backgroundColor: colors.primarySoft }]}>
        <PressableScale
          testID={`hepsijet-customer-${c.id}`}
          onPress={() => setSelectedCustomerId(active ? "" : c.id)}
          accessibilityRole="radio"
          accessibilityLabel={`${name}, ${meta}, etikete seç`}
          accessibilityState={{ selected: active }}
          style={styles.rowMain}
        >
          <View style={[styles.avatar, { backgroundColor: active ? colors.primary : colors.surfaceMuted, borderColor: active ? colors.primary : colors.border }]}>
            {active ? <CheckIcon size={18} color="#FFFFFF" /> : <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "700" }]}>{initialsOf(name)}</Text>}
          </View>
          <View style={styles.fill}>
            <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          testID={`hepsijet-customer-open-${c.id}`}
          onPress={() => openRecipient(c.id)}
          accessibilityRole="button"
          accessibilityLabel={`${name} ayrıntısı: düzelt ya da sil`}
          style={styles.iconBtn}
        >
          <ArrowRightIcon size={18} color={colors.textTertiary} />
        </PressableScale>
      </View>
    );
  };

  const renderShipment = ({ item: x, index }: { item: HepsiJetManualShipment; index: number }) => {
    const code = x.barcode || x.id;
    return (
      <View style={[styles.shipmentRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <View style={styles.shipmentHead}>
          <Text style={[type.bodyStrong, tabular, styles.fill, { color: colors.textPrimary }]} numberOfLines={1}>
            #{code}
          </Text>
          <StatusBadge label={shipmentStatusText(x.status)} kind={shipmentStatusKind(x.status)} />
        </View>
        <Text style={[type.footnote, tabular, { color: colors.textSecondary, marginTop: spacing.xxs }]} numberOfLines={2}>
          {x.customer_name || x.customer?.full_name || "Alıcı"} · {x.total_parcels || 1} paket · {x.total_desi || x.desi || 1} desi
        </Text>
        <View style={styles.shipmentActions}>
          <IconAction testID={`hepsijet-track-${x.id}`} label={`${code} gönderi durumunu güncelle`} busy={trackBusyId === x.id} onPress={() => refreshShipmentStatus(x.id)} tone="neutral" renderIcon={(c) => <RefreshIcon size={18} color={c} strokeWidth={2.2} />} />
          <IconAction testID={`hepsijet-print-${x.id}`} label={`${code} etiketini yazdır`} busy={labelBusyId === x.id} onPress={() => printLabel(x)} tone="primary" renderIcon={(c) => <PrinterIcon size={18} color={c} strokeWidth={2.2} />} />
          <IconAction testID={`hepsijet-cloud-${x.id}`} label={`${code} etiketini bulut yazdırmaya gönder`} busy={cloudBusyId === x.id} onPress={() => cloudPrintLabel(x)} tone="primary" renderIcon={(c) => <CloudIcon size={18} color={c} strokeWidth={2.2} />} />
          <IconAction testID={`hepsijet-delete-${x.id}`} label={`${code} etiketini sil`} busy={deleteBusyId === x.id} onPress={() => deleteShipment(x.id)} tone="error" renderIcon={(c) => <TrashIcon size={18} color={c} />} />
        </View>
      </View>
    );
  };

  const recipientsView = view === "recipients";
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="hepsijet-screen">
      <StackHeader title="HepsiJet" subtitle="Manuel gönderi ve etiket" />
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Üst bölüm: etiket oluşturma (sabit; liste uzasa da aşağıda kalmaz). */}
        <Card padded style={[styles.block, styles.form]}>
          <View style={styles.summary}>
            <IconTile tint={selectedCustomer ? colors.primarySoft : colors.surfaceMuted}>
              <TruckIcon size={18} color={selectedCustomer ? colors.primary : colors.textTertiary} />
            </IconTile>
            <View style={styles.fill}>
              <Text testID="hepsijet-selected" style={[type.bodyStrong, { color: selectedCustomer ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
                {selectedCustomer ? selectedCustomer.full_name : "Alıcı seçilmedi"}
              </Text>
              <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
                {selectedCustomer
                  ? [selectedCustomer.phone, selectedCustomer.town, selectedCustomer.city].filter(Boolean).join(" · ")
                  : "Aşağıdaki listeden alıcıya dokunun."}
              </Text>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <Field label="Paket" value={parcels} onChange={setParcels} keyboardType="number-pad" numeric style={styles.fieldFlex} />
            <Field label="Desi" value={desi} onChange={setDesi} keyboardType="decimal-pad" numeric style={styles.fieldFlex} />
            <Field label="Adet" value={count} onChange={setCount} keyboardType="number-pad" numeric style={styles.fieldFlex} />
          </View>
          <Button testID="hepsijet-shipment-create" label="Etiket oluştur" icon={<PrinterIcon size={18} color="#FFFFFF" />} busy={busy} disabled={!selectedCustomer} onPress={submitShipment} />
        </Card>

        {/* Alt bölüm: kendi içinde kayan, aranan liste. */}
        <View style={styles.switchRow}>
          <ChipRow>
            <Chip testID="hepsijet-view-recipients" label="Alıcılar" count={customers.length} selected={recipientsView} onPress={() => { setView("recipients"); setSearch(""); }} />
            <Chip testID="hepsijet-view-shipments" label="Gönderiler" count={shipments.length} selected={!recipientsView} onPress={() => { setView("shipments"); setSearch(""); }} />
          </ChipRow>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.fill}>
            <SearchField
              testID="hepsijet-search"
              value={search}
              onChangeText={setSearch}
              placeholder={recipientsView ? "İsim, telefon veya şehir" : "Barkod ya da alıcı"}
            />
          </View>
          {recipientsView ? (
            <PressableScale testID="hepsijet-new-recipient" onPress={() => openRecipient()} accessibilityRole="button" accessibilityLabel="Yeni alıcı" style={[styles.addBtn, { backgroundColor: colors.primary }]}>
              <PlusIcon size={20} color="#FFFFFF" />
            </PressableScale>
          ) : null}
        </View>
        <Card style={[styles.block, styles.listCard]}>
          {loading ? (
            <RowsSkeleton rows={4} label="Liste yükleniyor" />
          ) : (
            <FlatList
              data={(recipientsView ? filteredCustomers : filteredShipments) as any[]}
              keyExtractor={(x) => x.id}
              renderItem={(recipientsView ? renderRecipient : renderShipment) as any}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
              ListEmptyComponent={
                recipientsView ? (
                  <InlineEmpty
                    icon={<UserIcon size={22} color={colors.primary} />}
                    title={customers.length === 0 ? "Henüz alıcı yok" : "Sonuç bulunamadı"}
                    description={customers.length === 0 ? "Alıcıyı bir kez kaydedin; sonraki etiketlerde tek dokunuşla seçin." : "Farklı bir isim, telefon ya da şehirle arayın."}
                    actionLabel={customers.length === 0 ? "Alıcı ekle" : undefined}
                    onAction={customers.length === 0 ? () => openRecipient() : undefined}
                  />
                ) : (
                  <InlineEmpty
                    icon={<PackageIcon size={22} color={colors.primary} />}
                    title={shipments.length === 0 ? "Henüz etiket yok" : "Sonuç bulunamadı"}
                    description={shipments.length === 0 ? "Bir alıcı seçip Etiket oluştur'a dokunduğunuzda gönderiler burada listelenir." : "Farklı bir barkod ya da alıcı adıyla arayın."}
                  />
                )
              }
            />
          )}
        </Card>
      </KeyboardAvoidingView>
    </View>
  );
}

// Durum metni HepsiJet'ten ham gelir; Türkçe harfler sadeleştirilip karşılaştırılır.
function foldStatus(statusRaw?: string) {
  return String(statusRaw || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .trim();
}

type ShipmentStage = "failed" | "delivered" | "courier" | "branch" | "transit" | "pickup" | "cancelled" | "unknown";

// Yalnızca "teslim edildi" teslim sayılır; "teslimat şubesinde", "teslim alınacak" ve
// "teslim edilemedi" ayrı durumlardır (web paneliyle aynı eşleştirme).
function shipmentStage(statusRaw?: string): ShipmentStage {
  const s = foldStatus(statusRaw);
  if (!s) return "unknown";
  if (s.includes("teslim edilemedi") || s.includes("undelivered") || s.includes("not delivered")) return "failed";
  if (s.includes("teslim edildi") || s.includes("delivered")) return "delivered";
  if (s.includes("kurye") || s.includes("out_for_delivery") || s.includes("dagitima")) return "courier";
  if (s.includes("sube") || s.includes("branch")) return "branch";
  if (s.includes("teslim alinacak") || s.includes("pickup") || s.includes("accept") || s.includes("created")) return "pickup";
  if (s.includes("cancel") || s.includes("iptal")) return "cancelled";
  if (s.includes("transit") || s.includes("kargo") || s.includes("ship") || s.includes("transfer") || s.includes("yolda") || s.includes("dagitim")) return "transit";
  return "unknown";
}

function shipmentStatusText(statusRaw?: string) {
  switch (shipmentStage(statusRaw)) {
    case "failed":
      return "Teslim edilemedi";
    case "delivered":
      return "Teslim edildi";
    case "courier":
      return "Kurye dağıtıma çıktı";
    case "branch":
      return "Teslimat şubesinde";
    case "transit":
      return "Dağıtım sürecinde";
    case "pickup":
      return "Teslim alınacak";
    case "cancelled":
      return "İptal";
    default:
      return String(statusRaw || "").trim() || "Bilinmiyor";
  }
}

// Rozet rengi, durum metniyle aynı eşleştirmeyi kullanır.
function shipmentStatusKind(statusRaw?: string): StatusKind {
  switch (shipmentStage(statusRaw)) {
    case "delivered":
      return "success";
    case "courier":
    case "branch":
    case "transit":
      return "info";
    case "pickup":
      return "warning";
    case "failed":
    case "cancelled":
      return "error";
    default:
      return "neutral";
  }
}

function IconAction({
  label,
  onPress,
  busy,
  tone,
  renderIcon,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  tone: "neutral" | "primary" | "error";
  renderIcon: (color: string) => React.ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const fg = tone === "primary" ? colors.primary : tone === "error" ? colors.error : colors.textSecondary;
  const bg = tone === "primary" ? colors.primarySoft : tone === "error" ? colors.errorBg : colors.surfaceMuted;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      style={[styles.iconBtn, { backgroundColor: bg }]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : renderIcon(fg)}
    </PressableScale>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  keyboardType,
  multiline,
  numeric,
  style,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  numeric?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      <Text style={[type.caption, { color: colors.textSecondary, marginBottom: spacing.xxs }]} numberOfLines={1}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={required ? `${label}, zorunlu` : label}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : undefined}
        multiline={multiline}
        style={[
          type.body,
          styles.input,
          numeric && tabular,
          {
            backgroundColor: colors.surfaceMuted,
            color: colors.textPrimary,
            borderColor: focused ? colors.primary : colors.border,
          },
          multiline && styles.inputMultiline,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  fill: { flex: 1, minWidth: 0 },
  block: { marginHorizontal: spacing.lg },
  form: { gap: spacing.sm },
  fieldRow: { flexDirection: "row", gap: spacing.sm },
  fieldFlex: { flex: 1, minWidth: 0 },
  input: { height: 44, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 0, lineHeight: undefined },
  inputMultiline: { height: undefined, minHeight: 80, paddingTop: spacing.sm, paddingBottom: spacing.sm, textAlignVertical: "top" },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  switchRow: { marginTop: spacing.md },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: spacing.lg, marginBottom: spacing.sm },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  listCard: { flex: 1, marginBottom: spacing.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingRight: spacing.xs },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingLeft: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  shipmentRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  shipmentHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  shipmentActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs, marginTop: spacing.sm },
});
