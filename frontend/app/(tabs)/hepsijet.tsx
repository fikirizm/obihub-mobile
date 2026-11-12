import { printOrShare } from "../../src/pdf";
import { InlineEmpty } from "../../src/components/InlineEmpty";
import { RowsSkeleton } from "../../src/components/Skeleton";
import { createHepsiJetManualShipmentsBulk, getHjCities, getHjDistricts, getHjTowns, type LocOption } from "../../src/api-hepsijet";
import { OptionPicker } from "../../src/components/OptionPicker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import {
  createHepsiJetManualCustomer,
  createHepsiJetManualShipment,
  deleteHepsiJetManualCustomer,
  deleteHepsiJetManualShipment,
  enqueueHepsiJetManualShipmentCloudPrint,
  getHepsiJetManualShipmentLabel,
  listHepsiJetManualCustomers,
  listHepsiJetManualShipments,
  trackHepsiJetManualShipment,
} from "../../src/api";
import { PressableScale } from "../../src/components/KPICard";
import { CheckIcon, CloseIcon, CloudIcon, PackageIcon, PlusIcon, PrinterIcon, RefreshIcon, TrashIcon, TruckIcon, UserIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { TabHeader } from "../../src/ui/Header";
import { Card, IconTile, SectionTitle } from "../../src/ui/ListRow";
import { SearchField } from "../../src/ui/SearchField";
import type { HepsiJetManualCustomer, HepsiJetManualShipment } from "../../src/types";
import type { StatusKind } from "../../src/utils";

export default function HepsiJetScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [customers, setCustomers] = useState<HepsiJetManualCustomer[]>([]);
  const [shipments, setShipments] = useState<HepsiJetManualShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [labelBusyId, setLabelBusyId] = useState<string | null>(null);
  const [cloudBusyId, setCloudBusyId] = useState<string | null>(null);
  const [trackBusyId, setTrackBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [deleteCustomerBusyId, setDeleteCustomerBusyId] = useState<string | null>(null);
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
  // E1: aynı alıcıya birden çok gönderi (web create_count → /shipments/bulk).
  const [count, setCount] = useState("1");
  // E1: il / ilçe / mahalle HepsiJet listelerinden seçilir; liste yüklenemezse serbest metne düşülür.
  const [cities, setCities] = useState<LocOption[]>([]);
  const [towns, setTowns] = useState<LocOption[]>([]);
  const [districts, setDistricts] = useState<LocOption[]>([]);
  const [locIds, setLocIds] = useState<{ city: LocOption | null; town: LocOption | null; district: LocOption | null }>({ city: null, town: null, district: null });
  const [locLoading, setLocLoading] = useState<"" | "city" | "town" | "district">("");
  const [locFailed, setLocFailed] = useState(false);
  useEffect(() => {
    if (!showNewCustomer || !token || cities.length || locFailed) return;
    setLocLoading("city");
    getHjCities(token)
      .then((c) => (c.length ? setCities(c) : setLocFailed(true)))
      .catch(() => setLocFailed(true))
      .finally(() => setLocLoading(""));
  }, [showNewCustomer, token, cities.length, locFailed]);
  const pickCity = (o: LocOption) => {
    setLocIds({ city: o, town: null, district: null });
    setForm((f) => ({ ...f, city: o.label, town: "", district: "" }));
    setTowns([]);
    setDistricts([]);
    if (!token) return;
    setLocLoading("town");
    getHjTowns(token, o.id)
      .then(setTowns)
      .catch(() => setLocFailed(true))
      .finally(() => setLocLoading(""));
  };
  const pickTown = (o: LocOption) => {
    setLocIds((l) => ({ ...l, town: o, district: null }));
    setForm((f) => ({ ...f, town: o.label, district: "" }));
    setDistricts([]);
    if (!token) return;
    setLocLoading("district");
    getHjDistricts(token, o.id)
      .then(setDistricts)
      .catch(() => setLocFailed(true))
      .finally(() => setLocLoading(""));
  };
  const pickDistrict = (o: LocOption) => {
    setLocIds((l) => ({ ...l, district: o }));
    setForm((f) => ({ ...f, district: o.label }));
  };
  const [desi, setDesi] = useState("1");

  const load = useCallback(async (silent = false) => {
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
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token || !shipments.length) return undefined;
    const timer = setInterval(async () => {
      const active = shipments
        .filter((shipment) => Boolean(shipment.barcode))
        .filter((shipment) => {
          const status = String(shipment.status || "").toLocaleLowerCase("tr-TR");
          return !(
            status.includes("teslim edildi") ||
            status.includes("delivered") ||
            status.includes("iptal") ||
            status.includes("cancel") ||
            status.includes("iade") ||
            status.includes("return")
          );
        })
        .slice(0, 8);
      if (!active.length) return;
      try {
        const results = await Promise.allSettled(
          active.map((shipment) => trackHepsiJetManualShipment(token, shipment.id))
        );
        const updates = results
          .filter((result): result is PromiseFulfilledResult<{ shipment?: HepsiJetManualShipment }> => result.status === "fulfilled")
          .map((result) => result.value?.shipment)
          .filter((shipment): shipment is HepsiJetManualShipment => Boolean(shipment?.id));
        if (updates.length) {
          setShipments((prev) =>
            prev.map((shipment) => updates.find((row) => row.id === shipment.id) || shipment)
          );
        }
      } catch {
        // Arka plan takibi sessizce yeniden denenir.
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [token, shipments]);

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
    // Klavye açık kalırsa alttaki bildirim klavyenin arkasında kalır.
    Keyboard.dismiss();
    if (!form.full_name.trim()) {
      toast("Ad soyad zorunludur.", "error");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 10) {
      toast("Telefon en az 10 haneli olmalıdır.", "error");
      return;
    }
    if (!form.city.trim() || !form.town.trim() || !form.district.trim()) {
      toast("İl, ilçe ve mahalle zorunludur.", "error");
      return;
    }
    if (!form.address_line.trim()) {
      toast("Adres zorunludur.", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await createHepsiJetManualCustomer(token, form);
      setCustomers((prev) => [created, ...prev]);
      setSelectedCustomerId(created.id);
      setForm({ full_name: "", phone: "", email: "", city: "", town: "", district: "", address_line: "" });
      setLocIds({ city: null, town: null, district: null });
      setTowns([]);
      setDistricts([]);
      setShowNewCustomer(false);
      toast("Müşteri kaydedildi", "success");
    } catch (e: any) {
      toast(e?.message || "Müşteri kaydedilemedi.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitShipment = async () => {
    if (!token) return;
    // Klavye açık kalırsa alttaki bildirim klavyenin arkasında kalır.
    Keyboard.dismiss();
    if (!selectedCustomerId) {
      toast("Önce bir müşteri seçin.", "error");
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
        return;
      }
      const sh = await createHepsiJetManualShipment(token, payload);
      if (!sh?.id) throw new Error("Etiket oluşturma yanıtı eksik.");
      setShipments((prev) => [sh, ...prev]);
      toast(`Etiket oluşturuldu. Barkod: ${sh.barcode || sh.id}`, "success");
    } catch (e: any) {
      toast(e?.message || "Etiket oluşturulamadı.", "error");
    } finally {
      setBusy(false);
    }
  };

  const fetchLabelFile = async (s: HepsiJetManualShipment): Promise<string | null> => {
    if (!token) return null;
    const resp = await getHepsiJetManualShipmentLabel(token, s.id);
    const data = resp?.data || resp?.data_base64 || "";
    if (!data) {
      toast(resp?.message || "Etiket verisi alınamadı.", "error");
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
      await printOrShare(path);
    } catch (e: any) {
      toast(e?.message || "Etiket açılamadı.", "error");
    } finally {
      setLabelBusyId(null);
    }
  };

  const cloudPrintLabel = async (s: HepsiJetManualShipment) => {
    if (!token) return;
    setCloudBusyId(s.id);
    try {
      const res = await enqueueHepsiJetManualShipmentCloudPrint(token, s.id);
      if (!res?.success) throw new Error(res?.message || "Bulut yazdırma başlatılamadı.");
      toast("Bulut yazdırma isteği kuyruğa alındı", "success");
    } catch (e: any) {
      toast(e?.message || "Bulut yazdırma başlatılamadı.", "error");
    } finally {
      setCloudBusyId(null);
    }
  };

  const deleteCustomer = async (customerId: string) => {
    if (!token) return;
    const ok = await confirm({
      title: "Müşteri silinsin mi?",
      message: "Müşteri kaydı listeden kaldırılır.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    setDeleteCustomerBusyId(customerId);
    try {
      await deleteHepsiJetManualCustomer(token, customerId);
      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
      setSelectedCustomerId((prev) => (prev === customerId ? "" : prev));
      toast("Müşteri silindi", "success");
    } catch (e: any) {
      toast(e?.message || "Müşteri silinemedi.", "error");
    } finally {
      setDeleteCustomerBusyId(null);
    }
  };

  const refreshShipmentStatus = async (shipmentId: string) => {
    if (!token) return;
    setTrackBusyId(shipmentId);
    try {
      const res = await trackHepsiJetManualShipment(token, shipmentId);
      const next = (res as { shipment?: HepsiJetManualShipment })?.shipment;
      if (next?.id) {
        setShipments((prev) => prev.map((s) => (s.id === next.id ? { ...s, ...next } : s)));
      } else {
        await load(true);
      }
    } catch (e: any) {
      toast(e?.message || "Durum güncellenemedi. Tekrar deneyin.", "error");
    } finally {
      setTrackBusyId(null);
    }
  };

  const deleteShipment = async (shipmentId: string) => {
    if (!token) return;
    const ok = await confirm({
      title: "Etiket silinsin mi?",
      message: "Teslim edilmemiş etiket silinir.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    setDeleteBusyId(shipmentId);
    try {
      await deleteHepsiJetManualShipment(token, shipmentId);
      setShipments((prev) => prev.filter((s) => s.id !== shipmentId));
      toast("Etiket silindi", "success");
    } catch (e: any) {
      toast(e?.message || "Etiket silinemedi.", "error");
    } finally {
      setDeleteBusyId(null);
    }
  };

  const setField = (key: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [key]: v }));

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="hepsijet-screen">
      <TabHeader title="HepsiJet" eyebrow="Manuel gönderi ve etiket" />
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge }}
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
          <Text style={[type.footnote, styles.intro, { color: colors.textSecondary }]}>
            Pazaryeri dışı gönderileriniz için müşteri kaydı oluşturun, barkodlu etiketini yazdırın.
          </Text>

          <SectionTitle
            title={showNewCustomer ? "Yeni müşteri" : "Müşteri seçin"}
            action={
              <Button
                testID="hepsijet-toggle-new-customer"
                label={showNewCustomer ? "Vazgeç" : "Yeni"}
                size="sm"
                variant={showNewCustomer ? "secondary" : "primary"}
                icon={showNewCustomer ? <CloseIcon size={14} color={colors.textPrimary} /> : <PlusIcon size={14} color="#FFFFFF" />}
                onPress={() => setShowNewCustomer((v) => !v)}
              />
            }
          />

          {showNewCustomer ? (
            <Card padded style={[styles.block, styles.form]}>
              <Field label="Ad soyad" value={form.full_name} onChange={setField("full_name")} required />
              <View style={styles.fieldRow}>
                <Field label="Telefon" value={form.phone} onChange={setField("phone")} required keyboardType="phone-pad" style={styles.fieldFlex} />
                <Field label="E-posta" value={form.email} onChange={setField("email")} keyboardType="email-address" style={styles.fieldFlex} />
              </View>
              {locFailed ? (
                <>
                  <Text style={[type.caption, { color: colors.textTertiary }]}>HepsiJet konum listesi alınamadı; il, ilçe ve mahalleyi yazın.</Text>
                  <View style={styles.fieldRow}>
                    <Field label="İl" value={form.city} onChange={setField("city")} required style={styles.fieldFlex} />
                    <Field label="İlçe" value={form.town} onChange={setField("town")} required style={styles.fieldFlex} />
                    <Field label="Mahalle" value={form.district} onChange={setField("district")} required style={styles.fieldFlex} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.fieldRow}>
                    <OptionPicker testID="hj-city" label="İl" required value={locIds.city} options={cities} loading={locLoading === "city"} onSelect={pickCity} />
                    <OptionPicker testID="hj-town" label="İlçe" required value={locIds.town} options={towns} loading={locLoading === "town"} disabled={!locIds.city} onSelect={pickTown} />
                  </View>
                  <OptionPicker testID="hj-district" label="Mahalle" required value={locIds.district} options={districts} loading={locLoading === "district"} disabled={!locIds.town} onSelect={pickDistrict} />
                </>
              )}
              <Field label="Açık adres" value={form.address_line} onChange={setField("address_line")} required multiline />
              <Button testID="hepsijet-customer-save" label="Müşteriyi kaydet" busy={busy} onPress={submitCustomer} style={{ marginTop: spacing.xxs }} />
            </Card>
          ) : (
            <>
              {customers.length > 0 ? (
                <View style={{ marginBottom: spacing.sm }}>
                  <SearchField
                    testID="hepsijet-customer-search"
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    placeholder="İsim, telefon veya şehir ile arayın"
                  />
                </View>
              ) : null}
              <Card style={styles.block}>
                {filteredCustomers.length === 0 ? (
                  <InlineEmpty
                    icon={<UserIcon size={22} color={colors.primary} />}
                    title={customers.length === 0 ? "Henüz müşteri yok" : "Sonuç bulunamadı"}
                    description={customers.length === 0 ? "Gönderi alıcısını bir kez kaydedin; sonraki etiketlerde tek dokunuşla seçin." : "Farklı bir isim, telefon ya da şehirle arayın."}
                    actionLabel={customers.length === 0 ? "Müşteri ekle" : undefined}
                    onAction={customers.length === 0 ? () => setShowNewCustomer(true) : undefined}
                  />
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
                      .toLocaleUpperCase("tr-TR");
                    const locationParts = [c.district, c.town, c.city].filter(Boolean).join(" / ");
                    const name = c.full_name || "(İsimsiz)";
                    const meta = [c.phone, locationParts].filter(Boolean).join(" · ") || "Detay yok";
                    const deleting = deleteCustomerBusyId === c.id;
                    return (
                      <View
                        key={c.id}
                        style={[
                          styles.customerRow,
                          idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                          active && { backgroundColor: colors.primarySoft },
                        ]}
                      >
                        <PressableScale
                          testID={`hepsijet-customer-${c.id}`}
                          onPress={() => setSelectedCustomerId(c.id)}
                          accessibilityRole="radio"
                          accessibilityLabel={`${name}, ${meta}`}
                          accessibilityState={{ selected: active }}
                          style={styles.customerMain}
                        >
                          <View style={[styles.avatar, { backgroundColor: active ? colors.primary : colors.surfaceMuted, borderColor: active ? colors.primary : colors.border }]}>
                            <Text style={[type.callout, { color: active ? "#FFFFFF" : colors.textSecondary, fontWeight: "700" }]}>{initials || "?"}</Text>
                          </View>
                          <View style={styles.fill}>
                            <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                              {name}
                            </Text>
                            <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
                              {meta}
                            </Text>
                          </View>
                          {active ? (
                            <View style={[styles.radio, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                              <CheckIcon size={14} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={[styles.radio, { borderColor: colors.border }]} />
                          )}
                        </PressableScale>
                        <PressableScale
                          testID={`hepsijet-customer-delete-${c.id}`}
                          onPress={() => deleteCustomer(c.id)}
                          disabled={deleting}
                          accessibilityRole="button"
                          accessibilityLabel={`${name} müşterisini sil`}
                          accessibilityState={{ disabled: deleting, busy: deleting }}
                          style={styles.iconBtn}
                        >
                          {deleting ? <ActivityIndicator size="small" color={colors.error} /> : <TrashIcon size={18} color={colors.error} />}
                        </PressableScale>
                      </View>
                    );
                  })
                )}
              </Card>
              {filteredCustomers.length > 8 ? (
                <Text style={[type.caption, tabular, styles.moreHint, { color: colors.textTertiary }]}>
                  {filteredCustomers.length - 8} müşteri daha var. Aramayı daraltın.
                </Text>
              ) : null}
            </>
          )}

          {!showNewCustomer && selectedCustomer ? (
            <>
              <SectionTitle title="Gönderi detayı" />
              <Card padded style={[styles.block, styles.form]}>
                <View style={styles.summary}>
                  <IconTile>
                    <TruckIcon size={18} color={colors.primary} />
                  </IconTile>
                  <View style={styles.fill}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                      {selectedCustomer.full_name}
                    </Text>
                    <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={2}>
                      {[selectedCustomer.phone, selectedCustomer.city, selectedCustomer.address_line].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
                <View style={styles.fieldRow}>
                  <Field label="Paket" value={parcels} onChange={setParcels} keyboardType="number-pad" numeric style={styles.fieldFlex} />
                  <Field label="Desi" value={desi} onChange={setDesi} keyboardType="decimal-pad" numeric style={styles.fieldFlex} />
                  <Field label="Adet" value={count} onChange={setCount} keyboardType="number-pad" numeric style={styles.fieldFlex} />
                </View>
                <Button testID="hepsijet-shipment-create" label="Etiket oluştur" busy={busy} onPress={submitShipment} style={{ marginTop: spacing.xxs }} />
              </Card>
            </>
          ) : null}

          <SectionTitle title="Son gönderiler" />
          <Card style={styles.block}>
            {loading ? (
              <View style={{ marginHorizontal: -spacing.lg, paddingVertical: spacing.xs }}>
                <RowsSkeleton rows={3} label="Gönderiler yükleniyor" />
              </View>
            ) : shipments.length === 0 ? (
              <InlineEmpty
                icon={<PackageIcon size={22} color={colors.primary} />}
                title="Henüz etiket yok"
                description="Bir müşteri seçip Etiket oluştur'a dokunduğunuzda gönderiler burada listelenir."
              />
            ) : (
              shipments.slice(0, 20).map((s, idx) => {
                const code = s.barcode || s.id;
                return (
                  <View
                    key={s.id}
                    style={[styles.shipmentRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={styles.shipmentHead}>
                      <Text style={[type.bodyStrong, tabular, styles.fill, { color: colors.textPrimary }]} numberOfLines={1}>
                        #{code}
                      </Text>
                      <StatusBadge label={shipmentStatusText(s.status)} kind={shipmentStatusKind(s.status)} />
                    </View>
                    <Text style={[type.footnote, tabular, { color: colors.textSecondary, marginTop: spacing.xxs }]} numberOfLines={2}>
                      {s.customer_name || s.customer?.full_name || "Müşteri"} · {s.total_parcels || 1} paket · {s.total_desi || s.desi || 1} desi
                    </Text>
                    <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={2}>
                      {[s.customer_phone, s.customer_district, s.customer_town, s.customer_city].filter(Boolean).join(" · ") || "Alıcı detayı yok"}
                    </Text>
                    <View style={styles.shipmentActions}>
                      <IconAction
                        testID={`hepsijet-track-${s.id}`}
                        label={`${code} gönderi durumunu güncelle`}
                        busy={trackBusyId === s.id}
                        onPress={() => refreshShipmentStatus(s.id)}
                        tone="neutral"
                        renderIcon={(c) => <RefreshIcon size={18} color={c} strokeWidth={2.2} />}
                      />
                      <IconAction
                        testID={`hepsijet-print-${s.id}`}
                        label={`${code} etiketini yazdır`}
                        busy={labelBusyId === s.id}
                        onPress={() => printLabel(s)}
                        tone="primary"
                        renderIcon={(c) => <PrinterIcon size={18} color={c} strokeWidth={2.2} />}
                      />
                      <IconAction
                        testID={`hepsijet-cloud-${s.id}`}
                        label={`${code} etiketini bulut yazdırmaya gönder`}
                        busy={cloudBusyId === s.id}
                        onPress={() => cloudPrintLabel(s)}
                        tone="primary"
                        renderIcon={(c) => <CloudIcon size={18} color={c} strokeWidth={2.2} />}
                      />
                      <IconAction
                        testID={`hepsijet-delete-${s.id}`}
                        label={`${code} etiketini sil`}
                        busy={deleteBusyId === s.id}
                        onPress={() => deleteShipment(s.id)}
                        tone="error"
                        renderIcon={(c) => <TrashIcon size={18} color={c} />}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        </ScrollView>
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
  intro: { paddingHorizontal: spacing.lg, marginTop: spacing.xxs },
  block: { marginHorizontal: spacing.lg },
  form: { gap: spacing.sm },
  fieldRow: { flexDirection: "row", gap: spacing.sm },
  fieldFlex: { flex: 1, minWidth: 0 },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 0, lineHeight: undefined },
  inputMultiline: { height: undefined, minHeight: 80, paddingTop: spacing.sm, paddingBottom: spacing.sm, textAlignVertical: "top" },
  empty: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  customerRow: { flexDirection: "row", alignItems: "center", paddingRight: spacing.xs },
  customerMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  avatar: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  moreHint: { textAlign: "center", marginTop: spacing.xs, paddingHorizontal: spacing.lg },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  shipmentRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  shipmentHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  shipmentActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs, marginTop: spacing.sm },
});
