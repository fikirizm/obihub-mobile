import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { getSupportTickets } from "../../src/api";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { ArrowRightIcon, MailIcon, PlusIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import type { SupportTicket } from "../../src/types";

const TICKET_STATUS: Record<string, { label: string; kind: StatusKind }> = {
  open: { label: "Açık", kind: "info" },
  queued: { label: "Sırada", kind: "info" },
  in_progress: { label: "İşlemde", kind: "info" },
  waiting_customer: { label: "Yanıtınız bekleniyor", kind: "warning" },
  resolved: { label: "Çözüldü", kind: "success" },
  closed: { label: "Kapalı", kind: "neutral" },
};

// Talep kartı: solda simge, ortada konu ve son mesaj, altta durum ile "Yeni yanıt" etiketi.
function TicketCard({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const { colors, shadows } = useTheme();
  const st = TICKET_STATUS[String(ticket.status)] || { label: ticket.status || "-", kind: "neutral" as StatusKind };
  const unread = Boolean(ticket.unread_from_support);
  const needsAttention = unread || String(ticket.status) === "waiting_customer";
  const title = ticket.subject || ticket.topic || "Destek talebi";
  const meta = [ticket.ticket_code, formatDate(ticket.last_message_at)].filter(Boolean).join(" · ");
  return (
    <PressableScale
      testID={`ticket-${ticket.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, st.label, unread ? "Yeni yanıt" : null, ticket.last_message_preview].filter(Boolean).join(", ")}
    >
      <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {needsAttention ? <View style={[styles.accent, { backgroundColor: colors.warning }]} /> : null}
        <IconTile tint={colors.emeraldSoft}>
          <MailIcon size={18} color={colors.emerald} />
        </IconTile>
        <View style={styles.body}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }, unread && styles.unreadTitle]} numberOfLines={1}>
            {title}
          </Text>
          {ticket.last_message_preview ? (
            <Text style={[type.footnote, { color: unread ? colors.textPrimary : colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
              {ticket.last_message_preview}
            </Text>
          ) : null}
          {meta ? (
            <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.badges}>
            <StatusBadge label={st.label} kind={st.kind} size="sm" />
            {unread ? (
              <View style={[styles.newPill, { backgroundColor: colors.primary }]}>
                {/* colors.primary zemin üzerinde beyaz metin (tasarım sistemi istisnası). */}
                <Text style={[type.caption, styles.newPillText]} numberOfLines={1}>
                  Yeni yanıt
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <ArrowRightIcon size={16} color={colors.textTertiary} />
      </View>
    </PressableScale>
  );
}

export default function SupportScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const fetchPage = useCallback((page: number) => getSupportTickets(token as string, page), [token]);
  const list = usePagedList<SupportTicket>(token ? fetchPage : null);
  const { refresh } = list;

  // Yeni talep veya yanıt sonrası listeye dönüldüğünde güncelle.
  useFocusEffect(
    useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="support-screen">
      <StackHeader title="Destek" subtitle={list.loading ? undefined : `${list.total} talep`} />
      <SafeAnimatedView entering={FadeInDown.duration(380)}>
        <Button
          testID="support-new"
          label="Yeni destek talebi"
          icon={<PlusIcon size={18} color="#FFFFFF" />}
          onPress={() => router.push("/support/new")}
          style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}
        />
      </SafeAnimatedView>
      <ListBody
        state={list}
        icon={<MailIcon size={30} color={colors.emerald} />}
        emptyTitle="Destek talebiniz yok"
        emptyAction={{ label: "Destek talebi aç", onPress: () => router.push("/support/new") }}
        emptyDescription="Bir sorun yaşarsanız yeni talep oluşturun; yanıtlar burada görünür."
        renderItem={(t) => <TicketCard ticket={t} onPress={() => router.push({ pathname: "/support/[id]", params: { id: t.id } })} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, minHeight: 64 },
  accent: { position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  body: { flex: 1, minWidth: 0 },
  unreadTitle: { fontWeight: "700" },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: spacing.xs },
  newPill: { borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  newPillText: { color: "#FFFFFF", fontWeight: "700" },
});
