import React, { useCallback, useEffect, useRef, useState } from "react";
import { ThreadSkeleton } from "../../src/components/Skeleton";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import { getSupportTicket, replySupportTicket } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import type { SupportMessage, SupportTicket } from "../../src/types";

function when(ts?: string) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default function TicketScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await getSupportTicket(token, id);
      setTicket(res.ticket);
      setMessages(res.messages);
    } catch {
      // Yüklenemezse eldeki mesajlar kalır.
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const closed = ticket?.status === "closed";
  const valid = text.trim().length >= 2;

  const send = async () => {
    if (!token || !valid) return;
    setBusy(true);
    try {
      await replySupportTicket(token, id, text.trim());
      setText("");
      await load();
    } catch (e: any) {
      toast(e?.message || "Mesaj gönderilemedi.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="ticket-screen">
      <StackHeader title={ticket?.subject || ticket?.topic || "Destek talebi"} subtitle={ticket?.ticket_code} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading ? (
          <ThreadSkeleton />
        ) : (
          <ScrollView ref={scroll} contentContainerStyle={styles.body} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
            {messages.map((m) => {
              const mine = m.sender_role === "user";
              if (m.sender_role === "system") {
                return (
                  <Text key={m.id} style={[type.caption, { color: colors.textTertiary, textAlign: "center", marginVertical: spacing.xs }]}>
                    {m.message}
                  </Text>
                );
              }
              return (
                <View key={m.id} style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
                  <View
                    style={[
                      styles.bubble,
                      mine ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
                    ]}
                  >
                    {!mine ? <Text style={[type.caption, { color: colors.textTertiary, marginBottom: 2 }]}>{m.sender_name || "ObiHub Destek"}</Text> : null}
                    <Text style={[type.body, { color: mine ? "#FFFFFF" : colors.textPrimary }]}>{m.message}</Text>
                    <Text style={[type.caption, { color: mine ? "#DBEAFE" : colors.textTertiary, marginTop: 4, textAlign: "right" }]}>{when(m.created_at)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
        {closed ? (
          <Text style={[type.footnote, { color: colors.textTertiary, textAlign: "center", padding: spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
            Bu talep kapatıldı. Yeni bir sorun için yeni talep oluşturun.
          </Text>
        ) : (
          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <TextInput
              testID="ticket-reply"
              value={text}
              onChangeText={setText}
              placeholder="Yanıt yazın"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Yanıt"
              multiline
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
            />
            <Button testID="ticket-send" label="Gönder" size="sm" busy={busy} disabled={!valid} onPress={send} />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.xs },
  bubbleRow: { flexDirection: "row" },
  bubble: { maxWidth: "84%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 44, maxHeight: 120, fontSize: 15 },
});
