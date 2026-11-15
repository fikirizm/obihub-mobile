// D-12: satış faturasını iptal et (web InvoiceLifecycle.CancelDialog). Kesilmiş fatura silinmez, iptal edilir; gerekçe zorunlu (≥3).
// Cari alacağı ve çıkışı yapılan stok geri alınır. e-Belgeli faturada (409 EDOC_CANCEL_REQUIRED) önce ayrı, onaylı e-belge iptali.
// İşlem anahtarlı: belirsiz sonuçta aynı anahtarla yeniden gönderilir, ikinci kez kaydedilmez.
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey } from "../../src/api";
import { cancelInvoice, cancelInvoiceEdoc, sendKeyedMoney } from "../../src/api-finans";
import { cancelReasonProblem, lifecycleErrorText } from "../../src/document-lifecycle";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

export default function CancelInvoiceScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "cancel" | "edoc">("");
  const [needEdoc, setNeedEdoc] = useState(false);
  const [edocDone, setEdocDone] = useState(false);
  const key = useRef(newIdempotencyKey("cancel"));
  const edocKey = useRef(newIdempotencyKey("canceledoc"));
  const retryAsk = () => confirm({ title: "Sonuç alınamadı", message: "İşlem kaydedilmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez işlenmez.", confirmLabel: "Yeniden gönder" });

  const submit = async () => {
    if (!token || busy) return;
    const problem = cancelReasonProblem(reason);
    if (problem) return setError(problem);
    const ok = await confirm({
      title: "Fatura iptal edilsin mi?",
      message: `${params.title || "Fatura"}\nİptal geri alınamaz. Carinin alacağı ve çıkışı yapılan stok geri alınır; ters kayıt geçmişte görünür.`,
      confirmLabel: "Faturayı iptal et",
      destructive: true,
    });
    if (!ok) return;
    setBusy("cancel");
    setError("");
    const out = await sendKeyedMoney(() => cancelInvoice(token, id, reason.trim(), key.current), retryAsk);
    setBusy("");
    if (out.ok) {
      toast(out.result?.replayed ? "Bu iptal zaten kaydedilmişti." : "Fatura iptal edildi; cari ve stok geri alındı.", "success");
      router.back();
      return;
    }
    if (out.error?.code === "EDOC_CANCEL_REQUIRED") setNeedEdoc(true);
    if (!out.uncertain) key.current = newIdempotencyKey("cancel");
    setError(lifecycleErrorText(out.error, out.uncertain ? "Sonuç alınamadı. Fatura listesini kontrol edin." : "Fatura iptal edilemedi."));
  };

  const cancelEdoc = async () => {
    if (!token || busy) return;
    const problem = cancelReasonProblem(reason);
    if (problem) return setError(problem);
    const ok = await confirm({
      title: "e-Belge iptal edilsin mi?",
      message: "e-Belgenin iptali ayrı bir adımdır ve geri alınamaz. Ardından faturayı ObiHub'da iptal edebilirsiniz.",
      confirmLabel: "e-Belgeyi iptal et",
      destructive: true,
    });
    if (!ok) return;
    setBusy("edoc");
    setError("");
    const out = await sendKeyedMoney(() => cancelInvoiceEdoc(token, id, reason.trim(), edocKey.current), retryAsk);
    setBusy("");
    if (out.ok) {
      setEdocDone(true);
      setNeedEdoc(false);
      toast("e-Belge iptal edildi. Şimdi faturayı iptal edebilirsiniz.", "success");
      return;
    }
    if (!out.uncertain) edocKey.current = newIdempotencyKey("canceledoc");
    setError(lifecycleErrorText(out.error, "e-Belge iptal edilemedi."));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoice-cancel-screen">
      <StackHeader title="Faturayı iptal et" subtitle={params.title ? String(params.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.note, { backgroundColor: colors.warningBg }]}>
            <Text style={[type.footnote, { color: colors.textPrimary }]}>
              İptal geri alınamaz. Kesilmiş fatura silinmez; iptal edilmiş olarak saklanır. Carinin alacağı ve çıkışı yapılan stok geri alınır. Tahsilatı olan fatura önce tahsilattan
              ayrılmalıdır.
            </Text>
          </View>
          <FormField
            testID="cancel-reason"
            label="İptal gerekçesi"
            value={reason}
            onChangeText={(t) => {
              setReason(t);
              if (error) setError("");
            }}
            placeholder="Örn. Yanlış müşteriye kesildi"
            multiline
            maxLength={500}
            hint="Belge geçmişinde görünür."
          />
          {needEdoc ? (
            <View testID="cancel-edoc-step" style={[styles.note, { backgroundColor: colors.warningBg }]}>
              <Text style={[type.footnote, { color: colors.textPrimary }]}>
                Bu fatura e-belge olarak düzenlenmiş. ObiHub'da iptal etmeden önce e-belgenin ayrıca iptali gerekir; bu adım ayrı onay ister ve geri alınamaz.
              </Text>
            </View>
          ) : null}
          {edocDone ? <Text style={[type.footnote, { color: colors.success }]}>e-Belge iptal edildi.</Text> : null}
          {error ? (
            <Text testID="cancel-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          {needEdoc ? <Button testID="cancel-edoc" variant="secondary" label={busy === "edoc" ? "İptal ediliyor…" : "e-Belgeyi iptal et"} busy={busy === "edoc"} onPress={cancelEdoc} /> : null}
          <Button testID="cancel-confirm" variant="destructive" label={busy === "cancel" ? "İptal ediliyor…" : "Faturayı iptal et"} busy={busy === "cancel"} disabled={needEdoc || Boolean(busy)} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  note: { padding: spacing.sm, borderRadius: radius.md },
});
