import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getLocalInvoices, getLocalInvoiceSummary } from "../../src/api";
import { invoiceStatus } from "../../src/finance";
import { useDebounce } from "../../src/hooks/useDebounce";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing } from "../../src/theme/tokens";
import { formatDate, formatMoney, formatTry } from "../../src/utils";
import { AlertIcon, CheckIcon, FileTextIcon, ReceiptIcon } from "../../src/components/Icons";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import { RowCard, StatCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";
import type { LocalInvoice } from "../../src/types";

const FILTERS = [
  { key: "", label: "Tümü" },
  { key: "taslak", label: "Taslak" },
  { key: "resmilesti", label: "Resmileşti" },
  { key: "gecikti", label: "Gecikti" },
  { key: "odendi", label: "Ödendi" },
];

export default function LocalInvoicesScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<{ total_remaining?: number; overdue_amount?: number } | null>(null);

  const fetchPage = useCallback(
    (page: number) => getLocalInvoices(token as string, { page, search: debounced || undefined, status: status || undefined }),
    [token, debounced, status]
  );
  const list = usePagedList<LocalInvoice>(token ? fetchPage : null);

  useEffect(() => {
    if (token) getLocalInvoiceSummary(token).then(setSummary).catch(() => {});
  }, [token]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoices-screen">
      <StackHeader title="Satış faturaları" subtitle={list.loading ? undefined : `${list.total} fatura`} />
      {summary ? (
        <SafeAnimatedView entering={FadeInDown.duration(380)} style={styles.stats}>
          <StatCard label="Tahsil edilecek" value={formatTry(summary.total_remaining || 0)} />
          <StatCard label="Vadesi geçen" value={formatTry(summary.overdue_amount || 0)} tone={(summary.overdue_amount || 0) > 0 ? "error" : undefined} />
        </SafeAnimatedView>
      ) : null}
      <SearchField testID="local-invoices-search" value={search} onChangeText={setSearch} placeholder="Müşteri veya fatura no ara" />
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key || "all"} label={f.label} selected={status === f.key} onPress={() => setStatus(f.key)} />
        ))}
      </ChipRow>
      <ListBody
        state={list}
        icon={<ReceiptIcon size={30} color={colors.emerald} />}
        emptyTitle="Fatura yok"
        emptyDescription="Bu süzgece uyan satış faturası bulunmuyor. Yeni fatura web panelinden oluşturulur."
        renderItem={(inv) => {
          const key = String(inv.display_status || inv.status || "");
          const st = invoiceStatus(inv.display_status || inv.status);
          // Durum rengi: gecikti kırmızı, taslak sarı, ödendi yeşil; diğerleri nötr mavi simge.
          const look =
            key === "gecikti"
              ? { accent: colors.error, tint: colors.errorBg, icon: <AlertIcon size={18} color={colors.error} /> }
              : key === "taslak"
                ? { accent: colors.warning, tint: colors.warningBg, icon: <FileTextIcon size={18} color={colors.amber} /> }
                : key === "odendi"
                  ? { accent: colors.success, tint: colors.successBg, icon: <CheckIcon size={18} color={colors.success} /> }
                  : { accent: undefined, tint: colors.emeraldSoft, icon: <ReceiptIcon size={18} color={colors.emerald} /> };
          return (
            <RowCard
              testID={`local-invoice-${inv.id}`}
              accent={look.accent}
              leading={<IconTile tint={look.tint}>{look.icon}</IconTile>}
              title={inv.customer_name || "Müşteri"}
              subtitle={`${inv.invoice_number || "Numarasız"} · ${formatDate(inv.issue_date)}`}
              meta={inv.due_date ? `Vade ${formatDate(inv.due_date)}` : undefined}
              amount={formatMoney(inv.total, inv.currency)}
              badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
              onPress={() => router.push({ pathname: "/local-invoices/[id]", params: { id: inv.id } })}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
});
