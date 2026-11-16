// Dalga 1 P1.3: gider faturası geçmişi (GET /accounting/expense-invoices/{ref}/history; en yeni üstte).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getExpenseHistory } from "../../src/api-gider";
import { historyRows, type HistoryRow } from "../../src/expense-extras";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, InboxIcon } from "../../src/components/Icons";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow } from "../../src/ui/ListRow";

const when = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function ExpenseHistoryScreen() {
  const params = useLocalSearchParams<{ ref: string; title?: string }>();
  const ref = String(params.ref || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || !ref) return;
    try {
      setRows(historyRows(await getExpenseHistory(token, ref)));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Geçmiş okunamadı.");
    }
  }, [token, ref]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="expense-history-screen">
      <StackHeader title="Fatura geçmişi" subtitle={params.title ? String(params.title) : undefined} />
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Geçmiş okunamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : !rows ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<InboxIcon size={30} color={colors.textTertiary} />} title="Kayıt yok" description="Bu fatura için henüz işlem kaydı yok." />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Card>
            {rows.map((r, i) => (
              <ListRow key={`${r.at}-${i}`} testID={`expense-history-${i}`} divider={i > 0} title={r.title} subtitle={[r.detail, when(r.at)].filter(Boolean).join(" · ")} />
            ))}
          </Card>
          <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>En yeni işlem üstte.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md } });
