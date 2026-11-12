import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getLocalInvoices, getLocalInvoiceSummary } from "../../src/api";
import { invoiceStatus, isInvoiceOverdue } from "../../src/finance";
import { useDebounce } from "../../src/hooks/useDebounce";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney, formatTry } from "../../src/utils";
import { AlertIcon, CheckIcon, FileTextIcon, PlusIcon, ReceiptIcon } from "../../src/components/Icons";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import { RowCard, StatCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";
import type { LocalInvoice } from "../../src/types";

const FILTERS = [
  { key: "", label: "Tümü" },
  { key: "taslak", label: "Taslak" },
  { key: "gonderildi", label: "Gönderildi" },
  { key: "resmilesti", label: "Resmileşti" },
  { key: "gecikti", label: "Gecikti" },
  { key: "odendi", label: "Ödendi" },
];

// Aşama 4 P5a: tekil özet yalnız TRY; dövizli faturalar `by_currency`'den ayrı satırda (toplanmaz).
function OtherCurrencies({ byCurrency }: { byCurrency?: Record<string, { total_remaining?: number; overdue_amount?: number }> }) {
  const { colors } = useTheme();
  const rows = Object.entries(byCurrency || {}).filter(
    ([c, v]) => c !== "TRY" && c !== "TRL" && (Number(v?.total_remaining || 0) !== 0 || Number(v?.overdue_amount || 0) !== 0)
  );
  if (!rows.length) return null;
  return (
    <View testID="local-invoices-other-currencies" style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: 2 }}>
      {rows.map(([c, v]) => (
        <Text key={c} style={[type.caption, tabular, { color: colors.textSecondary }]} numberOfLines={1}>
          {`${c}: tahsil edilecek ${formatMoney(Number(v?.total_remaining || 0), c)}`}
          {Number(v?.overdue_amount || 0) > 0 ? ` · vadesi geçen ${formatMoney(Number(v?.overdue_amount || 0), c)}` : ""}
        </Text>
      ))}
    </View>
  );
}

export default function LocalInvoicesScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const mayCreate = canManage(user, "billing");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 350);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<{ total_remaining?: number; overdue_amount?: number; by_currency?: Record<string, { total_remaining?: number; overdue_amount?: number }> } | null>(null);

  const fetchPage = useCallback(
    (page: number) => getLocalInvoices(token as string, { page, search: debounced || undefined, status: status || undefined }),
    [token, debounced, status]
  );
  const list = usePagedList<LocalInvoice>(token ? fetchPage : null);

  // Özet yenilenemezse eski tutar gösterilmez; kartlar gizlenir.
  const loadSummary = useCallback(() => {
    if (token) getLocalInvoiceSummary(token).then(setSummary).catch(() => setSummary(null));
  }, [token]);

  // Detayda tahsilat ya da resmileştirme sonrası geri dönüldüğünde özet ve liste tazelenir.
  // Yüklenmiş sayfalar yerinde yenilenir; liste ilk sayfaya düşmez, kaydırma konumu korunur.
  const refreshRef = useRef(list.refreshLoaded);
  refreshRef.current = list.refreshLoaded;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      loadSummary();
      if (focusedOnce.current) refreshRef.current();
      focusedOnce.current = true;
    }, [loadSummary])
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoices-screen">
      <StackHeader title="Satış faturaları" subtitle={list.loading ? undefined : `${list.total} fatura`} />
      {summary ? (
        <SafeAnimatedView entering={FadeInDown.duration(380)} style={styles.stats}>
          <StatCard label="Tahsil edilecek" value={formatTry(summary.total_remaining || 0)} />
          <StatCard label="Vadesi geçen" value={formatTry(summary.overdue_amount || 0)} tone={(summary.overdue_amount || 0) > 0 ? "error" : undefined} />
        </SafeAnimatedView>
      ) : null}
      {summary ? <OtherCurrencies byCurrency={summary.by_currency} /> : null}
      {mayCreate ? (
        <View style={styles.actions}>
          <Button
            testID="local-invoices-new"
            label="Yeni fatura oluştur"
            size="sm"
            icon={<PlusIcon size={16} color={ON_HERO.text} />}
            onPress={() => router.push("/local-invoices/new")}
          />
        </View>
      ) : null}
      <SearchField testID="local-invoices-search" value={search} onChangeText={setSearch} placeholder="Müşteri veya fatura no ara" />
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key || "all"} label={f.label} selected={status === f.key} onPress={() => setStatus(f.key)} />
        ))}
      </ChipRow>
      <ListBody
        state={{ ...list, refresh: () => { loadSummary(); list.refresh(); } }}
        icon={<ReceiptIcon size={30} color={colors.emerald} />}
        emptyTitle="Fatura yok"
        emptyDescription={mayCreate ? "Bu süzgece uyan satış faturası bulunmuyor. Yukarıdaki düğmeyle yeni fatura oluşturabilirsiniz." : "Bu süzgece uyan satış faturası bulunmuyor."}
        renderItem={(inv) => {
          // "Gönderildi" ve "Resmileşti" süzgeçlerinde sunucu gecikmişleri kendi gününe göre ayıklar; rozet de sunucunun
          // durumunu gösterir. Aksi halde gece yarısından sonra satır bu süzgeçte "Gecikti" rozetiyle çıkar.
          const serverKey = String(inv.display_status || inv.status || "");
          // Aşama 4 P5a: `money_state` geldiyse rozet doğrudan ondan (sunucu tek tanım; iade belgesi alacak sayılmaz).
          const key = inv.money_state
            ? inv.money_state === "overdue"
              ? "gecikti"
              : inv.money_state === "refund"
                ? "iade"
                : serverKey === "gecikti"
                  ? "gonderildi"
                  : serverKey
            : status === "gonderildi" || status === "resmilesti"
              ? serverKey
              : isInvoiceOverdue(inv)
                ? "gecikti"
                : serverKey;
          const st = invoiceStatus(key);
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
  actions: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
});
