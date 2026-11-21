// Çalışan kartı: yeni (POST /employees + Idempotency-Key; çift dokunuş tek kart) ya da düzenle (PUT /employees/{id}).
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { employeeBody, errorText, validateEmployee, type EmployeeForm } from "../../src/employees";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing } from "../../src/theme/tokens";
import { Note } from "../../src/components/sms/SmsParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";

export default function EmployeeFormScreen() {
  const p = useLocalSearchParams<{ id?: string }>();
  const id = p.id ? String(p.id) : "";
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [f, setF] = useState<EmployeeForm>({ name: "", title: "", email: "", phone: "", iban: "", notes: "" });
  const [loading, setLoading] = useState(Boolean(id));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(newIdempotencyKey("emp"));

  useEffect(() => {
    if (!id || !token) return;
    request<any>(`/employees/${encodeURIComponent(id)}`, { method: "GET" }, token)
      .then((e) => setF({ name: e?.name || "", title: e?.title || "", email: e?.email || "", phone: e?.phone || "", iban: e?.iban || "", notes: e?.notes || "" }))
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [id, token]);

  const errs = validateEmployee(f);
  const set = (k: keyof EmployeeForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setTried(true);
    if (!token || busy || Object.keys(errs).length) return;
    setBusy(true);
    setError("");
    try {
      const out = id
        ? await request<any>(`/employees/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(employeeBody(f)) }, token)
        : await request<any>("/employees", { method: "POST", body: JSON.stringify(employeeBody(f)), headers: { "Idempotency-Key": key.current } }, token);
      toast(id ? "Çalışan kaydedildi." : "Çalışan eklendi.", "success");
      const newId = out?.id || out?.employee?.id;
      if (!id && newId) router.replace({ pathname: "/employees/[id]", params: { id: String(newId) } } as any);
      else router.back();
    } catch (e: any) {
      if (Number(e?.status) >= 400 && Number(e?.status) < 500) key.current = newIdempotencyKey("emp");
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.wrap, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="employee-form">
      <StackHeader title={id ? "Çalışanı düzenle" : "Yeni çalışan"} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <FormField testID="emp-name" label="Ad soyad" value={f.name} onChangeText={set("name")} maxLength={120} error={tried ? errs.name : undefined} />
          <FormField testID="emp-title" label="Görev (isteğe bağlı)" value={f.title || ""} onChangeText={set("title")} maxLength={80} error={tried ? errs.title : undefined} />
          <FormField testID="emp-phone" label="Telefon (isteğe bağlı)" value={f.phone || ""} onChangeText={set("phone")} keyboardType="phone-pad" maxLength={20} />
          <FormField testID="emp-email" label="E-posta (isteğe bağlı)" value={f.email || ""} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" error={tried ? errs.email : undefined} />
          <FormField testID="emp-iban" label="IBAN (isteğe bağlı)" value={f.iban || ""} onChangeText={set("iban")} autoCapitalize="characters" placeholder="TR.." error={tried ? errs.iban : undefined} />
          <FormField testID="emp-notes" label="Not (isteğe bağlı)" value={f.notes || ""} onChangeText={set("notes")} multiline maxLength={500} error={tried ? errs.notes : undefined} />
          {error ? <Note tone="error">{error}</Note> : null}
          <Button testID="emp-save" label={busy ? "Kaydediliyor…" : "Kaydet"} busy={busy} disabled={busy} onPress={save} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, gap: spacing.sm } });
