import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getCashAccounts } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { StackHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow } from "../../src/ui/ListRow";
import type { CashAccount } from "../../src/types";

const ACCOUNT_TYPES: Record<string, string> = {
  cash: "Nakit kasa",
  bank: "Banka",
  pos: "POS",
  credit_card: "Kredi kartı",
  marketplace: "Pazaryeri",
  other: "Diğer",
};

export default function CashScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setAccounts(await getCashAccounts(token));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Hesaplar yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-screen">
      <StackHeader title="Kasa ve bankalar" subtitle={loading ? undefined : `${accounts.length} hesap`} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title={error ? "Yüklenemedi" : "Hesap yok"}
          description={error || "Kasa ve banka hesapları web panelinden eklenir."}
          actionLabel={error ? "Tekrar dene" : undefined}
          onAction={error ? load : undefined}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxl, paddingTop: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <Card style={styles.block}>
            {accounts.map((a, i) => (
              <ListRow
                key={a.id}
                testID={`cash-account-${a.id}`}
                divider={i > 0}
                leading={<IconTile><WalletIcon size={18} color={colors.primary} /></IconTile>}
                title={a.name}
                subtitle={[ACCOUNT_TYPES[String(a.account_type)] || a.account_type, a.bank_name].filter(Boolean).join(" · ")}
                trailing={<Text style={[type.bodyStrong, tabular, { color: Number(a.balance) < 0 ? colors.error : colors.textPrimary }]}>{formatMoney(a.balance, a.currency)}</Text>}
                chevron
                onPress={() => router.push({ pathname: "/cash/[id]", params: { id: a.id } })}
              />
            ))}
          </Card>
          <Text style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
            Yeni hesap ve hesaplar arası virman web panelinden yapılır.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg } });
