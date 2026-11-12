// Aşama 4 / P11 — tahsilatı düzenle (C2 kalıbı: expenses/pay.tsx).  Web: components/money/CollectionActions.jsx CollectionEditDialog.
// PATCH …/payments/{id} + Idempotency-Key.  Yalnız not/yöntem değişirse yerinde; tutar/tarih/hesap değişirse sunucu eskisini geri alıp
// yenisini yazar.  Tutar dize gider (float yok).  Belirsiz sonuçta (ağ / 5xx / MONEY_INCOMPLETE) alanlar kilitlenir, AYNI anahtar ve gövdeyle
// yeniden gönderilir; kesin ret (4xx) sonrası anahtar yenilenir; MONEY_PENDING / OPERATION_PENDING / MONEY_PARTIAL'da yeniden gönderim yok.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getCashAccounts, newIdempotencyKey } from "../../src/api";
import { accountsForCurrency, editCollection } from "../../src/api-finans";
import { decimalText, istanbulToday } from "../../src/api-gider";
import {
  collectionDoneText,
  collectionEditBody,
  collectionEditInPlace,
  collectionErrorText,
  collectionMethods,
  collectionWarnings,
  collectionWriteKind,
  EDIT_TEXT,
  PARASUT_TEXT,
  type Collection,
} from "../../src/collection-actions";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { AccountOption } from "../../src/components/AccountOption";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, WalletIcon } from "../../src/components/Icons";
import { Skeleton } from "../../src/components/Skeleton";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { SummaryHero } from "../../src/ui/SummaryHero";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount } from "../../src/types";

const trDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
function parseDateInput(text: string): string {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
const shiftDay = (iso: string, days: number) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
};
const trAmount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};

function parseCollection(raw: unknown): Collection | null {
  try {
    const c = JSON.parse(String(raw || ""));
    return c && typeof c.id === "string" && (c.type === "customer" || c.type === "invoice") ? (c as Collection) : null;
  } catch {
    return null;
  }
}

