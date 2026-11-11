import React, { useCallback } from "react";
import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { getParasutExpenseInvoices } from "../../src/api";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { formatDate, formatMoney } from "../../src/utils";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { RowCard } from "../../src/ui/RowCard";
import type { ExpenseInvoice } from "../../src/types";

// Paraşüt'e işlenmiş gider faturaları (yalnızca okuma).
export default function ExpensesScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const fetchPage = useCallback((page: number) => getParasutExpenseInvoices(token as string, page), [token]);
  const list = usePagedList<ExpenseInvoice>(token ? fetchPage : null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="expenses-screen">
      <StackHeader title="Gider faturaları" subtitle={list.loading ? "Paraşüt" : `${list.total} kayıt · Paraşüt`} />
      <ListBody
        state={list}
        emptyTitle="Gider faturası yok"
        emptyDescription="Paraşüt'e işlenmiş gider faturası bulunmuyor."
        renderItem={(inv) => (
          <RowCard
            title={inv.supplier_name || inv.description || "Tedarikçi"}
            subtitle={[inv.invoice_no, formatDate(inv.issue_date)].filter(Boolean).join(" · ")}
            meta={inv.due_date ? `Vade ${formatDate(inv.due_date)}` : undefined}
            amount={formatMoney(inv.gross_total, inv.currency)}
          />
        )}
      />
    </View>
  );
}
