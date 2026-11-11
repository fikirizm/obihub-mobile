import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { createSupportTicket } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chip } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";

const TOPICS = ["Siparişler", "Entegrasyon", "Fatura", "Kargo", "Abonelik", "Diğer"];
const MIN_MESSAGE = 8;

export default function NewTicketScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = message.trim().length >= MIN_MESSAGE;

  const submit = async () => {
    if (!token || !valid) return;
    setBusy(true);
    try {
      const r = await createSupportTicket(token, { topic, subject: subject.trim() || undefined, message: message.trim() });
      toast(r?.ticket_code ? `Talep oluşturuldu: ${r.ticket_code}` : "Talep oluşturuldu", "success");
      router.back();
    } catch (e: any) {
      toast(e?.message || "Talep oluşturulamadı.", "error");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="support-new-screen">
      <StackHeader title="Yeni destek talebi" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[type.callout, { color: colors.textSecondary }]}>Konu</Text>
          <View style={styles.topics}>
            {TOPICS.map((t) => (
              <Chip key={t} label={t} selected={topic === t} onPress={() => setTopic(t)} />
            ))}
          </View>

          <Text style={[type.callout, styles.label, { color: colors.textSecondary }]}>Başlık (isteğe bağlı)</Text>
          <TextInput
            testID="ticket-subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="Kısa bir başlık"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Başlık"
            maxLength={120}
            style={inputStyle}
          />

          <Text style={[type.callout, styles.label, { color: colors.textSecondary }]}>Mesaj</Text>
          <TextInput
            testID="ticket-message"
            value={message}
            onChangeText={setMessage}
            placeholder="Sorunu ve hangi ekranda yaşadığınızı yazın"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Mesaj"
            multiline
            textAlignVertical="top"
            style={[inputStyle, styles.textarea]}
          />
          {!valid && message.length > 0 ? (
            <Text style={[type.caption, { color: colors.error, marginTop: spacing.xs }]}>Mesaj en az {MIN_MESSAGE} karakter olmalı.</Text>
          ) : null}

          <Button testID="ticket-submit" label="Talebi gönder" busy={busy} disabled={!valid} onPress={submit} style={{ marginTop: spacing.lg }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  label: { marginTop: spacing.lg },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontSize: 15, marginTop: spacing.xs },
  textarea: { minHeight: 140, paddingTop: spacing.sm, paddingBottom: spacing.sm },
});