export default function CollectionEditScreen() {
  const params = useLocalSearchParams<{ c: string; currency?: string; title?: string }>();
  const c = useMemo(() => parseCollection(params.c), [params.c]);
  const currency = String(params.currency || c?.currency || "TRY").toUpperCase().replace("TRL", "TRY");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const mayWrite = canManage(user, "billing") || canManage(user, "customers");
  const methods = c ? collectionMethods(c.type) : [];

  const [accounts, setAccounts] = useState<CashAccount[] | null>(null);
  const [amountText, setAmountText] = useState(() => trAmount(c?.amount));
  const [dateText, setDateText] = useState(() => trDate(String(c?.date || "").slice(0, 10)));
  const [method, setMethod] = useState(() => (c && methods.some((m) => m.value === c.method) ? String(c.method) : methods[0]?.value || "nakit"));
  const [note, setNote] = useState(c?.note || "");
  const [accountId, setAccountId] = useState(c?.account_id || "");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const keyRef = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!token) return;
    let on = true;
    getCashAccounts(token)
      .then((items) => on && setAccounts(accountsForCurrency(items, currency)))
      .catch(() => on && setAccounts([]));
    return () => {
      on = false;
    };
  }, [token, currency]);

  const today = istanbulToday();
  const amountStr = decimalText(amountText, 2);
  const date = parseDateInput(dateText);
  const amountErr = tried && (amountStr === null || !(Number(amountStr) > 0)) ? "Geçerli bir tutar girin: en çok 2 ondalık, ör. 1.250,50." : undefined;
  const dateErr = tried && !date ? "Geçerli bir tarih girin (GG.AA.YYYY)." : undefined;
  const inPlace = c && amountStr !== null ? collectionEditInPlace(c, { amount: amountStr, date, accountId }) : false;
  const currentMissing = Boolean(accountId) && accounts !== null && !accounts.some((a) => a.id === accountId);

  const submit = async () => {
    setTried(true);
    setError("");
    if (!token || !c || busy.current || blocked) return;
    if (amountStr === null || !(Number(amountStr) > 0) || !date) return;
    busy.current = true;
    setSaving(true);
    if (!keyRef.current) keyRef.current = newIdempotencyKey("edit");
    try {
      const res = await editCollection(token, c, collectionEditBody(c, { amount: amountStr, date, method, note, accountId }), keyRef.current);
      keyRef.current = null;
      toast([collectionDoneText("edit", res), ...collectionWarnings(res)].join(" "), "success");
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      const kind = collectionWriteKind(e);
      if (kind === "rejected") {
        keyRef.current = null;
        setLocked(false);
      } else if (kind === "uncertain" || kind === "conflict") setLocked(true);
      else setBlocked(true);
      setError(collectionErrorText(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const body = () => {
    if (!c)
      return <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Tahsilat okunamadı" description="Ekranı kapatıp listeden yeniden açın." />;
    if (!mayWrite)
      return <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Tahsilat düzenlemek için fatura ya da cari yönetimi yetkisi gerekir." />;
    const editable = !locked && !blocked && !saving;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SummaryHero
            testID="collection-edit-preview"
            tone="emerald"
            label="Yeni tutar"
            value={formatMoney(amountStr !== null ? Number(amountStr) : 0, currency)}
            facts={[
              { label: "Kayıtlı tutar", value: formatMoney(Number(c.amount || 0), currency) },
              { label: "Tarih", value: c.date ? formatDate(c.date) : "—" },
              ...(c.type === "invoice" && c.invoice_number ? [{ label: "Fatura", value: c.invoice_number }] : []),
            ]}
          />

          <View style={styles.form}>
            <Text style={[type.footnote, { color: colors.textSecondary }]}>{EDIT_TEXT}</Text>
            <FormField
              testID="collection-edit-amount"
              label={`Tutar (${currency})`}
              value={amountText}
              onChangeText={setAmountText}
              editable={editable}
              keyboardType="decimal-pad"
              placeholder="0,00"
              error={amountErr}
            />
            <View style={{ gap: spacing.xs }}>
              <FormField testID="collection-edit-date" label="Tarih" value={dateText} onChangeText={setDateText} editable={editable} placeholder="GG.AA.YYYY" error={dateErr} />
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow>
                  <Chip label="Bugün" selected={date === today} onPress={() => editable && setDateText(trDate(today))} />
                  <Chip label="Dün" selected={date === shiftDay(today, -1)} onPress={() => editable && setDateText(trDate(shiftDay(today, -1)))} />
                </ChipRow>
              </View>
            </View>
          </View>

          <SectionTitle title="Ödeme yöntemi" />
          <ChipRow>
            {methods.map((m) => (
              <Chip key={m.value} testID={`collection-edit-method-${m.value}`} label={m.label} selected={method === m.value} onPress={() => editable && setMethod(m.value)} />
            ))}
          </ChipRow>

          <SectionTitle title="Kasa / banka hesabı" />
          {accounts === null ? (
            <View style={styles.block}>
              <Skeleton height={60} borderRadius={radius.md} />
            </View>
          ) : accounts.length === 0 ? (
            <Card padded style={styles.block}>
              <Text style={[type.body, { color: colors.textSecondary }]}>{currency} para biriminde etkin bir hesap yok; tahsilat mevcut hesabında kalır.</Text>
            </Card>
          ) : (
            <Card style={styles.block}>
              <View accessibilityRole="radiogroup">
                {accounts.map((a, i) => (
                  <AccountOption key={a.id} testID={`collection-edit-account-${a.id}`} account={a} selected={a.id === accountId} divider={i > 0} onPress={() => editable && setAccountId(a.id)} />
                ))}
              </View>
            </Card>
          )}
          {currentMissing ? (
            <Text style={[type.caption, styles.err, { color: colors.textTertiary }]}>Kayıtlı hesap bu listede görünmüyor (pasif ya da farklı para birimi); seçim yapmazsanız korunur.</Text>
          ) : null}

          <View style={styles.form}>
            <FormField testID="collection-edit-note" label="Not (isteğe bağlı)" value={note} onChangeText={setNote} editable={editable} maxLength={200} />
            <Text testID="collection-edit-mode" style={[type.caption, { color: colors.textTertiary }]}>
              {inPlace ? "Yalnız not ve yöntem güncellenir; para kaydı değişmez." : "Eski tahsilat geri alınır, yeni bilgilerle yeniden yazılır."}
            </Text>
            {c.parasut ? (
              <View testID="collection-parasut-note" style={[styles.box, { backgroundColor: colors.infoBg }]}>
                <AlertIcon size={16} color={colors.info} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{PARASUT_TEXT}</Text>
              </View>
            ) : null}
            {locked ? (
              <View testID="collection-edit-uncertain" style={[styles.box, { backgroundColor: colors.warningBg }]}>
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Önceki gönderimin sonucu alınamadı; değişiklik kaydedilmiş olabilir. Bilgiler kilitlendi: aynı değişikliği yeniden gönderebilirsiniz, ikinci kez işlenmez.
                </Text>
              </View>
            ) : null}
            {error ? (
              <View testID="collection-edit-error" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.errorBg }]}>
                <AlertIcon size={16} color={colors.error} />
                <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{error}</Text>
              </View>
            ) : null}
            {blocked ? (
              <Button testID="collection-edit-close" variant="secondary" label="Kapat" onPress={() => router.canGoBack() && router.back()} />
            ) : (
              <Button
                testID="collection-edit-submit"
                label={saving ? "Kaydediliyor…" : locked ? "Yeniden gönder" : "Değişiklikleri kaydet"}
                icon={<WalletIcon size={18} color="#FFFFFF" />}
                busy={saving}
                onPress={submit}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="collection-edit-screen">
      <StackHeader title="Tahsilatı düzenle" subtitle={params.title ? String(params.title) : undefined} />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  err: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  box: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md },
});
