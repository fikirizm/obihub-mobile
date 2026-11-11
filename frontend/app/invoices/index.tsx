import React from "react";
import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { InvoicesList } from "../../src/screens/InvoicesList";
import { StackHeader } from "../../src/ui/Header";

// Muhasebe programındaki satış faturaları: Paraşüt bağlıysa Paraşüt, değilse BizimHesap.
export default function AccountingInvoicesScreen() {
  const { parasutConnected } = useAuth();
  const { colors } = useTheme();
  const source = parasutConnected ? "parasut" : "bizimhesap";
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="accounting-invoices-screen">
      <StackHeader title={source === "parasut" ? "Paraşüt faturaları" : "BizimHesap faturaları"} />
      <InvoicesList source={source} />
    </View>
  );
}
