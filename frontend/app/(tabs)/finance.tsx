import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canAccess } from "../../src/auth/permissions";
import { getFinanceOverview } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney, formatTry } from "../../src/utils";
import { DownloadIcon, FileTextIcon, InboxIcon, ReceiptIcon, TagIcon, UserIcon, WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import { TabHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { StatCard } from "../../src/ui/RowCard";
import type { FinanceOverview } from "../../src/types";

export default function FinanceScreen() {
  const { token, user, parasutConnected, accountingProvider } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const billing = canAccess(user, "billing");
  const customers = canAccess(user, "customers");

  const load = useCallback(async () => {
    if (!token || !billing) return;
    try {
      setData(await getFinanceOverview(token));
    } catch {
      // Özet alınamazsa bağlantılar yine kullanılabilir.
    } finally {
      setRefreshing(false);
    }
  }, [token, billing]);

  useFocusLoad(load, { hasData: Boolean(data), staleMs: 60 * 1000 });

  if (!billing && !customers) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="finance-screen">
        <TabHeader title="Finans" />
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="Finans ekranlarına yetkiniz yok"
          description="Bu bölüm hesap sahibi ve muhasebe rolündeki kullanıcılara açıktır."
        />
      </View>
    );
  }

  const invoiceSource = parasutConnected ? "Paraşüt" : accountingProvider === "bizimhesap" ? "BizimHesap" : null;
  const upcoming = (data?.upcoming || []).slice(0, 5);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="finance-screen">
      <TabHeader title="Finans" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {billing && data ? (
          <>
            <View style={styles.stats}>
              <StatCard label="Kasa ve banka" value={formatTry(data.cash_balance)} />
            </View>
            <View style={styles.stats}>
              <StatCard label="Alacak" value={formatTry(data.receivable)} tone="success" />
              <StatCard label="Borç" value={formatTry(data.payable)} />
            </View>
            {data.overdue_receivable > 0 || data.overdue_payable > 0 ? (
              <View style={styles.stats}>
                <StatCard label="Vadesi geçen alacak" value={formatTry(data.overdue_receivable)} tone={data.overdue_receivable > 0 ? "error" : undefined} />
                <StatCard label="Vadesi geçen borç" value={formatTry(data.overdue_payable)} tone={data.overdue_payable > 0 ? "error" : undefined} />
              </View>
            ) : null}
            {upcoming.length > 0 ? (
              <>
                <SectionTitle title="Yaklaşan vadeler" />
                <Card style={styles.block}>
                  {upcoming.map((u, i) => {
                    const overdue = Boolean(u.date && data.today && u.date < data.today);
                    return (
                      <ListRow
                        key={`${u.reference || u.title}-${i}`}
                        divider={i > 0}
                        title={u.title || (u.kind === "receivable" ? "Alacak" : "Borç")}
                        subtitle={`${u.kind === "receivable" ? "Alacak" : "Borç"} · ${formatDate(u.date)}${overdue ? " · vadesi geçti" : ""}`}
                        trailing={
                          <Text style={[type.bodyStrong, tabular, { color: overdue ? colors.error : colors.textPrimary }]}>
                            {formatMoney(u.amount, u.currency)}
                          </Text>
                        }
                      />
                    );
                  })}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        <SectionTitle title="İşlemler" />
        <Card style={styles.block}>
          {billing ? (
            <ListRow
              testID="finance-local-invoices"
              leading={<IconTile><ReceiptIcon size={18} color={colors.primary} /></IconTile>}
              title="Satış faturaları"
              subtitle="ObiHub'da oluşturulan faturalar"
              chevron
              onPress={() => router.push("/local-invoices")}
            />
          ) : null}
          {billing && invoiceSource ? (
            <ListRow
              testID="finance-accounting-invoices"
              divider
              leading={<IconTile><FileTextIcon size={18} color={colors.primary} /></IconTile>}
              title={`${invoiceSource} faturaları`}
              subtitle="Muhasebe programındaki satış faturaları"
              chevron
              onPress={() => router.push("/invoices")}
            />
          ) : null}
          {billing && parasutConnected ? (
            <ListRow
              testID="finance-offers"
              divider
              leading={<IconTile><TagIcon size={18} color={colors.primary} /></IconTile>}
              title="Teklifler"
              subtitle="Paraşüt satış teklifleri"
              chevron
              onPress={() => router.push("/offers")}
            />
          ) : null}
          {customers ? (
            <ListRow
              testID="finance-customers"
              divider={billing}
              leading={<IconTile><UserIcon size={18} color={colors.primary} /></IconTile>}
              title="Cari hesaplar"
              subtitle="Bakiye, ekstre ve tahsilat"
              chevron
              onPress={() => router.push("/customers")}
            />
          ) : null}
          {billing ? (
            <ListRow
              testID="finance-cash"
              divider
              leading={<IconTile><WalletIcon size={18} color={colors.primary} /></IconTile>}
              title="Kasa ve bankalar"
              subtitle="Hesap bakiyeleri ve hareketler"
              chevron
              onPress={() => router.push("/cash")}
            />
          ) : null}
        </Card>

        {billing ? (
          <>
            <SectionTitle title="Giderler" />
            <Card style={styles.block}>
              <ListRow
                testID="finance-incoming"
                leading={<IconTile><InboxIcon size={18} color={colors.primary} /></IconTile>}
                title="Gelen e-faturalar"
                subtitle="Tedarikçilerden gelen faturalar"
                chevron
                onPress={() => router.push("/incoming")}
              />
              {parasutConnected ? (
                <ListRow
                  testID="finance-expenses"
                  divider
                  leading={<IconTile><DownloadIcon size={18} color={colors.primary} /></IconTile>}
                  title="Gider faturaları"
                  subtitle="Paraşüt'e işlenmiş giderler"
                  chevron
                  onPress={() => router.push("/expenses")}
                />
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
});
