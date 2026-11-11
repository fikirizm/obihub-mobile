import React, { useCallback } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getSupportTickets } from "../../src/api";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { MailIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { RowCard } from "../../src/ui/RowCard";
import type { SupportTicket } from "../../src/types";

const TICKET_STATUS: Record<string, { label: string; kind: StatusKind }> = {
  open: { label: "Açık", kind: "info" },
  queued: { label: "Sırada", kind: "info" },
  in_progress: { label: "İşlemde", kind: "info" },
  waiting_customer: { label: "Yanıtınız bekleniyor", kind: "warning" },
  resolved: { label: "Çözüldü", kind: "success" },
  closed: { label: "Kapalı", kind: "neutral" },
};

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
      <Button testID="support-new" label="Yeni destek talebi" onPress={() => router.push("/support/new")} style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }} />
      <ListBody
        state={list}
        icon={<MailIcon size={30} color={colors.textTertiary} />}
        emptyTitle="Destek talebiniz yok"
        emptyDescription="Bir sorun yaşarsanız yeni talep oluşturun; yanıtlar burada görünür."
        renderItem={(t) => {
          const st = TICKET_STATUS[String(t.status)] || { label: t.status || "-", kind: "neutral" as StatusKind };
          return (
            <RowCard
              testID={`ticket-${t.id}`}
              title={t.subject || t.topic || "Destek talebi"}
              subtitle={t.last_message_preview}
              meta={[t.ticket_code, formatDate(t.last_message_at)].filter(Boolean).join(" · ") + (t.unread_from_support ? " · Yeni yanıt" : "")}
              badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
              onPress={() => router.push({ pathname: "/support/[id]", params: { id: t.id } })}
            />
          );
        }}
      />
    </View>
  );
}
