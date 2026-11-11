import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { createCashEntry, getCashAccount } from "../../src/api";
import { todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount, CashEntry } from "../../src/types";

const ENTRY_LABELS: Record<string, string> = { income: "Gelir", expense: "Gider", transfer_in: "Gelen virman", transfer_out: "Giden virman" };

export default function CashAccountScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, promptEntry } = useFeedback();
  const [account, setAccount] = useState<CashAccount | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"income" | "expense" | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await getCashAccount(token, id);
      setAccount(res.account);
      setEntries(res.entries);
    } catch {
      // Yüklenemezse eldeki kayıt kalır.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (kind: "income" | "expense") => {
    if (!token || !account) return;
    const entry = await promptEntry({ title: kind === "income" ? "Gelir ekle" : "Gider ekle", message: account.name, initial: 0, decimal: true, noteLabel: "Açıklama" });
    if (!entry || entry.amount <= 0) return;
    setBusy(kind);
    try {
      await createCashEntry(token, { account_id: account.id, entry_type: kind, amount: entry.amount, entry_date: todayIso(), description: entry.note || undefined });
      toast(kind === "income" ? "Gelir kaydedildi" : "Gider kaydedildi", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Kaydedilemedi.", "error");
    } finally {
      setBusy(null);
    }
  };

  const cur = account?.currency;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-account-screen">
      <StackHeader title={account?.name || "Hesap"} subtitle="Hareketler" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : !account ? (
        <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xxl }]}>Hesap bulunamadı.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card padded style={styles.block}>
            <Text style={[type.caption, { color: colors.textTertiary }]}>Bakiye</Text>
            <Text testID="cash-balance" style={[type.largeTitle, tabular, { color: Number(account.balance) < 0 ? colors.error : colors.textPrimary }]}>
              {formatMoney(account.balance, cur)}
            </Text>
            <View style={styles.actions}>
              <Button testID="cash-add-income" label="Gelir ekle" busy={busy === "income"} disabled={Boolean(busy)} onPress={() => add("income")} style={{ flex: 1 }} />
              <Button testID="cash-add-expense" label="Gider ekle" variant="secondary" busy={busy === "expense"} disabled={Boolean(busy)} onPress={() => add("expense")} style={{ flex: 1 }} />
            </View>
          </Card>

          <SectionTitle title="Hareketler" />
          {entries.length === 0 ? (
            <Text style={[type.body, { color: colors.textSecondary, marginHorizontal: spacing.lg }]}>Henüz hareket yok.</Text>
          ) : (
            <Card style={styles.block}>
              {entries.map((e, i) => {
                const incoming = e.entry_type === "income" || e.entry_type === "transfer_in";
                return (
                  <ListRow
                    key={e.id}
                    divider={i > 0}
                    title={e.description || e.counterparty_name || e.category || ENTRY_LABELS[e.entry_type] || "Hareket"}
                    subtitle={[ENTRY_LABELS[e.entry_type], e.related_account_name, formatDate(e.entry_date)].filter(Boolean).join(" · ")}
                    trailing={
                      <Text style={[type.bodyStrong, tabular, { color: incoming ? colors.success : colors.textPrimary }]}>
                        {incoming ? "+" : "-"}
                        {formatMoney(e.amount, cur)}
                      </Text>
                    }
                  />
                );
              })}
            </Card>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
