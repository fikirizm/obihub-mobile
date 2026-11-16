// Dalga 3 (P3.3): banka gideri / vergi-SGK ödemesi — kasa/bankadan ÇIKIŞ (elle kasa hareketi yazıcısı; gelir-gider özetine gider olarak
// girer, KDV raporuna girmez). POST /accounting/expense-invoices/kinds/{bank_fee|tax_payment} + Idempotency-Key; ödendiği hesap zorunlu
// (aynalı Paraşüt hesabı seçicide yok; sunucu 409 MIRROR_ACCOUNT_READ_ONLY). parasut_warning ayrıca gösterilir.
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getPickableAccounts, newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { istanbulToday } from "../../src/api-gider";
import { cashKindBody, TAX_TYPES, taxPeriods, warningOf } from "../../src/expense-kinds";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { Chip } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

const trDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const errText = (e: any) => (typeof e?.message === "string" && !/^Sunucu hatası/.test(e.message) ? e.message : "Kayıt yapılamadı.");

export default function CashKindScreen() {
  const kind = (useLocalSearchParams<{ kind?: string }>().kind === "tax_payment" ? "tax_payment" : "bank_fee") as "bank_fee" | "tax_payment";
  const tax = kind === "tax_payment";
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const today = istanbulToday();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(trDay(today));
  const [name, setName] = useState("");
  const [taxType, setTaxType] = useState("");
  const [taxPeriod, setTaxPeriod] = useState(taxPeriods(today)[0].value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPickableAccounts(token)
      .then((rows) => {
        const tr = rows.filter((a) => ["TRY", "TL", "TRL", ""].includes(String(a.currency || "TRY").toUpperCase()));
        setAccounts(tr.map((a) => ({ id: a.id, name: a.name })));
        setAccountId((v) => v || tr.find((a) => a.account_type === "bank")?.id || tr[0]?.id || "");
      })
      .catch(() => setAccounts([]));
  }, [token]);

  const save = async () => {
    if (!token || busy) return;
    const b = cashKindBody(kind, { amount, date, accountId, name, taxType, taxPeriod });
    if (b.error || !b.body) return setError(b.error || "");
    setError("");
    if (!key.current) key.current = newIdempotencyKey(tax ? "tax" : "bfee");
    const k = key.current;
    setBusy(true);
    const out = await sendKeyedMoney(
      () => request<any>(`/accounting/expense-invoices/kinds/${kind}`, { method: "POST", body: JSON.stringify({ ...b.body, idempotency_key: k }), headers: { "Idempotency-Key": k } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "Kayıt yapılmış olabilir. Yeniden gönderirseniz ikinci kez yazılmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      toast(out.result?.replayed ? "Bu kayıt zaten yapılmıştı." : tax ? "Vergi/SGK ödemesi kaydedildi." : "Banka gideri kaydedildi.", "success");
      const w = warningOf(out.result);
      if (w) setTimeout(() => toast(w, "info"), 600);
      router.back();
      return;
    }
    if (!out.uncertain) key.current = null;
    setError(errText(out.error));
  };

  if (!canManage(user, "billing"))
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title={tax ? "Vergi/SGK ödemesi" : "Banka gideri"} />
        <EmptyState icon={<AlertIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Kasa/banka çıkışı için fatura ve kasa yönetimi yetkisi gerekir." />
      </View>
    );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-kind-screen">
      <StackHeader title={tax ? "Vergi/SGK ödemesi" : "Banka gideri"} subtitle="Kasa ya da bankadan çıkış" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {tax ? (
            <>
              <Text style={[type.caption, { color: colors.textSecondary }]}>Vergi türü</Text>
              <View style={styles.chips}>
                {TAX_TYPES.map(([v, l]) => (
                  <Chip key={v} testID={`tax-type-${v}`} label={l} selected={taxType === v} onPress={() => setTaxType(v)} />
                ))}
              </View>
              <Text style={[type.caption, { color: colors.textSecondary }]}>Dönem</Text>
              <View style={styles.chips}>
                {taxPeriods(today).slice(0, 6).map((p) => (
                  <Chip key={p.value} testID={`tax-period-${p.value}`} label={p.label} selected={taxPeriod === p.value} onPress={() => setTaxPeriod(p.value)} />
                ))}
              </View>
            </>
          ) : null}
          <FormField testID="kind-amount" label="Tutar (TRY)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <FormField testID="kind-date" label="Ödeme tarihi" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" />
          <FormField testID="kind-name" label="Açıklama (isteğe bağlı)" value={name} onChangeText={setName} maxLength={120} placeholder={tax ? "Örn. Ekim KDV" : "Örn. Hesap işletim ücreti"} />
          <Text style={[type.caption, { color: colors.textSecondary }]}>Ödendiği hesap</Text>
          {accounts && !accounts.length ? (
            <Text style={[type.footnote, { color: colors.error }]}>Kullanılabilir TL kasa/banka hesabı yok. Önce Kasa ve Bankalar'dan hesap ekleyin.</Text>
          ) : (
            <View style={styles.chips}>
              {(accounts || []).map((a) => (
                <Chip key={a.id} testID={`kind-account-${a.id}`} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </View>
          )}
          <View style={[styles.note, { backgroundColor: colors.infoBg }]}>
            <Text style={[type.caption, { color: colors.textPrimary }]}>Kayıt seçtiğiniz hesaptan çıkış olarak yazılır ve gelir-gider özetinde gider sayılır; KDV raporuna girmez.</Text>
          </View>
          {error ? (
            <Text testID="kind-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          <Button testID="kind-save" label="Kaydet" busy={busy} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  note: { padding: spacing.sm, borderRadius: radius.md },
});
