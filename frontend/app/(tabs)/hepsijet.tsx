import React, { useEffect, useMemo, useState } from "react";
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
import { FadeInDown, FadeInUp } from "react-native-reanimated";
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
import {
  CheckIcon,
  CloseIcon,
  CloudIcon,
  DownloadIcon,
  PackageIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  TruckIcon,
} from "../../src/components/Icons";
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
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
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

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.full_name, c.phone, c.city, c.town, c.district, c.email]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

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
      setShowNewCustomer(false);
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

  const fetchLabelFile = async (s: HepsiJetManualShipment): Promise<string | null> => {
    if (!token) return null;
    const resp = await getHepsiJetManualShipmentLabel(token, s.id);
    const data = resp?.data || resp?.data_base64 || "";
    if (!data) {
      Alert.alert("Etiket yok", resp?.message || "Etiket verisi alınamadı.");
      return null;
    }
    const path = `${FileSystem.cacheDirectory}hepsijet-${s.id}.pdf`;
    await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
    return path;
  };

  const printLabel = async (s: HepsiJetManualShipment) => {
    setLabelBusyId(s.id);
    try {
      const path = await fetchLabelFile(s);
      if (!path) return;
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

  const shareLabel = async (s: HepsiJetManualShipment) => {
    setShareBusyId(s.id);
    try {
      const path = await fetchLabelFile(s);
      if (!path) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "application/pdf", dialogTitle: `Etiket ${s.barcode || s.id}` });
      } else {
        Alert.alert("Paylaşım yok", "Cihazda paylaşım desteği yok.");
      }
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Etiket paylaşılamadı.");
    } finally {
      setShareBusyId(null);
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

          {/* Step 1: Customer selection */}
          <SafeAnimatedView
            entering={FadeInUp.duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={styles.cardHead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Müşteri Seç</Text>
              <PressableScale
                testID="hepsijet-toggle-new-customer"
                onPress={() => setShowNewCustomer((v) => !v)}
                style={[styles.miniBtn, { backgroundColor: showNewCustomer ? colors.error : colors.hepsijet }]}
              >
                {showNewCustomer ? <CloseIcon size={14} color="#FFF" /> : <PlusIcon size={14} color="#FFF" />}
                <Text style={styles.miniBtnTextWhite}>{showNewCustomer ? "Vazgeç" : "Yeni"}</Text>
              </PressableScale>
            </View>

            {/* Search */}
            {!showNewCustomer && customers.length > 0 ? (
              <View style={[styles.searchWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                <SearchIcon size={16} color={colors.textTertiary} />
                <TextInput
                  testID="hepsijet-customer-search"
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  placeholder="İsim, telefon, şehir ile ara..."
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                />
              </View>
            ) : null}

            {/* New customer form */}
            {showNewCustomer ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
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
            ) : (
              <View style={{ marginTop: spacing.xs, gap: 8 }}>
                {filteredCustomers.length === 0 ? (
                  <View style={[styles.emptyMini, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.emptyMiniTitle, { color: colors.textSecondary }]}>
                      {customers.length === 0 ? "Henüz müşteri yok" : "Sonuç bulunamadı"}
                    </Text>
                    <Text style={[styles.emptyMiniDesc, { color: colors.textTertiary }]}>
                      {customers.length === 0 ? "Sağ üstten yeni müşteri ekle." : "Farklı bir arama dene."}
                    </Text>
                  </View>
                ) : (
                  filteredCustomers.slice(0, 8).map((c, idx) => {
                    const active = selectedCustomerId === c.id;
                    const initials = String(c.full_name || "?")
                      .trim()
                      .split(/\s+/)
                      .map((w) => w[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();
                    const locationParts = [c.district, c.town, c.city].filter(Boolean).join(" / ");
                    return (
                      <SafeAnimatedView key={c.id} entering={FadeInDown.delay(idx * 30).springify().damping(18)}>
                        <PressableScale
                          testID={`hepsijet-customer-${c.id}`}
                          onPress={() => setSelectedCustomerId(c.id)}
                          style={[
                            styles.customerCard,
                            {
                              backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
                              borderColor: active ? colors.primary : colors.borderSubtle,
                            },
                          ]}
                        >
                          <View style={[styles.avatarWrap, { backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.borderSubtle }]}>
                            <Text style={[styles.avatarText, { color: active ? "#FFF" : colors.textSecondary }]}>{initials || "?"}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.customerName, { color: colors.textPrimary }]} numberOfLines={1}>
                              {c.full_name || "(İsimsiz)"}
                            </Text>
                            <Text style={[styles.customerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                              {[c.phone, locationParts].filter(Boolean).join(" · ") || "Detay yok"}
                            </Text>
                          </View>
                          {active ? (
                            <View style={[styles.activeBadge, { backgroundColor: colors.primary }]}>
                              <CheckIcon size={14} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={[styles.unselected, { borderColor: colors.borderSubtle }]} />
                          )}
                        </PressableScale>
                      </SafeAnimatedView>
                    );
                  })
                )}
                {filteredCustomers.length > 8 ? (
                  <Text style={[styles.moreHint, { color: colors.textTertiary }]}>
                    +{filteredCustomers.length - 8} daha · aramayı daralt
                  </Text>
                ) : null}
              </View>
            )}
          </SafeAnimatedView>

          {/* Step 2: Shipment details (only if customer selected) */}
          {!showNewCustomer && selectedCustomer ? (
            <SafeAnimatedView
              entering={FadeInUp.delay(60).duration(400)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
            >
              <View style={styles.cardHead}>
                <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Gönderi Detayı</Text>
              </View>

              {/* Selected summary */}
              <View style={[styles.selectedSummary, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.primary }]}>
                  <TruckIcon size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {selectedCustomer.full_name}
                  </Text>
                  <Text style={[styles.summaryMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                    {[selectedCustomer.phone, selectedCustomer.city, selectedCustomer.address_line]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <Field label="Paket" value={parcels} onChange={setParcels} keyboardType="number-pad" style={{ flex: 1 }} />
                <Field label="Desi" value={desi} onChange={setDesi} keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>

              <PressableScale
                testID="hepsijet-shipment-create"
                onPress={submitShipment}
                disabled={busy}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, shadows.primary, { marginTop: spacing.xs }]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Etiket Oluştur</Text>}
              </PressableScale>
            </SafeAnimatedView>
          ) : null}

          {/* Recent shipments */}
          <SafeAnimatedView
            entering={FadeInDown.delay(120).duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.stepBadge, { backgroundColor: colors.success }]}>
                <PackageIcon size={14} color="#FFF" />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Son Gönderiler</Text>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : shipments.length === 0 ? (
              <Text style={[styles.helper, { color: colors.textTertiary, marginTop: 8 }]}>Kayıtlı etiket yok.</Text>
            ) : (
              shipments.slice(0, 20).map((s, idx) => (
                <SafeAnimatedView key={s.id} entering={FadeInDown.delay(idx * 30).springify().damping(18)}>
                  <View style={[styles.shipmentRow, idx > 0 && { borderTopWidth: 1, borderColor: colors.borderSubtle }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.shipmentBarcode, { color: colors.textPrimary }]} numberOfLines={1}>
                        #{s.barcode || s.id}
                      </Text>
                      <Text style={[styles.shipmentMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                        {s.customer?.full_name || "Müşteri"} · {s.total_parcels || 1} paket · {s.total_desi || 1} desi
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <PressableScale
                        testID={`hepsijet-print-${s.id}`}
                        onPress={() => printLabel(s)}
                        disabled={labelBusyId === s.id}
                        style={[styles.iconActionBtn, { backgroundColor: colors.primarySoft }]}
                      >
                        {labelBusyId === s.id ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <PrinterIcon size={16} color={colors.primary} strokeWidth={2.2} />
                        )}
                      </PressableScale>
                      <PressableScale
                        testID={`hepsijet-cloud-${s.id}`}
                        onPress={() => shareLabel(s)}
                        disabled={shareBusyId === s.id}
                        style={[styles.iconActionBtn, { backgroundColor: colors.hepsijetSoft }]}
                      >
                        {shareBusyId === s.id ? (
                          <ActivityIndicator size="small" color={colors.hepsijet} />
                        ) : (
                          <CloudIcon size={16} color={colors.hepsijet} strokeWidth={2.2} />
                        )}
                      </PressableScale>
                    </View>
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
  title: { fontSize: 28, fontWeight: fontWeight.bold, letterSpacing: -0.7, marginTop: 2 },
  sub: { fontSize: 13, fontWeight: fontWeight.medium, marginTop: 4, marginBottom: spacing.sm },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2, flex: 1 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F97316" },
  stepBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  miniBtnTextWhite: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    marginBottom: 4,
  },
  searchInput: { flex: 1, fontSize: 13.5, fontWeight: "500" },
  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: 12,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  customerName: { fontSize: 14, fontWeight: "700", letterSpacing: -0.1 },
  customerMeta: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
  activeBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  unselected: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  moreHint: { fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 4 },
  emptyMini: { padding: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: 4 },
  emptyMiniTitle: { fontSize: 13, fontWeight: "700" },
  emptyMiniDesc: { fontSize: 11.5, fontWeight: "500", marginTop: 4 },
  selectedSummary: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
  },
  summaryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryName: { fontSize: 14, fontWeight: "800" },
  summaryMeta: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
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
  shipmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  shipmentBarcode: { fontSize: 14, fontWeight: "800" },
  shipmentMeta: { fontSize: 11.5, fontWeight: "500", marginTop: 2 },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
