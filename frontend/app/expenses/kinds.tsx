// Dalga 3 (P3.3): gider ekle — kayıt türü seçimi (Paraşüt "Yeni gider" menüsü). Hızlı fiş, alış faturası, banka gideri, vergi/SGK ödemesi,
// gider pusulası. Banka gideri ve vergi/SGK kasadan çıkıştır (billing.manage); diğerleri elle alış hattı.
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { KIND_MENU } from "../../src/expense-kinds";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing } from "../../src/theme/tokens";
import { DownloadIcon, ReceiptIcon, WalletIcon } from "../../src/components/Icons";
import { StackHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow } from "../../src/ui/ListRow";

export default function ExpenseKindsScreen() {
  const { colors } = useTheme();
  const go = (key: string) => {
    if (key === "quick_receipt") router.replace("/expenses/quick" as any);
    else if (key === "purchase_invoice") router.replace("/expenses/new");
    else if (key === "expense_voucher") router.replace({ pathname: "/expenses/new", params: { doc: "expense_voucher" } });
    else router.replace({ pathname: "/expenses/cash-kind", params: { kind: key } } as any);
  };
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="expense-kinds">
      <StackHeader title="Gider ekle" subtitle="Kayıt türünü seçin" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Card>
          {KIND_MENU.map((k, i) => (
            <ListRow
              key={k.key}
              testID={`expense-kind-${k.key}`}
              divider={i > 0}
              leading={
                <IconTile tint={k.key === "bank_fee" || k.key === "tax_payment" ? colors.infoBg : colors.errorBg}>
                  {k.key === "bank_fee" || k.key === "tax_payment" ? <WalletIcon size={18} color={colors.info} /> : k.key === "quick_receipt" ? <ReceiptIcon size={18} color={colors.error} /> : <DownloadIcon size={18} color={colors.error} />}
                </IconTile>
              }
              title={k.label}
              subtitle={k.hint}
              chevron
              onPress={() => go(k.key)}
            />
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
