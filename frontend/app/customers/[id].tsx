import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { collectPartyPayment, getPartyLedger } from "../../src/api";
import { PAYMENT_METHODS, todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatTry } from "../../src/utils";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { PartyLedgerRow } from "../../src/types";

export default function CustomerDetailScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; balance?: string; registered?: string }>();
  const id = String(params.id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, promptEntry } = useFeedback();
  const [rows, setRows] = useState<PartyLedgerRow[]>([]);
  const [balance, setBalance] = useState(Number(params.balance || 0));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Tahsilat yalnızca kayıtlı carilerde yapılabilir; siparişlerden türetilen carilerde uç 404 döner.
  const registered = params.registered === "1";
  const mayCollect = canManage(user, "customers") || canManage(user, "billing");

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await getPartyLedger(token, id);
      setRows(res.rows);
      setBalance(res.balance);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Ekstre yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const onCollect = async () => {
    if (!token) return;
    const entry = await promptEntry({
      title: "Tahsilat al",
      message: String(params.name || ""),
      initial: Math.max(0, balance),
      decimal: true,
      noteLabel: "Not (isteğe bağlı)",
      methods: [...PAYMENT_METHODS],
    });
    if (!entry || entry.amount <= 0) return;
    const method = entry.method || "nakit";
    setBusy(true);
    try {
      await collectPartyPayment(token, id, { amount: entry.amount, payment_method: method, note: entry.note || undefined, payment_date: todayIso() });
      toast("Tahsilat kaydedildi", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Tahsilat kaydedilemedi.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="customer-detail">
      <StackHeader title={String(params.name || "Cari")} subtitle="Ekstre" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <Card padded style={styles.block}>
          <Text style={[type.caption, { color: colors.textTertiary }]}>{balance > 0 ? "Alacağınız" : balance < 0 ? "Borcunuz" : "Bakiye"}</Text>
          <Text testID="customer-balance" style={[type.largeTitle, tabular, { color: balance > 0 ? colors.success : balance < 0 ? colors.error : colors.textPrimary }]}>
            {formatTry(Math.abs(balance))}
          </Text>
          {registered && mayCollect ? <Button testID="customer-collect" label="Tahsilat al" busy={busy} onPress={onCollect} style={{ marginTop: spacing.md }} /> : null}
        </Card>
        {!registered && mayCollect ? (
          <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>
            Bu cari siparişlerden oluşmuş. Tahsilat almak için web panelinde cari olarak kaydedin.
          </Text>
        ) : null}

        <SectionTitle title="Hareketler" />
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : error ? (
          <Text style={[type.body, styles.note, { color: colors.error }]}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={[type.body, styles.note, { color: colors.textSecondary }]}>Henüz hareket yok.</Text>
        ) : (
          <Card style={styles.block}>
            {rows.map((r, i) => {
              const debit = Number(r.debit || 0);
              const credit = Number(r.credit || 0);
              return (
                <ListRow
                  key={r.id || i}
                  divider={i > 0}
                  title={r.description || r.reference || "Hareket"}
                  subtitle={formatDate(r.date)}
                  meta={r.balance != null ? `Bakiye ${formatTry(r.balance)}` : undefined}
                  trailing={
                    <Text style={[type.bodyStrong, tabular, { color: credit > 0 ? colors.success : colors.textPrimary }]}>
                      {credit > 0 ? `-${formatTry(credit)}` : `+${formatTry(debit)}`}
                    </Text>
                  }
                />
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg }, note: { marginHorizontal: spacing.lg, marginTop: spacing.sm } });
