// Dalga 3 / C2 — borç ödeme. Web: components/expenses/PayablePaymentDialog.jsx.
// Kalan tutar ve önceki ödemeler SUNUCUDAN okunur; tutar dize olarak gider. Hesap önceden seçilmez; yalnız borcun para
// birimindeki kasa/banka hesapları listelenir. Ağ hatası / 5xx sonrası aynı işlem anahtarıyla yeniden gönderilir (ödeme
// ikinci kez işlenmez); kesin ret (4xx, 429 hariç) sonrası anahtar yenilenir. PAYMENT_LEDGER_CONFLICT'te yeniden gönderim yok.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getPickableAccounts, newIdempotencyKey } from "../../src/api";
import {
  addPayablePayment,
  decimalText,
  getPayableInfo,
  istanbulToday,
  toMinor,
  type PayableInfo,
} from "../../src/api-gider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { AccountOption } from "../../src/components/AccountOption";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, WalletIcon } from "../../src/components/Icons";
import { Skeleton } from "../../src/components/Skeleton";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { runVoidCollection } from "../../src/collection-flow";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount } from "../../src/types";

const curOf = (c: unknown) => {
  const v =
    String(c || "")
      .trim()
      .toUpperCase() || "TRY";
  return v === "TRL" ? "TRY" : v;
};
// Kuruş → "1250.50"
const fixed2 = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
const shiftDay = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};
// "YYYY-AA-GG" → "GG.AA.YYYY" (tarih alanının biçimi).
const trDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
// "GG.AA.YYYY" ya da "YYYY-AA-GG" → "YYYY-AA-GG"; geçersizse "".
function parseDateInput(text: string): string {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const LEDGER_BLOCKED = new Set<string>();

export default function PayablePayScreen() {
  const params = useLocalSearchParams<{ ref: string; title?: string }>();
  const ref = String(params.ref || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm: ask } = useFeedback();
  const mayWrite = canManage(user, "billing");

  const [info, setInfo] = useState<PayableInfo | null>(null);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [amountText, setAmountText] = useState("");
  const today = istanbulToday();
  const [dateText, setDateText] = useState(trDate(today));
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // PAYMENT_LEDGER_CONFLICT görülen borç bu oturumda yeniden ödenmez (ekran kapanıp açılsa da).
  const [blocked, setBlocked] = useState(() => LEDGER_BLOCKED.has(ref));
  // Sonucu bilinmeyen gönderimden sonra (ağ hatası / 5xx) alanlar kilitlenir: yalnız AYNI gövde, AYNI anahtarla yeniden
  // gönderilebilir. Aksi halde farklı tutarla ikinci bir ödeme yazılabilirdi.
  const [uncertain, setUncertain] = useState(false);
  const keyRef = useRef(newIdempotencyKey("pay"));
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (!token || !ref) return;
    setState("loading");
    try {
      const [p, acc] = await Promise.all([
        getPayableInfo(token, ref),
        getPickableAccounts(token),
      ]);
      setInfo(p);
      setAccounts(
        acc.filter((a) => a && a.id && curOf(a.currency) === p.currency),
      );
      // Kalan tutar önerilir (web ile aynı); kullanıcı kısmi ödeme için değiştirebilir.
      setAmountText(
        (prev) =>
          prev ||
          Number(p.remaining).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
      );
      setState("ready");
    } catch (e: any) {
      setLoadError(
        e?.status === 404
          ? "Bu borç için ödeme eklenemiyor."
          : "Borç bilgisi şu anda okunamadı. Biraz sonra yeniden deneyin.",
      );
      setState("error");
    }
  }, [token, ref]);

  useEffect(() => {
    load();
  }, [load]);

  const currency = info?.currency || "TRY";
  // Tutar dize olarak ayrıştırılır ve kuruşa çevrilir; float'a girilmez (en çok 2 ondalık, fazlası reddedilir).
  const amountStr = decimalText(amountText, 2);
  const minor = amountStr !== null ? toMinor(amountStr) : null;
  const amount = minor !== null ? minor / 100 : null;
  const remainingMinor = info ? toMinor(info.remaining) : null;
  const date = parseDateInput(dateText);
  const amountErr = !tried
    ? undefined
    : minor === null || minor <= 0
      ? "Geçerli bir tutar girin: en çok 2 ondalık, ör. 1.234,56."
      : remainingMinor !== null && minor > remainingMinor
        ? `Tutar kalan borçtan büyük olamaz (kalan ${formatMoney(info!.remaining, currency)}).`
        : undefined;
  const dateErr =
    tried && (!date || date > today)
      ? "Ödeme tarihi bugün ya da daha önce olmalı (GG.AA.YYYY)."
      : undefined;
  const accountErr =
    tried && !accountId ? "Ödemenin çıkacağı hesabı seçin." : "";
  const selected = useMemo(
    () => accounts.find((a) => a.id === accountId) || null,
    [accounts, accountId],
  );

  const submit = async () => {
    setTried(true);
    setError("");
    if (!token || busy.current || !info?.canPay || blocked) return;
    if (
      minor === null ||
      minor <= 0 ||
      (remainingMinor !== null && minor > remainingMinor) ||
      !accountId ||
      !date ||
      date > today
    )
      return;
    busy.current = true;
    setSaving(true);
    try {
      await addPayablePayment(token, ref, {
        amount: fixed2(minor),
        date,
        account_id: accountId,
        idempotency_key: keyRef.current,
        note,
      });
      toast("Ödeme kaydedildi.", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/expenses");
    } catch (e: any) {
      const status = Number(e?.status || 0);
      if (e?.code === "PAYMENT_LEDGER_CONFLICT") {
        LEDGER_BLOCKED.add(ref);
        setBlocked(true);
      } else if (e?.code === "PAYMENT_IDEMPOTENCY_CONFLICT") {
        // Aynı anahtar farklı gövdeyle gitti: önceki gönderim işlenmiş olabilir. Anahtar yenilenmez; borç yeniden okunur.
        setUncertain(true);
        load();
      } else if (status === 0 || status >= 500) {
        setUncertain(true);
      } else if (status >= 400 && status < 500 && status !== 429) {
        keyRef.current = newIdempotencyKey("pay");
        setUncertain(false);
      }
      setError(
        status === 404
          ? "Ödeme özelliği şu anda kullanılamıyor."
          : status >= 400 && status < 500 && e?.message
            ? e.message
            : "Ödeme kaydedilemedi. Tekrar deneyebilirsiniz; aynı ödeme ikinci kez işlenmez.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  // Önceki ödemeler (15 Kas 2026 ödeme silme): sunucu can_void verirse "Sil" (ters kayıt; fatura tekrar ödenecek olur).
  const voidPayment = async (p: PayableInfo["items"][number]) => {
    if (!token || !info) return;
    const changed = await runVoidCollection({
      token,
      c: { type: "payable", id: p.id, payable_ref: ref, amount: p.amount, date: p.date, currency: p.currency },
      currency: p.currency,
      confirm: ask,
      toast,
    });
    if (changed) load();
  };
  const paymentsList =
    info && (info.items.length || info.voidedItems.length) ? (
      <>
        <SectionTitle title="Ödemeler" />
        <Card style={styles.block}>
          {info.items.map((p, i) => (
            <View key={p.id || i} testID={`payable-payment-${p.id}`} style={[styles.prev, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                {[formatDate(p.date), p.account_name || null, p.completed ? null : "kayıt tamamlanıyor"].filter(Boolean).join(" · ")}
              </Text>
              <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "600" }]}>{formatMoney(p.amount, p.currency)}</Text>
              {p.canVoid ? <Button testID={`payable-payment-${p.id}-void`} size="sm" variant="ghost" label="Sil" onPress={() => voidPayment(p)} /> : null}
            </View>
          ))}
          {info.voidedItems.map((p, i) => (
            <View
              key={`v-${p.id || i}`}
              testID={`payable-voided-${p.id}`}
              style={[styles.prev, (info.items.length > 0 || i > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            >
              <Text style={[type.callout, { color: colors.textTertiary, flex: 1 }]} numberOfLines={1}>
                {[formatDate(p.date), p.account_name || null, "Ödeme silindi"].filter(Boolean).join(" · ")}
              </Text>
              <Text style={[type.callout, tabular, { color: colors.textTertiary, textDecorationLine: "line-through" }]}>{formatMoney(p.amount, p.currency)}</Text>
            </View>
          ))}
        </Card>
      </>
    ) : null;

  const body = () => {
    if (!mayWrite)
      return (
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="Yetkiniz yok"
          description="Borç ödemesi için fatura ve kasa yönetimi yetkisi gerekir."
        />
      );
    if (state === "loading")
      return (
        <View
          style={{ padding: spacing.lg, gap: spacing.md }}
          accessibilityLabel="Borç bilgisi yükleniyor"
        >
          <Skeleton height={150} borderRadius={radius.xl} />
          <Skeleton height={56} borderRadius={radius.md} />
          <Skeleton height={56} borderRadius={radius.md} />
        </View>
      );
    if (state === "error" || !info)
      return (
        <EmptyState
          icon={<AlertIcon size={30} color={colors.error} />}
          title="Borç okunamadı"
          description={loadError}
          actionLabel="Tekrar dene"
          onAction={load}
        />
      );
    if (!info.canPay)
      return (
        <ScrollView contentContainerStyle={styles.body}>
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="Ödeme eklenemez"
          description={
            info.status === "reversed"
              ? "Bu fatura geri alınmış; ödeme eklenemez."
              : info.status === "paid"
                ? "Bu borcun tamamı ödenmiş."
                : "Bu faturanın içeri alınması henüz tamamlanmadı; ödeme eklenemez."
          }
        />
        {paymentsList}
        </ScrollView>
      );
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <HeroCard tone="violet">
            <Text style={styles.heroLabel}>Ödenecek tutar</Text>
            <Text
              testID="pay-amount-preview"
              style={[styles.heroValue, tabular]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(amount || 0, currency)}
            </Text>
            <View style={styles.heroFacts}>
              {[
                ["Borç", info.total],
                ["Ödenen", info.paid],
                ["Kalan", info.remaining],
              ].map(([k, v]) => (
                <View key={k} style={styles.heroFact}>
                  <Text style={styles.heroFactLabel}>{k}</Text>
                  <Text
                    style={[styles.heroFactValue, tabular]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatMoney(v, currency)}
                  </Text>
                </View>
              ))}
            </View>
          </HeroCard>

          {paymentsList}

          <View style={styles.form}>
            <FormField
              testID="pay-amount"
              label={`Tutar (${currency})`}
              value={amountText}
              onChangeText={setAmountText}
              editable={!uncertain}
              keyboardType="decimal-pad"
              placeholder="0,00"
              error={amountErr}
            />
            <View style={{ gap: spacing.xs }}>
              <FormField
                testID="pay-date"
                label="Ödeme tarihi"
                value={dateText}
                onChangeText={setDateText}
                editable={!uncertain}
                placeholder="GG.AA.YYYY"
                error={dateErr}
              />
              {/* ChipRow kendi yatay boşluğunu taşır; form boşluğuyla üst üste binmesin. */}
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow>
                  <Chip
                    testID="pay-date-today"
                    label="Bugün"
                    selected={date === today}
                    onPress={() => !uncertain && setDateText(trDate(today))}
                  />
                  <Chip
                    testID="pay-date-yesterday"
                    label="Dün"
                    selected={date === shiftDay(today, -1)}
                    onPress={() => !uncertain && setDateText(trDate(shiftDay(today, -1)))}
                  />
                </ChipRow>
              </View>
            </View>
          </View>

          <SectionTitle title="Kasa / banka hesabı" />
          {accounts.length === 0 ? (
            <Card padded style={styles.block}>
              <Text style={[type.body, { color: colors.amber }]}>
                {currency} para biriminde kasa/banka hesabınız yok. Önce Kasa ve
                Bankalar ekranından bir {currency} hesabı ekleyin.
              </Text>
            </Card>
          ) : (
            <Card style={styles.block}>
              <View accessibilityRole="radiogroup">
                {accounts.map((a, i) => (
                  <AccountOption
                    key={a.id}
                    testID={`pay-account-${a.id}`}
                    account={a}
                    selected={a.id === accountId}
                    divider={i > 0}
                    onPress={() => !uncertain && setAccountId(a.id)}
                  />
                ))}
              </View>
            </Card>
          )}
          {accountErr ? (
            <Text style={[type.caption, styles.err, { color: colors.error }]}>
              {accountErr}
            </Text>
          ) : null}

          <View style={styles.form}>
            <FormField
              testID="pay-note"
              label="Not (isteğe bağlı)"
              value={note}
              onChangeText={setNote}
              editable={!uncertain}
              maxLength={200}
              placeholder="Ör. havale açıklaması"
            />
            <Text style={[type.caption, { color: colors.textTertiary }]}>
              Ödeme, seçtiğiniz hesaptan para çıkışı olarak Kasa ve Bankalar'a
              da işlenir. Gider tutarı değişmez.
            </Text>
            {uncertain ? (
              <View style={[styles.errorBox, { backgroundColor: colors.warningBg }]} testID="pay-uncertain">
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Önceki gönderimin sonucu alınamadı; ödeme kaydedilmiş olabilir. Bilgiler kilitlendi: aynı ödemeyi yeniden
                  gönderebilirsiniz, ikinci kez işlenmez. Önceki ödemeler listesinde görünüyorsa ekranı kapatın.
                </Text>
              </View>
            ) : null}
            {error ? (
              <View
                style={[styles.errorBox, { backgroundColor: colors.errorBg }]}
                testID="pay-error"
                accessibilityRole="alert"
              >
                <AlertIcon size={16} color={colors.error} />
                <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>
                  {error}
                </Text>
              </View>
            ) : null}
            {accounts.length && !blocked ? (
              <Button
                testID="pay-submit"
                label={
                  saving
                    ? "Kaydediliyor…"
                    : selected
                      ? `${selected.name} hesabından öde`
                      : "Ödemeyi kaydet"
                }
                icon={<WalletIcon size={18} color="#FFFFFF" />}
                busy={saving}
                onPress={submit}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.background }]}
      testID="pay-screen"
    >
      <StackHeader
        title="Ödeme ekle"
        subtitle={params.title ? String(params.title) : undefined}
      />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: {
    color: ON_HERO.text,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 2,
  },
  heroFacts: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: ON_HERO.faint,
  },
  heroFact: { flex: 1, minWidth: 0 },
  heroFactLabel: { color: ON_HERO.soft, fontSize: 12 },
  heroFactValue: {
    color: ON_HERO.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  prev: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  form: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  err: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  errorBox: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "flex-start",
    padding: spacing.sm,
    borderRadius: radius.md,
  },
});
