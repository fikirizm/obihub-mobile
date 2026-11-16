// Dalga 3 (P3.1): çekle tahsilat — POST /cheques/receive {invoice_id | customer_id, amount, due_date, cheque_no?, bank_name?, drawer?,
// note?, date?, allocations?} + Idempotency-Key (zorunlu). Çek portföye girer, KASAYA GİRMEZ; vadesinde Çekler ekranından tahsil edilir.
// Dağıtım varsa toplamı çek tutarına eşit olmalı (422 CHEQUE_ALLOCATION_MISMATCH).
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { chequeErrorText, receiveBody } from "../../src/cheques";
import { istanbulToday } from "../../src/api-gider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

const trDay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

export default function ChequeReceiveScreen() {
  const p = useLocalSearchParams<{ invoiceId?: string; customerId?: string; amount?: string; title?: string; allocations?: string; drawer?: string }>();
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const today = istanbulToday();
  const [amount, setAmount] = useState(String(p.amount || "").replace(".", ","));
  const [due, setDue] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [bank, setBank] = useState("");
  const [drawer, setDrawer] = useState(String(p.drawer || ""));
  const [note, setNote] = useState("");
  const [date, setDate] = useState(trDay(today));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey("cheque"));
  let allocations: { invoice_id: string; amount: string }[] | undefined;
  try {
    allocations = p.allocations ? JSON.parse(String(p.allocations)) : undefined;
  } catch {
    allocations = undefined;
  }

  const submit = async () => {
    if (!token || busy) return;
    const b = receiveBody({
      invoiceId: p.invoiceId ? String(p.invoiceId) : undefined,
      customerId: p.customerId ? String(p.customerId) : undefined,
      amount,
      dueDate: due,
      chequeNo,
      bankName: bank,
      drawer,
      note,
      date,
      allocations,
    });
    if (b.error || !b.body) return setError(b.error || "");
    setBusy(true);
    setError("");
    const out = await sendKeyedMoney(
      () => request<any>("/cheques/receive", { method: "POST", body: JSON.stringify({ ...b.body, idempotency_key: key.current }), headers: { "Idempotency-Key": key.current } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "Çek kaydedilmiş olabilir. Yeniden gönderirseniz ikinci kez kaydedilmez.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      toast(out.result?.replayed ? "Bu çek zaten kaydedilmişti." : "Çek portföye alındı; vadesinde Çekler ekranından tahsil edin.", "success");
      router.back();
      return;
    }
    if (!out.uncertain) key.current = newIdempotencyKey("cheque");
    setError(chequeErrorText(out.error));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cheque-receive-screen">
      <StackHeader title="Çekle tahsilat" subtitle={p.title ? String(p.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.note, { backgroundColor: colors.infoBg }]}>
            <Text style={[type.footnote, { color: colors.textPrimary }]}>
              Çek portföye girer, kasaya girmez. Fatura ya da cari alacağı çek tutarı kadar kapanır; vadesinde Çekler ekranından bankaya tahsil edersiniz.
            </Text>
          </View>
          <FormField testID="cheque-amount" label="Çek tutarı" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <FormField testID="cheque-due" label="Vade tarihi" value={due} onChangeText={setDue} placeholder="GG.AA.YYYY" hint="Çekin üzerindeki vade." />
          <FormField testID="cheque-no" label="Çek no (isteğe bağlı)" value={chequeNo} onChangeText={setChequeNo} maxLength={64} />
          <FormField testID="cheque-bank" label="Banka (isteğe bağlı)" value={bank} onChangeText={setBank} maxLength={64} />
          <FormField testID="cheque-drawer" label="Keşideci (isteğe bağlı)" value={drawer} onChangeText={setDrawer} maxLength={120} />
          <FormField testID="cheque-date" label="Alındığı tarih" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" />
          <FormField testID="cheque-note" label="Not (isteğe bağlı)" value={note} onChangeText={setNote} multiline maxLength={500} />
          {allocations?.length ? <Text style={[type.caption, { color: colors.textTertiary }]}>{`${allocations.length} faturaya dağıtılır; toplam çek tutarına eşit olmalı.`}</Text> : null}
          {error ? (
            <Text testID="cheque-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          <Button testID="cheque-submit" label={busy ? "Kaydediliyor…" : "Çeki portföye al"} busy={busy} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md }, note: { padding: spacing.sm, borderRadius: radius.md } });
