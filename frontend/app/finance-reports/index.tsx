// Menü → Finans raporları: Satışlar, Giderler, Kasa/Banka ve Nakit akışı (P6.1/P6.2; salt okuma). Raporlar izniyle açılır.
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing } from "../../src/theme/tokens";
import { ChartIcon, ReceiptIcon, TrendDownIcon, TrendUpIcon, WalletIcon } from "../../src/components/Icons";
import { StackHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow } from "../../src/ui/ListRow";

export default function FinanceReportsHub() {
  const { colors } = useTheme();
  const rows: { id: string; title: string; subtitle: string; href: Href; icon: React.ReactNode; tint: string }[] = [
    { id: "sales", title: "Satışlar", subtitle: "Fatura, POS ve Paraşüt satışları; müşteri ve kategori", href: { pathname: "/finance-reports/period", params: { kind: "sales" } } as any, icon: <TrendUpIcon size={18} color={colors.success} />, tint: colors.successBg },
    { id: "expenses", title: "Giderler", subtitle: "Gider faturaları ve kayıtları; kategori, tedarikçi, etiket", href: { pathname: "/finance-reports/period", params: { kind: "expenses" } } as any, icon: <TrendDownIcon size={18} color={colors.error} />, tint: colors.errorBg },
    { id: "cash-bank", title: "Kasa/Banka", subtitle: "Hesap başına açılış, giriş, çıkış ve kapanış", href: "/finance-reports/cash-bank" as Href, icon: <WalletIcon size={18} color={colors.primary} />, tint: colors.primarySoft },
    { id: "vat", title: "KDV", subtitle: "Hesaplanan, indirilecek, ödenecek KDV ve devir", href: "/finance-reports/vat" as Href, icon: <ReceiptIcon size={18} color={colors.warning} />, tint: colors.warningBg },
    { id: "cashflow", title: "Nakit akışı", subtitle: "12 hafta ya da 12 ay beklenen giriş ve çıkışlar", href: "/finance-reports/cashflow" as Href, icon: <ChartIcon size={18} color={colors.violet} />, tint: colors.violetSoft },
  ];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="finance-reports">
      <StackHeader title="Finans raporları" subtitle="Satış, gider, KDV, kasa ve nakit akışı" />
      <ScrollView contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.huge }}>
        <Card style={styles.block}>
          {rows.map((r, i) => (
            <ListRow
              key={r.id}
              testID={`finance-report-${r.id}`}
              divider={i > 0}
              leading={<IconTile tint={r.tint}>{r.icon}</IconTile>}
              title={r.title}
              subtitle={r.subtitle}
              chevron
              onPress={() => router.push(r.href)}
            />
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg } });
