// D-12 §9 + Dalga 1: teklifi ya da kesilmiş satış faturasını e-posta ile paylaş (web InvoiceLifecycle.ShareDialog). Alıcı ve konu
// GET share-preview'dan önerilir (cari e-postası). Onaysız gitmez: önce alıcılar ve konu gösterilir,
// "Evet, gönder" ile confirm:true gönderilir. İşlem anahtarlı; gönderim geri alınamaz.
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { lifecycleErrorText, sharePrefill, shareRecipients } from "../../src/document-lifecycle";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

export default function QuoteShareScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; email?: string; kind?: string }>();
  const invoice = params.kind === "invoice";
  const noun = invoice ? "Fatura" : "Teklif";
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [to, setTo] = useState(String(params.email || ""));
  const [subject, setSubject] = useState(invoice ? "Faturanız" : "Teklifiniz");
  const [canSend, setCanSend] = useState(true);
  const [official, setOfficial] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey("share"));
  const r = shareRecipients(to);
  useEffect(() => {
    if (!token || !id) return;
    let live = true;
    request<any>(`/local-invoices/${encodeURIComponent(id)}/share-preview`, { method: "GET" }, token)
      .then((p) => {
        if (!live) return;
        const f = sharePrefill(p);
        if (f.to) setTo((cur) => cur || f.to);
        if (f.subject) setSubject(f.subject);
        setCanSend(f.canSend);
        setOfficial(f.official);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token, id]);

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
      toast(`${noun} e-posta ile gönderildi.`, "success");
      router.back();
      return;
    }
    if (!out.uncertain) {
      key.current = newIdempotencyKey("share");
      setStep("form");
    }
    setError(lifecycleErrorText(out.error, `${noun} gönderilemedi.`));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="quote-share-screen">
      <StackHeader title={invoice ? "Faturayı paylaş" : "Teklifi paylaş"} subtitle={params.title ? String(params.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!canSend ? (
            <View testID="share-unavailable" style={[styles.box, { backgroundColor: colors.warningBg }]}>
              <Text style={[type.footnote, { color: colors.textPrimary }]}>E-posta gönderimi şu an etkin değil; belgeyi PDF olarak indirip kendiniz paylaşabilirsiniz.</Text>
            </View>
          ) : null}
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
              <Text style={[type.callout, { color: colors.textPrimary }]}>{`Bu ${invoice ? "fatura" : "teklif"} şu adreslere gönderilecek:`}</Text>
              {r.list.map((a) => (
                <Text key={a} style={[type.bodyStrong, { color: colors.textPrimary }]}>
                  {a}
                </Text>
              ))}
              <Text style={[type.caption, { color: colors.textSecondary }]}>{`Konu: ${subject}. ${invoice ? (official ? "Resmi fatura PDF'i bağlantı olarak eklenir. " : "Fatura PDF'i bağlantı olarak eklenir. ") : ""}Gönderim geri alınamaz.`}</Text>
            </View>
          )}
          {error ? (
            <Text testID="share-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          {step === "form" ? (
            <Button testID="share-next" label="Gönder" disabled={!canSend} onPress={next} />
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
