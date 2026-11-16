// Dalga 4 (P4.4): bakiye sabitleme — hesabın seçilen gün sonundaki bakiyesi hedef tutara getirilir; fark tek satır ("Bakiye düzeltme")
// olarak yazılır, geri alınabilir ve sonraki geriye dönük hareketlerde sunucu farkı yeniden hesaplar (satır her seferinde sunucudan okunur).
// GET /finance/accounts/{id}/balance-at?date= (önizleme), POST .../balance-adjustments + Idempotency-Key.
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { istanbulToday } from "../../src/api-gider";
import { adjustBody, adjustDiffText, adjustErrorText } from "../../src/kasa-ui";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

const trDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export default function BalanceAdjustScreen() {
  const p = useLocalSearchParams<{ id: string; name?: string; currency?: string }>();
  const id = String(p.id || "");
  const cur = String(p.currency || "TRY");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [date, setDate] = useState(trDay(istanbulToday()));
  const [target, setTarget] = useState("");
  const [desc, setDesc] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);

  const day = adjustBody("0", date, "").body?.entry_date || "";
  useEffect(() => {
    if (!token || !day) return setBalance(null);
    let live = true;
    request<any>(`/finance/accounts/${encodeURIComponent(id)}/balance-at?date=${day}`, { method: "GET" }, token)
      .then((r) => live && setBalance(Number(r?.balance)))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
    };
  }, [token, id, day]);

  const submit = async () => {
    if (!token || busy) return;
    const b = adjustBody(target, date, desc);
    if (b.error || !b.body) return setError(b.error || "");
    const ok = await confirm({
      title: "Bakiye sabitlensin mi?",
      message: `${p.name || "Hesap"} · ${date} gün sonu\n${balance != null ? adjustDiffText(balance, target, cur, formatMoney) : ""}\nFark tek "Bakiye düzeltme" satırı olarak yazılır; geri alınabilir.`,
      confirmLabel: "Sabitle",
    });
    if (!ok) return;
    if (!key.current) key.current = newIdempotencyKey("badj");
    const k = key.current;
    setBusy(true);
    setError("");
    const out = await sendKeyedMoney(
      () => request<any>(`/finance/accounts/${encodeURIComponent(id)}/balance-adjustments`, { method: "POST", body: JSON.stringify({ ...b.body, idempotency_key: k }), headers: { "Idempotency-Key": k } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "Düzeltme kaydedilmiş olabilir. Yeniden gönderirseniz ikinci kez yazılmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      toast(out.result?.replayed ? "Bu düzeltme zaten kaydedilmişti." : `Bakiye sabitlendi (fark ${formatMoney(Number(out.result?.difference) || 0, cur)}).`, "success");
      router.back();
      return;
    }
    if (!out.uncertain) key.current = null;
    setError(adjustErrorText(out.error));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="balance-adjust-screen">
      <StackHeader title="Bakiyeyi sabitle" subtitle={p.name ? String(p.name) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.note, { backgroundColor: colors.infoBg }]}>
            <Text style={[type.footnote, { color: colors.textPrimary }]}>
              Seçtiğiniz günün sonunda hesap bakiyesi girdiğiniz tutara getirilir. Fark tek satır olarak yazılır; o güne sonradan hareket eklenirse fark yeniden hesaplanır.
            </Text>
          </View>
          <FormField testID="adjust-date" label="Tarih" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" />
          <Text testID="adjust-current" style={[type.callout, { color: colors.textSecondary }]}>
            {balance != null ? `O gün sonundaki bakiye: ${formatMoney(balance, cur)}` : "Bakiye okunuyor…"}
          </Text>
          <FormField testID="adjust-target" label={`Hedef bakiye (${cur})`} value={target} onChangeText={setTarget} keyboardType="numbers-and-punctuation" placeholder="0,00" hint="Eksi bakiye için başına - yazın." />
          {balance != null && target ? <Text style={[type.footnote, { color: colors.textPrimary }]}>{adjustDiffText(balance, target, cur, formatMoney)}</Text> : null}
          <FormField testID="adjust-desc" label="Açıklama (isteğe bağlı)" value={desc} onChangeText={setDesc} maxLength={200} placeholder="Örn. Banka ekstresiyle eşitleme" />
          {error ? (
            <Text testID="adjust-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          <Button testID="adjust-submit" label="Bakiyeyi sabitle" busy={busy} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md }, note: { padding: spacing.sm, borderRadius: radius.md } });
