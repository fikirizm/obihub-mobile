import React, { useCallback } from "react";
import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { getParasutExpenseInvoices } from "../../src/api";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { formatDate, formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { DownloadIcon } from "../../src/components/Icons";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import { RowCard } from "../../src/ui/RowCard";
import type { ExpenseInvoice } from "../../src/types";

// Paraşüt'e işlenmiş gider faturaları (yalnızca okuma).
export default function ExpensesScreen() {
  const { token, accountingProvider } = useAuth();
  const { colors } = useTheme();
  // BizimHesap'ta gider faturası listeleme servisi yok (web paneli de bu ekranı yalnızca Paraşüt'te açar);
  // BizimHesap kullanıcısı için Paraşüt ucu çağrılmaz.
  const unsupported = accountingProvider === "bizimhesap";
  const fetchPage = useCallback((page: number) => getParasutExpenseInvoices(token as string, page), [token]);
  const list = usePagedList<ExpenseInvoice>(token && !unsupported ? fetchPage : null);

  if (unsupported) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }} testID="expenses-screen">
        <StackHeader title="Gider faturaları" subtitle="BizimHesap" />
        <EmptyState
          icon={<DownloadIcon size={30} color={colors.textTertiary} />}
          title="BizimHesap'ta kullanılamıyor"
          description="BizimHesap gider faturalarını listeleme hizmeti sunmuyor. Giderlerinizi BizimHesap panelinden takip edebilirsiniz."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="expenses-screen">
      <StackHeader title="Gider faturaları" subtitle={list.loading ? "Paraşüt" : `${list.total} kayıt · Paraşüt`} />
      <ListBody
        state={list}
        icon={<DownloadIcon size={30} color={colors.error} />}
        emptyTitle="Gider faturası yok"
        emptyDescription="Paraşüt'e işlenmiş gider faturası bulunmuyor."
        renderItem={(inv) => (
          <RowCard
            leading={
              <IconTile tint={colors.errorBg}>
                <DownloadIcon size={18} color={colors.error} />
              </IconTile>
            }
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
