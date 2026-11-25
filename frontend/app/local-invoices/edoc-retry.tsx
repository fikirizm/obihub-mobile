// "E-belgeyi yeniden dene" sayfası (web EdocRetryDialog). Paraşüt'te faturası oluşmuş ama e-belgesi düşmüş faturada yalnız e-belge
// yeniden istenir: Paraşüt'te YENİ fatura açılmaz (POST /local-invoices/{id}/edoc-retry). Alıcı bilgisi (il/ilçe/VKN) eksikse sunucu
// 422 RECIPIENT_INCOMPLETE ile eksikleri ve önerileri döner; form açılır, düzeltilen bilgilerle yeniden gönderilir. Kurallar: src/edoc-recipient.ts.
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { FIELD_LABEL, RETRY_SENTENCE, recipientBody, retryForm, retryResult, validateRecipient, type RetryForm } from "../../src/edoc-recipient";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

export default function EdocRetryScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; reason?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [form, setForm] = useState<RetryForm | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = form ? validateRecipient(form.value, form.missing, form.individualAllowed) : {};
  const set = (patch: Partial<RetryForm["value"]>) => setForm((f) => (f ? { ...f, value: { ...f.value, ...patch } } : f));

  const submit = async () => {
    if (!token || busy) return;
    if (form && Object.keys(errors).length) return setShown(true);
    setBusy(true);
    setError("");
    try {
      const body = form ? recipientBody(form.value, form.missing, form.individualAllowed) : undefined;
      const r = await request<any>(`/local-invoices/${encodeURIComponent(id)}/edoc-retry`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }, token);
      const res = retryResult(r);
      if (res.tone === "error") {
        setError(res.text);
        setBusy(false);
        return;
      }
      toast(res.text, res.tone === "success" ? "success" : "info");
      router.back();
    } catch (e: any) {
      const next = retryForm(e);
      if (next) {
        // Sunucu eksikleri kesinleştirdi: yazılanlar korunur, boş alanlar öneriyle dolar.
        setForm((cur) =>
          cur
            ? { ...next, value: { city: cur.value.city || next.value.city, district: cur.value.district || next.value.district, tax_number: cur.value.tax_number || next.value.tax_number, individual: next.individualAllowed && cur.value.individual } }
            : next,
        );
        setShown(Boolean(form));
        setError(form ? "Alıcı bilgileri hâlâ eksik; işaretli alanları kontrol edin." : "");
      } else {
        setError(typeof e?.message === "string" && e.message ? e.message : "E-belge yeniden denenemedi.");
      }
      setBusy(false);
    }
  };

  const need = (k: string) => Boolean(form?.missing.includes(k));
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="edoc-retry-screen">
      <StackHeader title="E-belgeyi yeniden dene" subtitle={params.title ? String(params.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.note, { backgroundColor: colors.infoBg }]}>
            <Text style={[type.callout, { color: colors.textPrimary }]}>{RETRY_SENTENCE}</Text>
            {params.reason ? <Text style={[type.footnote, { color: colors.textSecondary }]}>{`Son hata: ${String(params.reason)}`}</Text> : null}
          </View>

          {form ? (
            <Card padded style={{ gap: spacing.sm }}>
              <View testID="edoc-retry-form" style={{ gap: spacing.sm }}>
              <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Alıcı bilgilerini tamamlayın</Text>
              <Text style={[type.caption, { color: colors.textTertiary }]}>
                {`Eksik: ${form.missing.map((k) => FIELD_LABEL[k]).join(", ")}. Bilgiler Paraşüt'teki faturaya yazılır, ardından e-belge istenir.`}
              </Text>
              <FormField testID="edoc-retry-city" label="İl" value={form.value.city} onChangeText={(t) => set({ city: t })} placeholder="Örn. İzmir" error={shown && need("city") ? errors.city : undefined} />
              <FormField testID="edoc-retry-district" label="İlçe" value={form.value.district} onChangeText={(t) => set({ district: t })} placeholder="Örn. Bornova" error={shown && need("district") ? errors.district : undefined} />
              {need("tax_number") ? (
                <>
                  {form.individualAllowed ? (
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Bireysel alıcı (TCKN yok)</Text>
                        <Text style={[type.caption, { color: colors.textTertiary }]}>e-Arşiv için standart 11111111111 kullanılır.</Text>
                      </View>
                      <Switch testID="edoc-retry-individual" value={form.value.individual} onValueChange={(v) => set({ individual: v })} trackColor={{ true: colors.primary, false: colors.border }} />
                    </View>
                  ) : null}
                  {!(form.value.individual && form.individualAllowed) ? (
                    <FormField
                      testID="edoc-retry-tax"
                      label="VKN / TCKN"
                      value={form.value.tax_number}
                      onChangeText={(t) => set({ tax_number: t.replace(/\D/g, "").slice(0, 11) })}
                      placeholder="10 haneli VKN ya da 11 haneli TCKN"
                      keyboardType="number-pad"
                      error={shown ? errors.tax_number : undefined}
                    />
                  ) : null}
                </>
              ) : null}
              </View>
            </Card>
          ) : null}

          {error ? (
            <Text testID="edoc-retry-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          <Button
            testID="edoc-retry-confirm"
            label={busy ? "Yeniden deneniyor…" : form ? "Bilgileri kaydet ve e-belgeyi gönder" : "E-belgeyi yeniden dene"}
            busy={busy}
            onPress={submit}
          />
          <Button variant="ghost" label="Vazgeç" disabled={busy} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  note: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
