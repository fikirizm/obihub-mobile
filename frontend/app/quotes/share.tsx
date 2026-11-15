// D-12 §9: teklifi e-posta ile paylaş (web InvoiceLifecycle.ShareDialog). Onaysız gitmez: önce alıcılar ve konu gösterilir,
// "Evet, gönder" ile confirm:true gönderilir. İşlem anahtarlı; gönderim geri alınamaz.
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { lifecycleErrorText, shareRecipients } from "../../src/document-lifecycle";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

export default function QuoteShareScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; email?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [to, setTo] = useState(String(params.email || ""));
  const [subject, setSubject] = useState("Teklifiniz");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey("share"));
  const r = shareRecipients(to);

  const next = () => {
    if (r.error) return setError(r.error);
    setError("");
    setStep("confirm");
  };
  const send = async () => {
    if (!token || busy) return;
    setBusy(true);
    const out = await sendKeyedMoney(
      () =>
        request<any>(
          `/local-invoices/${encodeURIComponent(id)}/share`,
          { method: "POST", body: JSON.stringify({ to: r.list, subject: subject.trim(), message: message.trim(), confirm: true, idempotency_key: key.current }), headers: { "Idempotency-Key": key.current } },
          token
        ),
      () => confirm({ title: "Sonuç alınamadı", message: "E-posta gönderilmiş olabilir. Yeniden gönderirseniz ikinci kez gitmez.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      toast("Teklif e-posta ile gönderildi.", "success");
      router.back();
      return;
    }
    if (!out.uncertain) {
      key.current = newIdempotencyKey("share");
      setStep("form");
    }
    setError(lifecycleErrorText(out.error, "Teklif gönderilemedi."));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="quote-share-screen">
      <StackHeader title="Teklifi paylaş" subtitle={params.title ? String(params.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === "form" ? (
            <>
              <FormField
                testID="share-to"
                label="Alıcı e-posta"
                value={to}
                onChangeText={setTo}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                hint="Birden çok adresi virgülle ayırın."
              />
              <FormField testID="share-subject" label="Konu" value={subject} onChangeText={setSubject} maxLength={150} />
              <FormField testID="share-message" label="Mesaj (isteğe bağlı)" value={message} onChangeText={setMessage} multiline maxLength={1000} />
            </>
          ) : (
            <View testID="share-confirm" style={[styles.box, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[type.callout, { color: colors.textPrimary }]}>Bu teklif şu adreslere gönderilecek:</Text>
              {r.list.map((a) => (
                <Text key={a} style={[type.bodyStrong, { color: colors.textPrimary }]}>
                  {a}
                </Text>
              ))}
              <Text style={[type.caption, { color: colors.textSecondary }]}>{`Konu: ${subject}. Gönderim geri alınamaz.`}</Text>
            </View>
          )}
          {error ? (
            <Text testID="share-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          {step === "form" ? (
            <Button testID="share-next" label="Gönder" onPress={next} />
          ) : (
            <>
              <Button testID="share-send" label={busy ? "Gönderiliyor…" : "Evet, gönder"} busy={busy} onPress={send} />
              <Button variant="secondary" label="Geri" disabled={busy} onPress={() => setStep("form")} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md }, box: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs } });
