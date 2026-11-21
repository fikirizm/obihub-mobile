// Çalışan detayı (P5.3): GET /employees/{id} — kart, bakiye, ekstre (en yeni önce). İşlem ekle: POST /employees/{id}/transactions
// {kind, amount, date, account_id (TL), note, period} + Idempotency-Key (zorunlu; belirsiz sonuçta aynı anahtar). İşlem sil: DELETE
// /employees/{id}/transactions/{txn} (ters kayıt). Arşiv: POST /employees/{id}/archive|unarchive (açık bakiyede 409). Kurallar: src/employees.ts.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getPickableAccounts, newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { istanbulToday } from "../../src/api-gider";
import { balanceView, errorText, KINDS, periodAllowed, statementRow, tlAccounts, txnBody, validateTxn, type TxnForm } from "../../src/employees";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { AccountOption } from "../../src/components/AccountOption";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { Note } from "../../src/components/sms/SmsParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount } from "../../src/types";

const blankTxn = (today: string): TxnForm => ({ kind: "salary", amount: "", account_id: "", date: today, period: today.slice(0, 7), note: "" });

export default function EmployeeDetailScreen() {
  const p = useLocalSearchParams<{ id: string }>();
  const id = String(p.id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "billing");
  const today = istanbulToday();
  const [emp, setEmp] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [form, setForm] = useState<TxnForm | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [txnError, setTxnError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const key = useRef(newIdempotencyKey("emptx"));

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setEmp(await request<any>(`/employees/${encodeURIComponent(id)}`, { method: "GET" }, token));
      setError("");
    } catch (e: any) {
      setError(errorText(e));
    } finally {
      setRefreshing(false);
    }
  }, [token, id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (token && form && !accounts.length) getPickableAccounts(token).then((a) => setAccounts(tlAccounts(a))).catch(() => setAccounts([]));
  }, [token, form, accounts.length]);

  const errs = form ? validateTxn(form, today) : {};
  const setTx = (k: keyof TxnForm) => (v: string) => !uncertain && setForm((f) => f && { ...f, [k]: v });
  const saveTxn = async () => {
    setTried(true);
    if (!token || !form || busy || Object.keys(errs).length) return;
    setBusy(true);
    setTxnError("");
    const body = txnBody(form);
    const out = await sendKeyedMoney(
      () => request<any>(`/employees/${encodeURIComponent(id)}/transactions`, { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key.current } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "İşlem kaydedilmiş olabilir. Yeniden gönderirseniz ikinci kez yazılmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      toast(out.result?.replayed ? "Bu işlem zaten kaydedilmişti." : "İşlem kaydedildi.", "success");
      if (out.result?.employee) setEmp(out.result.employee);
      else load();
      key.current = newIdempotencyKey("emptx");
      setForm(null);
      setTried(false);
      setUncertain(false);
      return;
    }
    if (out.uncertain) {
      setUncertain(true);
      setTxnError("Sonuç alınamadı. Bilgiler kilitlendi; aynı işlemi yeniden gönderebilirsiniz (ikinci kez yazılmaz).");
      return;
    }
    key.current = newIdempotencyKey("emptx");
    setTxnError(errorText(out.error));
  };
  const voidTxn = async (txnId: string, title: string) => {
    if (!token) return;
    const ok = await confirm({ title: "İşlem silinsin mi?", message: `"${title}" ters kayıtla geri alınır; kasa satırı da silinir.`, confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    try {
      const r = await request<any>(`/employees/${encodeURIComponent(id)}/transactions/${encodeURIComponent(txnId)}`, { method: "DELETE" }, token);
      toast("İşlem silindi.", "success");
      if (r?.employee) setEmp(r.employee);
      else load();
    } catch (e: any) {
      toast(errorText(e), "error");
    }
  };
  const toggleArchive = async () => {
    if (!token || !emp) return;
    const archive = !emp.archived;
    if (archive) {
      const ok = await confirm({ title: "Çalışan arşivlensin mi?", message: "Arşivdeki çalışan listede görünmez ve yeni işlem almaz. Açık bakiyesi olan çalışan arşivlenemez.", confirmLabel: "Arşivle" });
      if (!ok) return;
    }
    try {
      await request<any>(`/employees/${encodeURIComponent(id)}/${archive ? "archive" : "unarchive"}`, { method: "POST", body: "{}" }, token);
      toast(archive ? "Çalışan arşivlendi." : "Çalışan arşivden çıkarıldı.", "success");
      load();
    } catch (e: any) {
      toast(errorText(e), "error");
    }
  };

  if (!emp && !error)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Çalışan" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  const b = emp ? balanceView(emp.balance) : null;
  const rows: any[] = Array.isArray(emp?.statement?.items) ? emp.statement.items : [];
  return (
    <KeyboardAvoidingView style={[styles.wrap, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="employee-detail">
      <StackHeader
        title={emp?.name || "Çalışan"}
        subtitle={emp?.archived ? "Arşivde" : emp?.title || undefined}
        right={mayWrite && emp ? <Button testID="employee-edit" size="sm" variant="secondary" label="Düzenle" onPress={() => router.push({ pathname: "/employees/form", params: { id } } as any)} /> : undefined}
      />
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Çalışan okunamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
        >
          <HeroCard tone={b?.tone === "error" ? "violet" : b?.tone === "success" ? "emerald" : "blue"}>
            <Text style={{ color: ON_HERO.soft, fontSize: 13, fontWeight: "600" }}>Bakiye</Text>
            <Text testID="employee-balance" style={[tabular, styles.heroValue]} numberOfLines={2}>{b?.text}</Text>
            <Text style={{ color: ON_HERO.soft, fontSize: 12, marginTop: 4 }}>Çalışan cari ve tedarikçi listelerinde görünmez.</Text>
          </HeroCard>

          {mayWrite && !emp.archived ? (
            form ? (
              <>
                <SectionTitle title="İşlem ekle" />
                <View style={[styles.block, { gap: spacing.sm }]} testID="employee-txn-form">
                  <OptionChips testIDPrefix="employee-kind" options={KINDS.map(([value, label]) => ({ value, label }))} value={form.kind} onChange={setTx("kind")} />
                  <Text style={[type.caption, { color: colors.textTertiary }]}>{KINDS.find(([k]) => k === form.kind)?.[2]}</Text>
                  <FormField testID="employee-amount" label="Tutar" suffix="₺" value={form.amount} onChangeText={setTx("amount")} editable={!uncertain} keyboardType="decimal-pad" placeholder="0,00" error={tried ? errs.amount : undefined} />
                  <FormField testID="employee-date" label="Tarih (YYYY-AA-GG)" value={form.date} onChangeText={setTx("date")} editable={!uncertain} maxLength={10} autoCapitalize="none" error={tried ? errs.date : undefined} />
                  {periodAllowed(form.kind) ? (
                    <FormField testID="employee-period" label="Dönem (YYYY-AA, isteğe bağlı)" value={form.period} onChangeText={setTx("period")} editable={!uncertain} maxLength={7} autoCapitalize="none" error={tried ? errs.period : undefined} />
                  ) : null}
                  <FormField testID="employee-note" label="Açıklama (isteğe bağlı)" value={form.note} onChangeText={setTx("note")} editable={!uncertain} maxLength={200} error={tried ? errs.note : undefined} />
                </View>
                <SectionTitle title="Ödemenin çıkacağı hesap (TL)" />
                <Card style={styles.block}>
                  {accounts.length ? (
                    accounts.map((a, i) => (
                      <AccountOption key={a.id} testID={`employee-account-${a.id}`} account={a} selected={form.account_id === a.id} divider={i > 0} onPress={() => setTx("account_id")(a.id)} />
                    ))
                  ) : (
                    <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>TL kasa ya da banka hesabınız yok. Önce Kasa ve Bankalar'dan bir TL hesabı ekleyin.</Text>
                  )}
                </Card>
                {tried && errs.account ? <Text style={[type.caption, styles.block, { color: colors.error }]}>{errs.account}</Text> : null}
                <View style={[styles.block, { gap: spacing.sm }]}>
                  {txnError ? <Note tone={uncertain ? "warning" : "error"} testID="employee-txn-error">{txnError}</Note> : null}
                  <View style={styles.actions}>
                    <Button testID="employee-txn-save" label={busy ? "Kaydediliyor…" : uncertain ? "Yeniden gönder" : "Kaydet"} busy={busy} disabled={busy} onPress={saveTxn} />
                    {!uncertain ? <Button variant="secondary" label="Vazgeç" disabled={busy} onPress={() => (setForm(null), setTried(false), setTxnError(""))} /> : null}
                  </View>
                </View>
              </>
            ) : (
              <View style={[styles.block, { marginTop: spacing.sm }]}>
                <Button testID="employee-txn-new" label="İşlem ekle (avans, maaş, prim, ödeme)" onPress={() => setForm(blankTxn(today))} />
              </View>
            )
          ) : null}

          <SectionTitle title="Hareketler" action={emp?.statement?.truncated ? <Text style={[type.caption, { color: colors.textTertiary }]}>Son 300</Text> : undefined} />
          <Card style={styles.block}>
            {rows.length ? (
              rows.map((r, i) => {
                const v = statementRow(r);
                return (
                  <View key={v.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`employee-entry-${v.id}`}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, { color: v.reversed ? colors.textTertiary : colors.textPrimary, textDecorationLine: v.reversed ? "line-through" : "none" }]} numberOfLines={1}>{v.title}</Text>
                      <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={2}>{v.sub}</Text>
                    </View>
                    <Text style={[type.callout, tabular, { color: v.reversed ? colors.textTertiary : colors.textPrimary }]}>{v.amount}</Text>
                    {mayWrite && v.canVoid ? <Button testID={`employee-void-${v.id}`} size="sm" variant="ghost" label="Sil" onPress={() => voidTxn(v.txnId, v.title)} /> : null}
                  </View>
                );
              })
            ) : (
              <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Henüz hareket yok.</Text>
            )}
          </Card>

          <SectionTitle title="Bilgiler" />
          <Card style={styles.block}>
            {[["Telefon", emp.phone], ["E-posta", emp.email], ["IBAN", emp.iban], ["Not", emp.notes]].filter(([, v]) => v).map(([k, v], i) => (
              <ListRow key={k} divider={i > 0} title={k} subtitle={String(v)} />
            ))}
            {![emp.phone, emp.email, emp.iban, emp.notes].some(Boolean) ? <ListRow title="Ek bilgi girilmemiş" /> : null}
          </Card>
          {mayWrite ? (
            <View style={[styles.block, { marginTop: spacing.sm }]}>
              <Button testID="employee-archive" variant="ghost" size="sm" label={emp.archived ? "Arşivden çıkar" : "Arşivle"} onPress={toggleArchive} style={{ alignSelf: "flex-start" }} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  heroValue: { color: ON_HERO.text, fontSize: 24, fontWeight: "800", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  actions: { flexDirection: "row", gap: spacing.sm },
});
