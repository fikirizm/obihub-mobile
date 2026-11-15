// D-12 (S-4): kesilmiş faturada bilgi düzenleme — yalnız izinli alanlar (fatura ismi, not, sipariş no, vade) kısmi PUT ile.
// Tutar alanları kilitlidir; düzeltme için fatura iptal edilip yenisi oluşturulur (ya da kopyalanır).
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getLocalInvoice, request } from "../../src/api";
import { lifecycleErrorText, metaBody, metaProblem, type MetaForm } from "../../src/document-lifecycle";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export default function InvoiceMetaScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [form, setForm] = useState<MetaForm | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    getLocalInvoice(token, id)
      .then((inv: any) => {
        setIssue(String(inv?.issue_date || "").slice(0, 10));
        setForm({ document_name: String(inv?.document_name || ""), notes: String(inv?.notes || ""), order_no: String(inv?.order_no || ""), due_date: String(inv?.due_date || "").slice(0, 10) });
      })
      .catch(() => setError("Fatura okunamadı."));
  }, [token, id]);

  const save = async () => {
    if (!token || !form || busy) return;
    const p = metaProblem(form, issue);
    if (p) return setError(p);
    setBusy(true);
    setError("");
    try {
      await request<any>(`/local-invoices/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(metaBody(form)) }, token);
      toast("Fatura bilgileri güncellendi.", "success");
      router.back();
    } catch (e: any) {
      setError(lifecycleErrorText(e, "Bilgiler kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<MetaForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoice-meta-screen">
      <StackHeader title="Fatura bilgileri" subtitle={params.title ? String(params.title) : undefined} />
      {!form ? (
        error ? <Text style={[type.callout, styles.body, { color: colors.error }]}>{error}</Text> : <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[type.caption, { color: colors.textTertiary }]}>Kesilmiş faturada tutarlar değişmez; burada yalnız fatura ismi, not, sipariş no ve vade güncellenir.</Text>
            <FormField testID="meta-document-name" label="Fatura ismi" value={form.document_name} onChangeText={(t) => set({ document_name: t })} maxLength={200} />
            <FormField testID="meta-order-no" label="Sipariş no" value={form.order_no} onChangeText={(t) => set({ order_no: t })} maxLength={100} />
            <FormField testID="meta-notes" label="Fatura notu" value={form.notes} onChangeText={(t) => set({ notes: t })} multiline maxLength={2000} />
            <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>{`Vade: ${form.due_date ? formatDate(form.due_date) : "Vadesiz"}`}</Text>
            {/^\d{4}-\d{2}-\d{2}$/.test(issue) ? (
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow>
                  <Chip testID="meta-due-none" label="Vadesiz" selected={!form.due_date} onPress={() => set({ due_date: "" })} />
                  {[0, 7, 15, 30, 60].map((d) => (
                    <Chip key={d} testID={`meta-due-${d}`} label={d === 0 ? "Aynı gün" : `${d} gün`} selected={form.due_date === addDays(issue, d)} onPress={() => set({ due_date: addDays(issue, d) })} />
                  ))}
                </ChipRow>
              </View>
            ) : null}
            {error ? (
              <Text testID="meta-error" style={[type.footnote, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
            <Button testID="meta-save" label={busy ? "Kaydediliyor…" : "Kaydet"} busy={busy} onPress={save} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md } });
