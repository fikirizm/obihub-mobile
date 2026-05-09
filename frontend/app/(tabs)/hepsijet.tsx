import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { AppTopBar } from "../../src/components/AppTopBar";
import { fontWeight, radius, spacing } from "../../src/theme/tokens";
import {
  createHepsiJetManualCustomer,
  createHepsiJetManualShipment,
  getHepsiJetManualShipmentLabel,
  listHepsiJetManualCustomers,
  listHepsiJetManualShipments,
} from "../../src/api";
import { PressableScale } from "../../src/components/KPICard";
import { CheckIcon, DownloadIcon, PackageIcon, PlusIcon, TruckIcon } from "../../src/components/Icons";
import type { HepsiJetManualCustomer, HepsiJetManualShipment } from "../../src/types";

export default function HepsiJetScreen() {
  const { token } = useAuth();
  const { colors, mode, shadows } = useTheme();
  const [customers, setCustomers] = useState<HepsiJetManualCustomer[]>([]);
  const [shipments, setShipments] = useState<HepsiJetManualShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [labelBusyId, setLabelBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    city: "",
    town: "",
    district: "",
    address_line: "",
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [parcels, setParcels] = useState("1");
  const [desi, setDesi] = useState("1");

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const [cs, sh] = await Promise.all([
        listHepsiJetManualCustomers(token, { page: 1, perPage: 100 }),
        listHepsiJetManualShipments(token, { page: 1, perPage: 50 }),
      ]);
      setCustomers(cs);
      setShipments(sh);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const submitCustomer = async () => {
    if (!token) return;
    if (!form.full_name.trim() || !form.phone.trim()) {
      Alert.alert("Eksik bilgi", "Ad Soyad ve Telefon zorunlu.");
      return;
    }
    setBusy(true);
    try {
      const created = await createHepsiJetManualCustomer(token, form);
      setCustomers((prev) => [created, ...prev]);
      setSelectedCustomerId(created.id);
      setForm({ full_name: "", phone: "", email: "", city: "", town: "", district: "", address_line: "" });
      Alert.alert("Hazır", "Müşteri kaydedildi.");
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Müşteri kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const submitShipment = async () => {
    if (!token) return;
    if (!selectedCustomerId) {
      Alert.alert("Müşteri seçilmedi", "Önce bir müşteri seç.");
      return;
    }
    setBusy(true);
    try {
      const sh = await createHepsiJetManualShipment(token, {
        customer_id: selectedCustomerId,
        total_parcels: Number(parcels) || 1,
        total_desi: Number(desi) || 1,
      });
      setShipments((prev) => [sh, ...prev]);
      Alert.alert("Etiket oluşturuldu", `Barkod: ${sh.barcode || sh.id}`);
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Etiket oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const openLabel = async (s: HepsiJetManualShipment) => {
    if (!token) return;
    setLabelBusyId(s.id);
    try {
      const resp = await getHepsiJetManualShipmentLabel(token, s.id);
      const data = resp?.data || resp?.data_base64 || "";
      if (!data) {
        Alert.alert("Etiket yok", resp?.message || "Etiket verisi alınamadı.");
        return;
      }
      const path = `${FileSystem.cacheDirectory}hepsijet-${s.id}.pdf`;
      await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
      try {
        await Print.printAsync({ uri: path });
      } catch {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: "application/pdf" });
        }
      }
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Etiket açılamadı.");
    } finally {
      setLabelBusyId(null);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="hepsijet-screen">
      <AppTopBar />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
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
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: 4 }}>
            <Text style={[styles.eyebrow, { color: colors.hepsijet }]}>HEPSİJET MANUEL</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Manuel Etiket</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Pazaryeri dışı gönderilerin için müşteri kaydı oluştur, barkodlu etiketini yazdır.
            </Text>
          </View>

          {/* Customer create */}
          <SafeAnimatedView
            entering={FadeInUp.duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.cardHeadIcon, { backgroundColor: colors.hepsijetSoft }]}>
                <PlusIcon size={16} color={colors.hepsijet} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Yeni Müşteri</Text>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Field label="Ad Soyad" value={form.full_name} onChange={(v) => setForm((p) => ({ ...p, full_name: v }))} required />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Field label="Telefon" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} required keyboardType="phone-pad" style={{ flex: 1 }} />
                <Field label="E-posta" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} keyboardType="email-address" style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Field label="İl" value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} style={{ flex: 1 }} />
                <Field label="İlçe" value={form.town} onChange={(v) => setForm((p) => ({ ...p, town: v }))} style={{ flex: 1 }} />
                <Field label="Mah." value={form.district} onChange={(v) => setForm((p) => ({ ...p, district: v }))} style={{ flex: 1 }} />
              </View>
              <Field label="Açık Adres" value={form.address_line} onChange={(v) => setForm((p) => ({ ...p, address_line: v }))} multiline />
              <PressableScale
                testID="hepsijet-customer-save"
                onPress={submitCustomer}
                disabled={busy}
                style={[styles.primaryBtn, { backgroundColor: colors.hepsijet }, shadows.primary]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Müşteri Kaydet</Text>}
              </PressableScale>
            </View>
          </SafeAnimatedView>

          {/* Shipment create */}
          <SafeAnimatedView
            entering={FadeInUp.delay(60).duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.cardHeadIcon, { backgroundColor: colors.primarySoft }]}>
                <TruckIcon size={16} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Etiket Oluştur</Text>
            </View>

            <Text style={[styles.helper, { color: colors.textTertiary }]}>Müşteri seç</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
              {customers.length === 0 ? (
                <Text style={[styles.helper, { color: colors.textTertiary }]}>Önce müşteri ekle.</Text>
              ) : (
                customers.map((c) => {
                  const active = selectedCustomerId === c.id;
                  return (
                    <PressableScale
                      key={c.id}
                      testID={`hepsijet-customer-${c.id}`}
                      onPress={() => setSelectedCustomerId(c.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? colors.primary : colors.surfaceMuted,
                          borderColor: active ? colors.primary : colors.borderSubtle,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#FFF" : colors.textPrimary }}>
                        {c.full_name || c.phone || c.id}
                      </Text>
                    </PressableScale>
                  );
                })
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
              <Field label="Paket Adedi" value={parcels} onChange={setParcels} keyboardType="number-pad" style={{ flex: 1 }} />
              <Field label="Desi" value={desi} onChange={setDesi} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>

            <PressableScale
              testID="hepsijet-shipment-create"
              onPress={submitShipment}
              disabled={busy || !selectedCustomerId}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, shadows.primary, { marginTop: spacing.xs }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Etiket Oluştur</Text>}
            </PressableScale>
          </SafeAnimatedView>

          {/* Recent shipments */}
          <SafeAnimatedView
            entering={FadeInDown.delay(120).duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.cardHeadIcon, { backgroundColor: colors.successBg }]}>
                <PackageIcon size={16} color={colors.success} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Son Gönderiler</Text>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : shipments.length === 0 ? (
              <Text style={[styles.helper, { color: colors.textTertiary }]}>Kayıtlı etiket yok.</Text>
            ) : (
              shipments.slice(0, 20).map((s, idx) => (
                <SafeAnimatedView key={s.id} entering={FadeInDown.delay(idx * 30).springify().damping(18)}>
                  <View style={[styles.shipmentRow, { borderColor: colors.borderSubtle }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.shipmentBarcode, { color: colors.textPrimary }]} numberOfLines={1}>
                        #{s.barcode || s.id}
                      </Text>
                      <Text style={[styles.shipmentMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                        {s.customer?.full_name || "Müşteri"} · {s.total_parcels || 1} paket · {s.total_desi || 1} desi
                      </Text>
                    </View>
                    <PressableScale
                      testID={`hepsijet-print-${s.id}`}
                      onPress={() => openLabel(s)}
                      disabled={labelBusyId === s.id}
                      style={[styles.miniBtn, { backgroundColor: colors.primarySoft }]}
                    >
                      {labelBusyId === s.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <DownloadIcon size={14} color={colors.primary} />
                          <Text style={[styles.miniBtnText, { color: colors.primary }]}>Yazdır</Text>
                        </>
                      )}
                    </PressableScale>
                  </View>
                </SafeAnimatedView>
              ))
            )}
          </SafeAnimatedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  keyboardType,
  multiline,
  style,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  keyboardType?: any;
  multiline?: boolean;
  style?: any;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=""
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceMuted,
            color: colors.textPrimary,
            borderColor: focused ? colors.primary : colors.borderSubtle,
            minHeight: multiline ? 64 : 44,
            textAlignVertical: multiline ? "top" : "center",
            paddingTop: multiline ? 10 : 0,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: fontWeight.bold, letterSpacing: -0.6, marginTop: 2 },
  sub: { fontSize: 13, fontWeight: fontWeight.medium, marginTop: 4, marginBottom: spacing.sm },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.xs },
  cardHeadIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    fontWeight: "500",
    borderWidth: 1.5,
  },
  primaryBtn: {
    height: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  helper: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 1 },
  shipmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  shipmentBarcode: { fontSize: 14, fontWeight: "800" },
  shipmentMeta: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  miniBtnText: { fontSize: 12.5, fontWeight: "700" },
});
