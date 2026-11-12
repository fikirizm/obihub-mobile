import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { ACCOUNT_CURRENCIES, ACCOUNT_TYPE_OPTIONS, createCashAccount, isUncertainWrite, type AccountType } from "../../src/api-finans";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { BagIcon, CheckIcon, HomeIcon, ReceiptIcon, TagIcon, WalletIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { Button } from "../../src/ui/Button";
import { parseAmount, useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { SectionTitle } from "../../src/ui/ListRow";

const TYPE_ICONS: Record<AccountType, typeof WalletIcon> = {
  cash: WalletIcon,
  bank: HomeIcon,
  pos: ReceiptIcon,
  credit_card: TagIcon,
  marketplace: BagIcon,
  other: WalletIcon,
};

const NAME_PLACEHOLDER: Record<AccountType, string> = {
  cash: "Örn. Merkez Kasa",
  bank: "Örn. Garanti Ticari",
  pos: "Örn. PayTR Sanal POS",
  credit_card: "Örn. Şirket Kartı",
  marketplace: "Örn. Trendyol Hakediş",
  other: "Hesap adı",
};

const SIGN_OPTIONS = [
  { value: "plus", label: "Artı bakiye" },
  { value: "minus", label: "Eksi bakiye (borç)" },
] as const;

export default function NewCashAccountScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [accountType, setAccountType] = useState<AccountType>("cash");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<string>("TRY");
  const [openingText, setOpeningText] = useState("");
  const [sign, setSign] = useState<"plus" | "minus">("plus");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [provider, setProvider] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [settlementText, setSettlementText] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Önceki gönderimin sonucu belirsiz kaldıysa (yanıt alınamadı) doğrudur; yeniden gönderim ayrıca onaylatılır.
  const [uncertain, setUncertain] = useState(false);

  const isBank = accountType === "bank";
  const isCard = accountType === "credit_card";
  const isProvider = accountType === "pos" || accountType === "marketplace";
  const typeLabel = ACCOUNT_TYPE_OPTIONS.find((t) => t.value === accountType)?.label || "";

  // Boş açılış bakiyesi sıfır sayılır (web formu ile aynı).
  const openingAbs = openingText.trim() === "" ? 0 : parseAmount(openingText, true);
  const opening = openingAbs === null ? null : sign === "minus" && openingAbs > 0 ? -openingAbs : openingAbs;
  const settlement = settlementText.trim() === "" ? 0 : parseAmount(settlementText, false);
  const errors = {
    name: tried && !name.trim() ? "Hesap adı zorunludur." : undefined,
    opening: tried && opening === null ? "Geçerli bir tutar girin: en çok 2 ondalık, ör. 1.234,56." : undefined,
    settlement: tried && (settlement === null || settlement > 365) ? "Valör 0 ile 365 gün arasında olmalıdır." : undefined,
  };

  const submit = async () => {
    setTried(true);
    if (!token || !name.trim() || opening === null || settlement === null || settlement > 365 || sending.current) return;
    const ok = await confirm({
      title: uncertain ? "Hesap yeniden gönderilsin mi?" : "Hesap oluşturulsun mu?",
      message:
        (uncertain ? "Önceki gönderimin sonucu alınamadı; hesap oluşturulmuş olabilir. Hesap listesinde görünüyorsa yeniden göndermeyin, aksi halde aynı hesap iki kez açılır.\n" : "") +
        `${name.trim()} · ${typeLabel} · ${currency}\nAçılış bakiyesi: ${formatMoney(opening, currency)}`,
      confirmLabel: uncertain ? "Yine de gönder" : "Hesabı oluştur",
      destructive: uncertain,
    });
    if (!ok || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await createCashAccount(token, {
        name,
        account_type: accountType,
        currency,
        opening_balance: opening,
        bank_name: isBank || isCard ? bankName : "",
        iban: isBank ? iban : "",
        provider: isProvider ? provider : "",
        card_last4: isCard ? cardLast4 : "",
        settlement_days: accountType === "pos" ? settlement : 0,
      });
      toast("Hesap oluşturuldu", "success");
      router.back();
    } catch (e: any) {
      if (isUncertainWrite(e)) {
        setUncertain(true);
        toast("Sonuç alınamadı. Hesap oluşturulmuş olabilir; hesap listesini kontrol edin.", "error");
      } else {
        toast(e?.message || "Hesap oluşturulamadı.", "error");
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (!canManage(user, "billing")) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-new-screen">
        <StackHeader title="Yeni hesap" />
        <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Hesap eklemek için fatura ve kasa yönetimi yetkisi gerekir." />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-new-screen">
      <StackHeader title="Yeni hesap" subtitle="Kasa, banka, kart" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="emerald">
            <Text style={styles.heroLabel}>{typeLabel} · {currency}</Text>
            <Text style={styles.heroName} numberOfLines={1}>
              {name.trim() || "Yeni hesap"}
            </Text>
            <View style={styles.heroFoot}>
              <Text style={styles.heroFootText}>Açılış bakiyesi</Text>
              <Text testID="account-opening-preview" style={[styles.heroFootValue, tabular]} numberOfLines={1}>
                {formatMoney(opening ?? 0, currency)}
              </Text>
            </View>
          </HeroCard>

          <SectionTitle title="Hesap türü" />
          <View style={styles.typeGrid} accessibilityRole="radiogroup">
            {ACCOUNT_TYPE_OPTIONS.map((t) => {
              const active = t.value === accountType;
              const Icon = TYPE_ICONS[t.value];
              return (
                <PressableScale
                  key={t.value}
                  testID={`account-type-${t.value}`}
                  onPress={() => setAccountType(t.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${t.label}, ${t.hint}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.typeCard, { backgroundColor: active ? colors.emeraldSoft : colors.surface, borderColor: active ? colors.emerald : colors.border }]}
                >
                  <View style={styles.typeHead}>
                    <View style={[styles.typeIcon, { backgroundColor: active ? colors.emerald : colors.surfaceMuted }]}>
                      <Icon size={18} color={active ? colors.surface : colors.textSecondary} />
                    </View>
                    {active ? <CheckIcon size={16} color={colors.emerald} /> : null}
                  </View>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary, marginTop: spacing.xs }]} numberOfLines={1}>
                    {t.label}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                    {t.hint}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.fields}>
            <FormField testID="account-name" label="Hesap adı" value={name} onChangeText={setName} placeholder={NAME_PLACEHOLDER[accountType]} maxLength={80} error={errors.name} />

            <View>
              <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Para birimi</Text>
              <OptionChips testIDPrefix="account-currency" options={ACCOUNT_CURRENCIES.map((c) => ({ value: c as string, label: c }))} value={currency} onChange={setCurrency} />
            </View>

            <FormField
              testID="account-opening"
              label="Açılış bakiyesi (isteğe bağlı)"
              value={openingText}
              onChangeText={setOpeningText}
              placeholder="0,00"
              keyboardType="decimal-pad"
              suffix={currency}
              error={errors.opening}
            />
            <OptionChips testIDPrefix="account-sign" options={SIGN_OPTIONS} value={sign} onChange={setSign} />

            {isBank || isCard ? <FormField testID="account-bank" label="Banka (isteğe bağlı)" value={bankName} onChangeText={setBankName} placeholder="Banka adı" maxLength={60} /> : null}
            {isBank ? (
              <FormField testID="account-iban" label="IBAN (isteğe bağlı)" value={iban} onChangeText={setIban} placeholder="TR00 0000 0000 0000 0000 0000 00" autoCapitalize="characters" autoCorrect={false} maxLength={34} />
            ) : null}
            {isProvider ? (
              <FormField testID="account-provider" label="Sağlayıcı / pazaryeri (isteğe bağlı)" value={provider} onChangeText={setProvider} placeholder="PayTR, iyzico, Trendyol…" maxLength={60} />
            ) : null}
            {isCard ? (
              <FormField
                testID="account-card-last4"
                label="Kartın son 4 hanesi (isteğe bağlı)"
                value={cardLast4}
                onChangeText={(t) => setCardLast4(t.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                keyboardType="number-pad"
                maxLength={4}
              />
            ) : null}
            {accountType === "pos" ? (
              <FormField
                testID="account-settlement"
                label="Valör (gün, isteğe bağlı)"
                value={settlementText}
                onChangeText={(t) => setSettlementText(t.replace(/\D/g, "").slice(0, 3))}
                placeholder="0"
                keyboardType="number-pad"
                maxLength={3}
                error={errors.settlement}
              />
            ) : null}

            {uncertain ? (
              <Text testID="account-uncertain" style={[type.callout, { color: colors.amber }]}>
                Önceki gönderimin sonucu alınamadı. Hesap oluşturulmuş olabilir; yeniden göndermeden önce hesap listesini kontrol edin.
              </Text>
            ) : null}
            <Button testID="account-submit" label={uncertain ? "Hesabı yeniden gönder" : "Hesabı oluştur"} busy={busy} onPress={submit} style={{ marginTop: spacing.xs }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  fields: { marginHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.md },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginHorizontal: spacing.lg },
  typeCard: { width: "48.5%", borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, minHeight: 104 },
  typeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroName: { color: ON_HERO.text, fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroFootText: { flex: 1, color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  heroFootValue: { color: ON_HERO.text, fontSize: 15, fontWeight: "700" },
});
