// Dalga 2 (P2.3): tahsilat hatırlatma e-postası — POST /local-invoices/{id}/reminder. Onaysız istek önizleme döner (konu, kalan,
// gecikme); "Evet, gönder" confirm:true + işlem anahtarıyla gider (aynı anahtar ikinci kez göndermez). Geri alınamaz.
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { followupErrorText, reminderBody } from "../../src/followup";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

export default function ReminderScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; to?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [to, setTo] = useState(String(params.to || ""));
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey("remind"));
  const path = `/local-invoices/${encodeURIComponent(id)}/reminder`;

  const next = async () => {
    if (!token || busy) return;
    const b = reminderBody(to, message, false, key.current);
    if (b.error) return setError(b.error);
    setBusy(true);
    setError("");
    try {
      const r = await request<any>(path, { method: "POST", body: JSON.stringify(b.body) }, token);
      setPreview(r?.preview || { to: (b.body as any).to, subject: "Ödeme hatırlatması" });
    } catch (e: any) {
      setError(followupErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!token || busy) return;
    const b = reminderBody(to, message, true, key.current);
    if (b.error) return setError(b.error);
    setBusy(true);
    const out = await sendKeyedMoney(
      () => request<any>(path, { method: "POST", body: JSON.stringify(b.body), headers: { "Idempotency-Key": key.current } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "Hatırlatma gönderilmiş olabilir. Yeniden gönderirseniz ikinci kez gitmez.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      toast(out.result?.replayed ? "Bu hatırlatma zaten gönderilmişti." : "Tahsilat hatırlatması gönderildi.", "success");
      router.back();
      return;
    }
    if (!out.uncertain) {
      key.current = newIdempotencyKey("remind");
      setPreview(null);
    }
    setError(followupErrorText(out.error));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="reminder-screen">
      <StackHeader title="Tahsilat hatırlatması" subtitle={params.title ? String(params.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!preview ? (
            <>
              <FormField testID="reminder-to" label="Alıcı e-posta" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} hint="Birden çok adresi virgülle ayırın." />
              <FormField testID="reminder-message" label="Mesaj (isteğe bağlı)" value={message} onChangeText={setMessage} multiline maxLength={1000} hint="Boş bırakırsanız nazik bir hatırlatma metni kullanılır." />
            </>
          ) : (
            <View testID="reminder-preview" style={[styles.box, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[type.callout, { color: colors.textPrimary }]}>Hatırlatma şu adreslere gönderilecek:</Text>
              {(preview.to || []).map((a: string) => (
                <Text key={a} style={[type.bodyStrong, { color: colors.textPrimary }]}>
                  {a}
                </Text>
              ))}
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {[`Konu: ${preview.subject || ""}`, preview.remaining ? `Kalan ${preview.remaining}` : null, preview.overdue_days > 0 ? `${preview.overdue_days} gün gecikti` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>E-postada faturayı görüntüleme bağlantısı bulunur. Gönderim geri alınamaz.</Text>
            </View>
          )}
          {error ? (
            <Text testID="reminder-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          {!preview ? (
            <Button testID="reminder-next" label="Önizle" busy={busy} onPress={next} />
          ) : (
            <>
              <Button testID="reminder-send" label={busy ? "Gönderiliyor…" : "Evet, gönder"} busy={busy} onPress={send} />
              <Button variant="secondary" label="Geri" disabled={busy} onPress={() => setPreview(null)} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md }, box: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs } });
