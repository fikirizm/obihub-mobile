// Aşama 4 / P8 — cari tahsilatı (C2 kalıbı).  Web: components/customers/CollectionDialogOS.jsx + CustomersPage.handleTahsilatSave.
// POST /customers/{id}/payments + Idempotency-Key.  Dağıtım: Otomatik (alan gönderilmez, sunucu en eski vadeden dağıtır) |
// Ben seçeyim (satır tutarları) | Avans olarak bırak (allocations: []).  K4: taslak faturalar listelenmez.
// Tutar dize gider; belirsiz sonuçta alanlar kilitlenir ve AYNI anahtarla yeniden gönderilir (src/useMoneyWrite).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getCashAccounts } from "../../src/api";
import { accountsForCurrency, getAllocationState, type AllocationState } from "../../src/api-finans";
import { collectPartyPaymentCompat, istanbulToday } from "../../src/api-gider";
import {
  allocatableInvoices,
  allocationBody,
  allocationErrorText,
  autoFill,
  balanceNote,
  buildAllocations,
  collectAllocationError,
  collectDoneTexts,
  formatMinor,
  fromMinor,
  parseTrAmount,
  toMinor,
  toTrInput,
  type AllocationMode,
} from "../../src/allocation";
import { CUSTOMER_METHODS } from "../../src/collection-actions";
import { moneySubmitLabel, useMoneyWrite } from "../../src/useMoneyWrite";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { AccountOption } from "../../src/components/AccountOption";
import { AllocationRows } from "../../src/components/AllocationRows";
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
// Ekrandan gelen bakiye (sayı metni) → kuruş; float hatası olmasın diye 2 haneye sabitlenir.
const balanceMinor = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? toMinor(n.toFixed(2)) : null;
};
const MODES: { value: AllocationMode; label: string }[] = [
  { value: "auto", label: "Otomatik (en eski vade)" },
  { value: "manual", label: "Ben seçeyim" },
  { value: "advance", label: "Avans olarak bırak" },
];

