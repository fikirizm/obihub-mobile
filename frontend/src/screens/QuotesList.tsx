// ObiHub teklifleri (WP-21; web components/sales/QuotesOS.jsx). GET /local-invoices?invoice_type=teklif&quote_outcome=…
// Satıra dokununca teklif açılır (düzenle / faturaya çevir / kabul-red / sil: src/screens/DocumentFormScreen.tsx).
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { canManage } from "../auth/permissions";
import { getLocalInvoices } from "../api";
import { todayIso } from "../finance";
import { useDebounce } from "../hooks/useDebounce";
import { usePagedList } from "../hooks/usePagedList";
import { OUTCOME_TABS, quoteOutcomeView } from "../quote-status";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { formatDate, formatMoney } from "../utils";
import { FileTextIcon, TagIcon } from "../components/Icons";
import { StatusBadge } from "../components/StatusBadge";
import { Chip, ChipRow } from "../ui/Chip";
import { ListBody } from "../ui/ListBody";
import { IconTile } from "../ui/ListRow";
import { RowCard } from "../ui/RowCard";
import { SearchField } from "../ui/SearchField";
import type { LocalInvoice } from "../types";

export function QuotesList() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const mayCreate = canManage(user, "billing");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [tab, setTab] = useState("");
  const today = todayIso();

  const fetchPage = useCallback(
    (page: number) => getLocalInvoices(token as string, { page, search: debounced || undefined, invoiceType: "teklif", quoteOutcome: tab || undefined }),
    [token, debounced, tab]
  );
  const list = usePagedList<LocalInvoice>(token ? fetchPage : null);
  const refreshRef = useRef(list.refreshLoaded);
  refreshRef.current = list.refreshLoaded;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refreshRef.current();
      focusedOnce.current = true;
    }, [])
  );

  return (
    <View style={styles.wrap} testID="quotes-list">
      <SearchField testID="quotes-search" value={search} onChangeText={setSearch} placeholder="Teklif no veya müşteri ara" />
      <ChipRow>
        {OUTCOME_TABS.map(([key, label]) => (
          <Chip key={key || "all"} testID={`quotes-tab-${key || "all"}`} label={label} selected={tab === key} onPress={() => setTab(key)} />
        ))}
      </ChipRow>
      <ListBody
        state={list}
        icon={<FileTextIcon size={30} color={colors.violet} />}
        emptyTitle={debounced || tab ? "Bu görünümde teklif yok" : "Henüz teklif yok"}
        emptyDescription={debounced || tab ? "Aramayı ya da sekmeyi değiştirin." : "Müşterilerinize teklif hazırlayın; kabul edilince tek dokunuşla faturaya çevirin."}
        emptyAction={mayCreate && !debounced && !tab ? { label: "Yeni teklif oluştur", onPress: () => router.push("/quotes/new") } : null}
        renderItem={(q: any) => {
          const v = quoteOutcomeView(q, today);
          const name = String(q.document_name || "").trim();
          return (
            <RowCard
              testID={`quote-${q.id}`}
              accent={v.key === "rejected" ? colors.error : v.key === "accepted" ? colors.success : undefined}
              leading={
                <IconTile tint={colors.amberSoft}>
                  <TagIcon size={18} color={colors.amber} />
                </IconTile>
              }
              title={q.customer_name || "—"}
              subtitle={[name || null, `${q.invoice_number || "Numarasız"} · ${formatDate(q.issue_date)}`].filter(Boolean).join(" · ")}
              meta={q.valid_until ? `Geçerlilik ${formatDate(q.valid_until)}` : undefined}
              amount={formatMoney(q.total, q.currency)}
              badge={<StatusBadge label={v.label} kind={v.kind} size="sm" />}
              onPress={() => router.push({ pathname: "/quotes/[id]", params: { id: q.id } })}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, paddingTop: spacing.xs } });
