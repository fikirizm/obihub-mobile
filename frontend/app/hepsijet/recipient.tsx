// HepsiJet alıcı ayrıntısı (13 Kas 2026, kullanıcı isteği): listeden doğrudan silme kalktı; alıcı burada açılır, düzeltilir
// ve (onayla) silinir. id yoksa yeni alıcı. Uçlar: POST / PUT / DELETE /hepsijet/manual/customers[/{id}].
// İl / ilçe / mahalle HepsiJet listelerinden seçilir; liste yüklenemezse serbest metne düşülür.
import React, { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, KeyboardTypeOptions, Platform, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { createHepsiJetManualCustomer, deleteHepsiJetManualCustomer, listHepsiJetManualCustomers, updateHepsiJetManualCustomer } from "../../src/api";
import { getHjCities, getHjDistricts, getHjTowns, type LocOption } from "../../src/api-hepsijet";
import { recipientError, type RecipientForm } from "../../src/hepsijet-ui";
import { OptionPicker } from "../../src/components/OptionPicker";
import { EmptyState } from "../../src/components/EmptyState";
import { Skeleton } from "../../src/components/Skeleton";
import { PrinterIcon, TrashIcon, UserIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

const EMPTY: RecipientForm = { full_name: "", phone: "", email: "", city: "", town: "", district: "", address_line: "" };
// Kayıtlı alıcıda konum kimliği tutulmaz; seçicide yalnız ad gösterilir (yeni il seçilince listeler yeniden yüklenir).
const labelOnly = (label: string): LocOption | null => (label ? { id: "", label } : null);

export default function HepsiJetRecipientScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? String(params.id) : "";
  const isNew = !id;
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [state, setState] = useState<"loading" | "ready" | "missing">(isNew ? "ready" : "loading");
  const [form, setForm] = useState<RecipientForm>(EMPTY);
  const [busy, setBusy] = useState<"" | "save" | "delete">("");
  const [cities, setCities] = useState<LocOption[]>([]);
  const [towns, setTowns] = useState<LocOption[]>([]);
  const [districts, setDistricts] = useState<LocOption[]>([]);
  const [loc, setLoc] = useState<{ city: LocOption | null; town: LocOption | null; district: LocOption | null }>({ city: null, town: null, district: null });
  const [locLoading, setLocLoading] = useState<"" | "city" | "town" | "district">("");
  const [locFailed, setLocFailed] = useState(false);

  useEffect(() => {
    if (!token || isNew) return;
    let on = true;
    listHepsiJetManualCustomers(token, { page: 1, perPage: 100 })
      .then((list) => {
        if (!on) return;
        const c = list.find((x) => x.id === id);
        if (!c) return setState("missing");
        const f: RecipientForm = {
          full_name: c.full_name || "",
          phone: c.phone || "",
          email: c.email || "",
          city: c.city || "",
          town: c.town || "",
          district: c.district || "",
          address_line: c.address_line || "",
        };
        setForm(f);
        setLoc({ city: labelOnly(f.city), town: labelOnly(f.town), district: labelOnly(f.district) });
        setState("ready");
      })
      .catch(() => on && setState("missing"));
    return () => {
      on = false;
    };
  }, [token, id, isNew]);

  useEffect(() => {
    if (!token || cities.length || locFailed) return;
    setLocLoading("city");
    getHjCities(token)
      .then((c) => (c.length ? setCities(c) : setLocFailed(true)))
      .catch(() => setLocFailed(true))
      .finally(() => setLocLoading(""));
  }, [token, cities.length, locFailed]);

  const pickCity = (o: LocOption) => {
    setLoc({ city: o, town: null, district: null });
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
    setLoc((l) => ({ ...l, town: o, district: null }));
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
    setLoc((l) => ({ ...l, district: o }));
    setForm((f) => ({ ...f, district: o.label }));
  };
  // Kayıtlı ilçe/mahalle seçicisi: il kimliği bilinmediği için önce il yeniden seçilmelidir.
  const townDisabled = !loc.city || (!loc.city.id && towns.length === 0);
  const districtDisabled = !loc.town || (!loc.town.id && districts.length === 0);

  const setField = (k: keyof RecipientForm) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!token || busy) return;
    Keyboard.dismiss();
    const err = recipientError(form);
    if (err) {
      toast(err, "error");
      return;
    }
    setBusy("save");
    try {
      if (isNew) {
        const created = await createHepsiJetManualCustomer(token, form);
        toast("Alıcı kaydedildi", "success");
        router.dismissTo({ pathname: "/hepsijet", params: { select: created?.id || "", t: String(Date.now()) } });
      } else {
        await updateHepsiJetManualCustomer(token, id, form);
        toast("Alıcı güncellendi", "success");
        if (router.canGoBack()) router.back();
      }
    } catch (e: any) {
      toast(e?.message || "Alıcı kaydedilemedi.", "error");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!token || busy) return;
    const ok = await confirm({
      title: `${form.full_name || "Alıcı"} silinsin mi?`,
      message: "Alıcı kaydı listeden kaldırılır. Oluşturulmuş gönderiler ve etiketler etkilenmez.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteHepsiJetManualCustomer(token, id);
      toast("Alıcı silindi", "success");
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      toast(e?.message || "Alıcı silinemedi.", "error");
    } finally {
      setBusy("");
    }
  };

  const body = () => {
    if (state === "loading")
      return (
        <View style={{ padding: spacing.lg, gap: spacing.md }} accessibilityLabel="Alıcı yükleniyor">
          <Skeleton height={56} borderRadius={radius.md} />
          <Skeleton height={56} borderRadius={radius.md} />
          <Skeleton height={56} borderRadius={radius.md} />
        </View>
      );
    if (state === "missing")
      return <EmptyState icon={<UserIcon size={30} color={colors.textTertiary} />} title="Alıcı bulunamadı" description="Kayıt silinmiş olabilir." />;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!isNew ? (
            <View style={styles.block}>
              <Button
                testID="hj-recipient-use"
                label="Bu alıcıya etiket oluştur"
                icon={<PrinterIcon size={18} color="#FFFFFF" />}
                onPress={() => router.dismissTo({ pathname: "/hepsijet", params: { select: id, t: String(Date.now()) } })}
              />
            </View>
          ) : null}
          <Card padded style={[styles.block, styles.form]}>
            <Field testID="hj-recipient-name" label="Ad soyad" value={form.full_name} onChange={setField("full_name")} required />
            <View style={styles.fieldRow}>
              <Field testID="hj-recipient-phone" label="Telefon" value={form.phone} onChange={setField("phone")} required keyboardType="phone-pad" style={styles.fieldFlex} />
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
                  <OptionPicker testID="hj-city" label="İl" required value={loc.city} options={cities} loading={locLoading === "city"} onSelect={pickCity} />
                  <OptionPicker testID="hj-town" label="İlçe" required value={loc.town} options={towns} loading={locLoading === "town"} disabled={townDisabled} onSelect={pickTown} />
                </View>
                <OptionPicker testID="hj-district" label="Mahalle" required value={loc.district} options={districts} loading={locLoading === "district"} disabled={districtDisabled} onSelect={pickDistrict} />
                {!isNew && loc.city && !loc.city.id ? (
                  <Text style={[type.caption, { color: colors.textTertiary }]}>İlçe ya da mahalleyi değiştirmek için önce ili yeniden seçin.</Text>
                ) : null}
              </>
            )}
            <Field testID="hj-recipient-address" label="Açık adres" value={form.address_line} onChange={setField("address_line")} required multiline />
            <Button testID="hj-recipient-save" label={isNew ? "Alıcıyı kaydet" : "Değişiklikleri kaydet"} busy={busy === "save"} disabled={busy === "delete"} onPress={save} />
          </Card>
          {!isNew ? (
            <View style={styles.block}>
              <Button
                testID="hj-recipient-delete"
                variant="secondary"
                label="Alıcıyı sil"
                icon={<TrashIcon size={16} color={colors.error} />}
                busy={busy === "delete"}
                disabled={busy === "save"}
                onPress={remove}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="hj-recipient-screen">
      <StackHeader title={isNew ? "Yeni alıcı" : "Alıcı"} subtitle={isNew ? "HepsiJet" : form.full_name || "HepsiJet"} />
      {body()}
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
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
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
        testID={testID}
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
          { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: focused ? colors.primary : colors.border },
          multiline && styles.inputMultiline,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge, gap: spacing.md },
  block: { marginHorizontal: spacing.lg },
  form: { gap: spacing.sm },
  fieldRow: { flexDirection: "row", gap: spacing.sm },
  fieldFlex: { flex: 1, minWidth: 0 },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 0, lineHeight: undefined },
  inputMultiline: { height: undefined, minHeight: 80, paddingTop: spacing.sm, paddingBottom: spacing.sm, textAlignVertical: "top" },
});