export default function CustomerCollectScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; currency?: string; balance?: string }>();
  const id = String(params.id || "");
  const currency = String(params.currency || "TRY").toUpperCase().replace("TRL", "TRY");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const mayWrite = canManage(user, "customers") || canManage(user, "billing");
  const write = useMoneyWrite("party-pay", allocationErrorText);

  const due = useMemo(() => {
    const b = balanceMinor(params.balance);
    return b !== null && b > 0n ? b : null;
  }, [params.balance]);
  const [accounts, setAccounts] = useState<CashAccount[] | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);
  // null = yükleniyor; "error" = okunamadı (tahsilat otomatik dağıtımla kaydedilir).
  const [allocState, setAllocState] = useState<AllocationState | "error" | null>(null);
  const [amountText, setAmountText] = useState(() => (due ? toTrInput(fromMinor(due)) : ""));
  const today = istanbulToday();
  const [dateText, setDateText] = useState(trDate(today));
  const [method, setMethod] = useState("nakit");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<AllocationMode>("auto");
  const [values, setValues] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [allocError, setAllocError] = useState("");

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    try {
      const list = accountsForCurrency(await getCashAccounts(token), currency);
      setAccounts(list);
      setAccountsFailed(false);
      // Tek uygun hesap varsa o seçilir; birden çoksa kullanıcı seçer (sunucu belirsizde 400 ACCOUNT_REQUIRED döner).
      if (list.length === 1) setAccountId((prev) => prev || list[0].id);
    } catch {
      setAccounts([]);
      setAccountsFailed(true);
    }
  }, [token, currency]);
  const loadAllocation = useCallback(async () => {
    if (!token || !id) return;
    try {
      setAllocState(await getAllocationState(token, id));
    } catch {
      setAllocState("error");
    }
  }, [token, id]);
  useEffect(() => {
    loadAccounts();
    loadAllocation();
  }, [loadAccounts, loadAllocation]);

  const invoices = allocState && allocState !== "error" ? allocatableInvoices(allocState.open_invoices) : [];
  const advance = allocState && allocState !== "error" ? toMinor(allocState.advance) ?? 0n : 0n;
  const amountDot = parseTrAmount(amountText);
  const amt = amountDot ? toMinor(amountDot) : null;
  const date = parseDateInput(dateText);
  const alloc = buildAllocations(invoices, values, currency);
  const note$ = balanceNote(due, amt, currency);
  const amountErr = tried && (amt === null || amt <= 0n) ? "Geçerli bir tutar girin (ör. 1.250,50)." : undefined;
  const dateErr = tried && !date ? "Geçerli bir tarih girin (GG.AA.YYYY)." : undefined;
  const accountErr = tried && accounts && accounts.length > 0 && !accountId ? `${currency} para biriminde bir kasa veya banka hesabı seçin.` : "";
  const locked = write.locked || write.saving;

  const submit = async () => {
    setTried(true);
    if (!token || write.blocked) return;
    if (amt === null || amt <= 0n || !date) return;
    if (accounts === null) return;
    if (accounts.length > 0 && !accountId) return;
    const aErr = invoices.length ? collectAllocationError(mode, alloc, amt) : "";
    setAllocError(aErr);
    if (aErr) return;
    const body = {
      amount: fromMinor(amt),
      payment_method: method,
      note: note.trim() || undefined,
      payment_date: date,
      account_id: accountId || null,
      allocations: invoices.length ? allocationBody(mode, alloc.items) : undefined,
    };
    const out = await write.run((key) => collectPartyPaymentCompat(token, id, body, key));
    if (out.kind === "done") {
      toast(collectDoneTexts(out.result, currency).join(" "), "success");
      if (router.canGoBack()) router.back();
      return;
    }
    if (out.kind === "pending" || out.kind === "partial") toast(allocationErrorText(out.error), "info");
    // Fatura bu arada değiştiyse (kalan aşıldı / geçersiz dağıtım) liste yenilenir.
    if (["PAYMENT_EXCEEDS_REMAINING", "ALLOCATION_INVALID", "INVOICE_NOT_ISSUED"].includes(out.error?.code)) loadAllocation();
  };

  const body = () => {
    if (!mayWrite)
      return <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Tahsilat için cari ya da fatura yönetimi yetkisi gerekir." />;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SummaryHero
            testID="collect-amount-preview"
            tone="emerald"
            label="Tahsil edilecek"
            value={formatMinor(amt ?? 0n, currency)}
            facts={[
              { label: "Açık bakiye", value: formatMinor(due ?? 0n, currency) },
              { label: "Mevcut avans", value: formatMinor(advance, currency) },
            ]}
          />

          <View style={styles.form}>
            <FormField testID="collect-amount" label={`Tutar (${currency})`} value={amountText} onChangeText={setAmountText} editable={!locked} keyboardType="decimal-pad" placeholder="0,00" error={amountErr} />
            {due !== null ? (
              <View style={styles.inline}>
                <Button testID="collect-full" size="sm" variant="secondary" label="Tamamını tahsil et" disabled={locked} onPress={() => setAmountText(toTrInput(fromMinor(due)))} />
              </View>
            ) : null}
            {note$ ? (
              <Text testID="collect-balance-note" style={[type.footnote, { color: note$.tone === "ok" ? colors.success : colors.amber }]}>
                {note$.text}
              </Text>
            ) : null}
            <View style={{ gap: spacing.xs }}>
              <FormField testID="collect-date" label="Tarih" value={dateText} onChangeText={setDateText} editable={!locked} placeholder="GG.AA.YYYY" error={dateErr} />
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow>
                  <Chip label="Bugün" selected={date === today} onPress={() => !locked && setDateText(trDate(today))} />
                  <Chip label="Dün" selected={date === shiftDay(today, -1)} onPress={() => !locked && setDateText(trDate(shiftDay(today, -1)))} />
                </ChipRow>
              </View>
            </View>
          </View>

          <SectionTitle title="Ödeme yöntemi" />
          <ChipRow>
            {CUSTOMER_METHODS.map((m) => (
              <Chip key={m.value} testID={`collect-method-${m.value}`} label={m.label} selected={method === m.value} onPress={() => !locked && setMethod(m.value)} />
            ))}
          </ChipRow>

          <SectionTitle title="Kasa / banka hesabı" />
          {accounts === null ? (
            <View style={styles.block}>
              <Skeleton height={60} borderRadius={radius.md} />
            </View>
          ) : accounts.length === 0 ? (
            <Card padded style={styles.block}>
              <Text style={[type.body, { color: colors.amber }]}>
                {accountsFailed
                  ? "Hesaplar okunamadı; tahsilat varsayılan hesaba yazılır."
                  : `${currency} para biriminde kasa/banka hesabı görünmüyor; tahsilat varsayılan hesaba yazılır.`}
              </Text>
            </Card>
          ) : (
            <Card style={styles.block}>
              <View accessibilityRole="radiogroup">
                {accounts.map((a, i) => (
                  <AccountOption key={a.id} testID={`collect-account-${a.id}`} account={a} selected={a.id === accountId} divider={i > 0} onPress={() => !locked && setAccountId(a.id)} />
                ))}
              </View>
            </Card>
          )}
          {accountErr ? <Text style={[type.caption, styles.err, { color: colors.error }]}>{accountErr}</Text> : null}

          <SectionTitle title="Açık faturalara dağıt" />
          <View testID="collect-allocation">
            {allocState === null ? (
              <View style={[styles.block, { gap: spacing.sm }]}>
                <Skeleton height={14} width={160} />
                <Skeleton height={56} borderRadius={radius.md} />
              </View>
            ) : allocState === "error" ? (
              <Card padded style={styles.block}>
                <Text style={[type.footnote, { color: colors.textSecondary }]}>Açık faturalar okunamadı; tahsilat otomatik dağıtımla (en eski vadeden) kaydedilir.</Text>
              </Card>
            ) : !invoices.length ? (
              <Card padded style={styles.block}>
                <Text testID="collect-no-invoices" style={[type.footnote, { color: colors.textSecondary }]}>
                  {`Açık fatura yok; tahsilat cari hesapta avans olarak kalır.${advance > 0n ? ` Mevcut avans ${formatMinor(advance, currency)}.` : ""}`}
                </Text>
              </Card>
            ) : (
              <>
                <ChipRow>
                  {MODES.map((m) => (
                    <Chip key={m.value} testID={`collect-mode-${m.value}`} label={m.label} selected={mode === m.value} onPress={() => { if (!locked) { setMode(m.value); setAllocError(""); } }} />
                  ))}
                </ChipRow>
                <View style={styles.form}>
                  {mode === "auto" ? (
                    <Text style={[type.footnote, { color: colors.textSecondary }]}>Tutar açık faturalara en eski vadeden başlayarak işlenir; artan kısım cari hesapta avans olarak kalır.</Text>
                  ) : null}
                  {mode === "advance" ? (
                    <Text style={[type.footnote, { color: colors.textSecondary }]}>Tahsilat faturalara işlenmez; tamamı cari hesapta avans olarak kalır. Avansı sonradan faturaya dağıtabilirsiniz.</Text>
                  ) : null}
                </View>
                {mode === "manual" ? (
                  <>
                    <Card style={[styles.block, { marginTop: spacing.sm }]}>
                      <AllocationRows invoices={invoices} values={values} errors={alloc.errors} currency={currency} disabled={locked} onChange={(k, v) => { setAllocError(""); setValues((p) => ({ ...p, [k]: v })); }} />
                    </Card>
                    <View style={[styles.inline, styles.form]}>
                      <Button testID="collect-autofill" size="sm" variant="secondary" label="En eski vadeden doldur" disabled={locked || !amt || amt <= 0n} onPress={() => amt && setValues(autoFill(invoices, amt))} />
                      <Button testID="collect-clear" size="sm" variant="secondary" label="Temizle" disabled={locked} onPress={() => setValues({})} />
                    </View>
                    <View testID="collect-alloc-summary" style={[styles.summary, styles.block]}>
                      <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{`Dağıtılan ${formatMinor(alloc.total, currency)}`}</Text>
                      {amt ? (
                        <Text style={[type.callout, tabular, { color: alloc.total > amt ? colors.error : colors.textSecondary }]}>
                          {`Avans olarak kalan ${formatMinor(alloc.total > amt ? 0n : amt - alloc.total, currency)}`}
                        </Text>
                      ) : null}
                    </View>
                    {!alloc.items.length ? (
                      <Text style={[type.caption, styles.err, { color: colors.textTertiary }]}>Hiçbir fatura seçmezseniz tutar otomatik (en eski vadeden) dağıtılır.</Text>
                    ) : null}
                  </>
                ) : null}
                {allocError ? (
                  <Text testID="collect-alloc-error" accessibilityRole="alert" style={[type.caption, styles.err, { color: colors.error }]}>
                    {allocError}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          <View style={styles.form}>
            <FormField testID="collect-note" label="Not (isteğe bağlı)" value={note} onChangeText={setNote} editable={!locked} maxLength={200} placeholder="ör. Kasım ödemesi" />
            {write.locked ? (
              <View testID="collect-uncertain" style={[styles.box, { backgroundColor: colors.warningBg }]}>
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Önceki gönderimin sonucu alınamadı; tahsilat kaydedilmiş olabilir. Bilgiler kilitlendi: aynı tahsilatı yeniden gönderebilirsiniz, ikinci kez kaydedilmez.
                </Text>
              </View>
            ) : null}
            {write.error ? (
              <View testID="collect-error" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.errorBg }]}>
                <AlertIcon size={16} color={colors.error} />
                <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{write.error}</Text>
              </View>
            ) : null}
            {write.blocked ? (
              <Button testID="collect-close" variant="secondary" label="Kapat" onPress={() => router.canGoBack() && router.back()} />
            ) : (
              <Button testID="collect-submit" label={moneySubmitLabel(write, "Tahsilatı kaydet")} icon={<WalletIcon size={18} color="#FFFFFF" />} busy={write.saving} onPress={submit} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="collect-screen">
      <StackHeader title="Tahsilat al" subtitle={params.name ? String(params.name) : undefined} />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  inline: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  summary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.md },
  err: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  box: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md },
});
