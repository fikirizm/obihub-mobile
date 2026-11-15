// D-12: belge geçmişi (GET /local-invoices/{id}/events; en yeni önce, 50'şer). Kişi adı gelir; e-posta/firma kimliği dönmez.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getInvoiceEvents } from "../../src/api-finans";
import { eventLabel } from "../../src/document-lifecycle";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, ClockIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow } from "../../src/ui/ListRow";

const stamp = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
};

export default function InvoiceEventsScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      if (!token || !id) return;
      try {
        const r = await getInvoiceEvents(token, id, before);
        const list = Array.isArray(r?.items) ? r.items : [];
        setItems((prev) => (before ? [...prev, ...list] : list));
        setNext(r?.next_before || null);
        setState("ready");
      } catch {
        if (!before) setState("error");
      } finally {
        setMore(false);
      }
    },
    [token, id]
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoice-events-screen">
      <StackHeader title="Belge geçmişi" subtitle={params.title ? String(params.title) : undefined} />
      {state === "loading" ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : state === "error" ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Geçmiş yüklenemedi" description="Biraz sonra yeniden deneyin." actionLabel="Tekrar dene" onAction={() => load()} />
      ) : !items.length ? (
        <EmptyState icon={<ClockIcon size={30} color={colors.textTertiary} />} title="Henüz kayıt yok" description="Bu belgede yapılan işlemler burada sırayla görünür." />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Card>
            {items.map((e, i) => (
              <ListRow
                key={e.id || i}
                testID={`invoice-event-${e.id || i}`}
                divider={i > 0}
                title={eventLabel(e)}
                subtitle={[stamp(e.at), e.actor?.name || null].filter(Boolean).join(" · ")}
                meta={e.summary && e.summary !== eventLabel(e) ? e.summary : e.data?.reason ? `Gerekçe: ${e.data.reason}` : undefined}
              />
            ))}
          </Card>
          {next ? (
            <Button
              variant="secondary"
              label={more ? "Yükleniyor…" : "Daha eski kayıtlar"}
              busy={more}
              onPress={() => {
                setMore(true);
                load(next);
              }}
            />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
});
