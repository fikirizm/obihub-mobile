import React, { useEffect, useRef, useState } from "react";
import { FormSkeleton } from "../../src/components/Skeleton";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import {
  createParty,
  getParty,
  isUncertainWrite,
  updateParty,
  type ContactRole,
} from "../../src/api-finans";
import { legacyIdOf } from "../../src/api-gider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { UserIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { parseAmount, useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { SectionTitle } from "../../src/ui/ListRow";

const ROLE_OPTIONS = [
  { value: "customer", label: "Müşteri" },
  { value: "supplier", label: "Tedarikçi" },
  { value: "both", label: "Her ikisi" },
] as const;

const KIND_OPTIONS = [
  { value: "individual", label: "Bireysel" },
  { value: "company", label: "Kurumsal" },
] as const;

const DIRECTION_OPTIONS = [
  { value: "receivable", label: "Alacağım var" },
  { value: "payable", label: "Borcum var" },
] as const;

const ROLE_LABELS: Record<ContactRole, string> = {
  customer: "Müşteri",
  supplier: "Tedarikçi",
  both: "Müşteri ve tedarikçi",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("tr-TR") || "+";
}

export default function NewPartyScreen() {
  // C5: ?id= ile aynı form düzenleme kipinde açılır (PUT /customers/{id}); açılış bakiyesi düzenlenmez.
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? legacyIdOf(String(params.id)) : "";
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [role, setRole] = useState<ContactRole>("customer");
  const [kind, setKind] = useState<"individual" | "company">("individual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [iban, setIban] = useState("");
  const [openingText, setOpeningText] = useState("");
  const [direction, setDirection] = useState<"receivable" | "payable">(
    "receivable",
  );
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Önceki gönderimin sonucu belirsiz kaldıysa (yanıt alınamadı) doğrudur; yeniden gönderim ayrıca onaylatılır.
  const [uncertain, setUncertain] = useState(false);
  const [editState, setEditState] = useState<
    "none" | "loading" | "ready" | "error"
  >(editId ? "loading" : "none");
  useEffect(() => {
    if (!token || !editId) return;
    let live = true;
    getParty(token, editId)
      .then((c: any) => {
        if (!live) return;
        setRole(
          (["customer", "supplier", "both"].includes(c?.contact_role)
            ? c.contact_role
            : "customer") as ContactRole,
        );
        setKind(c?.customer_type === "company" ? "company" : "individual");
        setName(String(c?.name || ""));
        setPhone(String(c?.phone || ""));
        setEmail(String(c?.email || ""));
        setTaxNo(String(c?.tax_no || ""));
        setTaxOffice(String(c?.tax_office || ""));
        setAddress(String(c?.address || ""));
        setDistrict(String(c?.district || ""));
        setCity(String(c?.city || ""));
        setIban(String(c?.iban || ""));
        setNotes(String(c?.notes || ""));
        setEditState("ready");
      })
      .catch(() => live && setEditState("error"));
    return () => {
      live = false;
    };
  }, [token, editId]);

  const mayWrite = canManage(user, "customers");
  const openingAbs =
    openingText.trim() === "" ? 0 : parseAmount(openingText, true);
  // Sunucuda cari bakiyesi = açılış + faturalar − tahsilatlar; artı değer alacağınızı, eksi değer borcunuzu gösterir.
  const opening =
    openingAbs === null
      ? null
      : direction === "payable" && openingAbs > 0
        ? -openingAbs
        : openingAbs;
  const emailValid =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const errors = {
    name: tried && !name.trim() ? "Cari adı zorunludur." : undefined,
    email:
      tried && !emailValid ? "Geçerli bir e-posta adresi girin." : undefined,
    opening:
      tried && opening === null
        ? "Geçerli bir tutar girin: en çok 2 ondalık, ör. 1.234,56."
        : undefined,
  };

  const submit = async () => {
    setTried(true);
    if (
      !token ||
      !name.trim() ||
      !emailValid ||
      opening === null ||
      sending.current
    )
      return;
    // Açılış bakiyesi cariye para yazar; gönderimden önce özet gösterilir.
    if (!editId && (opening !== 0 || uncertain)) {
      const ok = await confirm({
        title: uncertain
          ? "Cari yeniden gönderilsin mi?"
          : "Cari kaydedilsin mi?",
        message:
          (uncertain
            ? "Önceki gönderimin sonucu alınamadı; cari kaydedilmiş olabilir. Cari listesinde görünüyorsa yeniden göndermeyin, aksi halde aynı cari iki kez açılır.\n"
            : "") +
          `${name.trim()} · ${ROLE_LABELS[role]}` +
          (opening !== 0
            ? `\nAçılış bakiyesi: ${formatTry(Math.abs(opening))} (${opening > 0 ? "alacağınız var" : "borcunuz var"})`
            : ""),
        confirmLabel: uncertain ? "Yine de gönder" : "Cariyi kaydet",
        destructive: uncertain,
      });
      if (!ok || sending.current) return;
    }
    sending.current = true;
    setBusy(true);
    try {
      if (editId) {
        // Güncelleme aynı kaydı yazar; belirsiz sonuçta yeniden gönderim güvenlidir.
        await updateParty(token, editId, {
          contact_role: role,
          customer_type: kind,
          name,
          phone,
          email,
          tax_no: taxNo,
          tax_office: taxOffice,
          address,
          district,
          city,
          iban,
          notes,
        });
        toast("Cari güncellendi", "success");
        router.back();
        return;
      }
      await createParty(token, {
        contact_role: role,
        customer_type: kind,
        name,
        phone,
        email,
        tax_no: taxNo,
        tax_office: taxOffice,
        address,
        district,
        city,
        iban,
        opening_balance: opening,
        notes,
      });
      toast("Cari kaydedildi", "success");
      router.back();
    } catch (e: any) {
      if (isUncertainWrite(e)) {
        setUncertain(true);
        toast(
          "Sonuç alınamadı. Cari kaydedilmiş olabilir; cari listesini kontrol edin.",
          "error",
        );
      } else {
        toast(e?.message || "Cari kaydedilemedi.", "error");
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (!mayWrite) {
    return (
      <View
        style={[styles.wrap, { backgroundColor: colors.background }]}
        testID="customer-new-screen"
      >
        <StackHeader title="Yeni cari" />
        <EmptyState
          icon={<UserIcon size={30} color={colors.textTertiary} />}
          title="Yetkiniz yok"
          description="Cari eklemek için müşteri yönetimi yetkisi gerekir."
        />
      </View>
    );
  }

  if (editState === "loading" || editState === "error") {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Cariyi düzenle" />
        {editState === "loading" ? (
          <FormSkeleton fields={5} label="Cari yükleniyor" />
        ) : (
          <EmptyState
            icon={<UserIcon size={30} color={colors.textTertiary} />}
            title="Cari açılamadı"
            description="Cari şu an okunamadı. Biraz sonra yeniden deneyin."
          />
        )}
      </View>
    );
  }

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.background }]}
      testID="customer-new-screen"
    >
      <StackHeader
        title={editId ? "Cariyi düzenle" : "Yeni cari"}
        subtitle={editId ? name || undefined : "Müşteri ya da tedarikçi"}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <HeroCard tone="emerald">
            <View style={styles.heroRow}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{initials(name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {name.trim() || "Yeni cari"}
                </Text>
                <Text style={styles.heroSub} numberOfLines={1}>
                  {ROLE_LABELS[role]} ·{" "}
                  {kind === "company" ? "Kurumsal" : "Bireysel"}
                </Text>
              </View>
            </View>
            {opening ? (
              <View style={styles.heroFoot}>
                <Text style={styles.heroFootText}>
                  {opening > 0 ? "Açılışta alacağınız" : "Açılışta borcunuz"}
                </Text>
                <Text
                  style={[
                    styles.heroFootValue,
                    tabular,
                    opening > 0 && { color: ON_HERO.live },
                  ]}
                  numberOfLines={1}
                >
                  {formatTry(Math.abs(opening))}
                </Text>
              </View>
            ) : null}
          </HeroCard>

          <SectionTitle title="Kimlik" />
          <View style={styles.fields}>
            <View>
              <Text
                style={[
                  type.callout,
                  { color: colors.textSecondary, fontWeight: "600" },
                ]}
              >
                Cari türü
              </Text>
              <OptionChips
                testIDPrefix="party-role"
                options={ROLE_OPTIONS}
                value={role}
                onChange={setRole}
              />
            </View>
            <View>
              <Text
                style={[
                  type.callout,
                  { color: colors.textSecondary, fontWeight: "600" },
                ]}
              >
                Kişi / kurum
              </Text>
              <OptionChips
                testIDPrefix="party-kind"
                options={KIND_OPTIONS}
                value={kind}
                onChange={setKind}
              />
            </View>
            <FormField
              testID="party-name"
              label={kind === "company" ? "Firma unvanı" : "Ad soyad"}
              value={name}
              onChangeText={setName}
              placeholder={
                kind === "company"
                  ? "Örn. Örnek Ticaret A.Ş."
                  : "Örn. Ayşe Yılmaz"
              }
              maxLength={120}
              autoCapitalize="words"
              error={errors.name}
            />
            <FormField
              testID="party-tax-no"
              label={
                kind === "company"
                  ? "Vergi numarası (isteğe bağlı)"
                  : "TC kimlik / vergi numarası (isteğe bağlı)"
              }
              value={taxNo}
              onChangeText={(t) => setTaxNo(t.replace(/\D/g, "").slice(0, 11))}
              placeholder={kind === "company" ? "10 hane" : "11 hane"}
              keyboardType="number-pad"
              maxLength={11}
            />
            <FormField
              testID="party-tax-office"
              label="Vergi dairesi (isteğe bağlı)"
              value={taxOffice}
              onChangeText={setTaxOffice}
              placeholder="Örn. Kadıköy"
              maxLength={60}
            />
          </View>

          <SectionTitle title="İletişim" />
          <View style={styles.fields}>
            <FormField
              testID="party-phone"
              label="Telefon (isteğe bağlı)"
              value={phone}
              onChangeText={setPhone}
              placeholder="05xx xxx xx xx"
              keyboardType="phone-pad"
              maxLength={20}
            />
            <FormField
              testID="party-email"
              label="E-posta (isteğe bağlı)"
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@firma.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={120}
              error={errors.email}
            />
            <FormField
              testID="party-address"
              label="Adres (isteğe bağlı)"
              value={address}
              onChangeText={setAddress}
              placeholder="Mahalle, cadde, numara"
              multiline
              maxLength={300}
            />
            <View style={styles.pair}>
              <FormField
                style={{ flex: 1 }}
                testID="party-district"
                label="İlçe"
                value={district}
                onChangeText={setDistrict}
                placeholder="İlçe"
                maxLength={40}
              />
              <FormField
                style={{ flex: 1 }}
                testID="party-city"
                label="İl"
                value={city}
                onChangeText={setCity}
                placeholder="İl"
                maxLength={40}
              />
            </View>
          </View>

          <SectionTitle title="Finans" />
          <View style={styles.fields}>
            {!editId ? (
              <FormField
                testID="party-opening"
                label="Açılış bakiyesi (isteğe bağlı)"
                value={openingText}
                onChangeText={setOpeningText}
                placeholder="0,00"
                keyboardType="decimal-pad"
                suffix="TRY"
                error={errors.opening}
                hint="Bu cariyle daha önceden kalan bir bakiye varsa yazın."
              />
            ) : null}
            {!editId && openingAbs ? (
              <OptionChips
                testIDPrefix="party-direction"
                options={DIRECTION_OPTIONS}
                value={direction}
                onChange={setDirection}
              />
            ) : null}
            <FormField
              testID="party-iban"
              label="IBAN (isteğe bağlı)"
              value={iban}
              onChangeText={setIban}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={34}
            />
            <FormField
              testID="party-notes"
              label="Not (isteğe bağlı)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Bu cariyle ilgili notunuz"
              multiline
              maxLength={300}
            />
            {uncertain ? (
              <Text
                testID="party-uncertain"
                style={[type.callout, { color: colors.amber }]}
              >
                Önceki gönderimin sonucu alınamadı. Cari kaydedilmiş olabilir;
                yeniden göndermeden önce cari listesini kontrol edin.
              </Text>
            ) : null}
            <Button
              testID="party-submit"
              label={uncertain ? "Cariyi yeniden gönder" : editId ? "Değişiklikleri kaydet" : "Cariyi kaydet"}
              busy={busy}
              onPress={submit}
              style={{ marginTop: spacing.xs }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  fields: { marginHorizontal: spacing.lg, gap: spacing.md },
  pair: { flexDirection: "row", gap: spacing.sm },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ON_HERO.faint,
  },
  heroAvatarText: { color: ON_HERO.text, fontSize: 17, fontWeight: "800" },
  heroName: {
    color: ON_HERO.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  heroSub: {
    color: ON_HERO.soft,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: ON_HERO.faint,
  },
  heroFootText: {
    flex: 1,
    color: ON_HERO.soft,
    fontSize: 12,
    fontWeight: "500",
  },
  heroFootValue: { color: ON_HERO.text, fontSize: 15, fontWeight: "700" },
});
