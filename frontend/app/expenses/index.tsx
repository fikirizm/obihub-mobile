import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { getParasutExpenseInvoices } from "../../src/api";
import {
  getExpenseLedger,
  getExpenseModuleEnabled,
  getExpenseSummary,
  getUiCapabilities,
  EXPENSE_PAY,
  EXPENSE_SOURCE,
  NO_CAPS,
  type ExpensePaymentFilter,
} from "../../src/api-gider";
import { router, useFocusEffect } from "expo-router";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { AlertIcon, DownloadIcon, PlusIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { SummaryHero } from "../../src/ui/SummaryHero";
import { StackHeader } from "../../src/ui/Header";
import { Button } from "../../src/ui/Button";
import { canManage } from "../../src/auth/permissions";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import { RowCard } from "../../src/ui/RowCard";
import type { ExpenseInvoice, ExpenseLedgerRow, ExpenseSummaryRow, UiCapabilities } from "../../src/types";

// Web ile aynı (frontend/src/pages/ExpenseInvoicesPage.js): varsayılan liste ObiHub'ın kendi gider defteri
// (GET /accounting/expense-invoices; muhasebe bağlantısı gerekmez). "Paraşüt'teki kayıtlar" yalnız
// ui-capabilities.parasut_expense_view açıkken ayrı sekmedir; kapalıyken /parasut/expense-invoices hiç çağrılmaz.
// Mobilde yalnız okuma: elle gider girişi, ödeme ve kategori yönetimi web panelindedir.

type Tab = "obihub" | "parasut";

const FILTERS: [ExpensePaymentFilter, string][] = [
  ["", "Tümü"],
  ["open", "Açık"],
  ["overdue", "Gecikmiş"],
  ["paid", "Ödendi"],
];

// Web ExpenseInvoiceDetail.jsx PAY tablosu.

export default function ExpensesScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("obihub");
  const [payment, setPayment] = useState<ExpensePaymentFilter>("");
  // 16 Kas: liste varsayılanı arşivi gizler; "Arşiv" çipi archived=true görünümü.
  const [archived, setArchived] = useState(false);
  const [caps, setCaps] = useState<UiCapabilities>(NO_CAPS);
  const [moduleOn, setModuleOn] = useState(true);
  const [summary, setSummary] = useState<ExpenseSummaryRow[]>([]);
  const metaLoaded = useRef(false);
  const summarySeq = useRef(0);

  // ObiHub defteri: özet her başarılı ilk sayfadan sonra istenir; özet hatası listeyi kapatmaz.
  const fetchLedger = useCallback(
    async (page: number) => {
      const res = await getExpenseLedger(token as string, { page, payment, archived });
      if (page === 1) {
        const my = ++summarySeq.current;
        getExpenseSummary(token as string)
          .then((s) => my === summarySeq.current && setSummary(s))
          .catch(() => my === summarySeq.current && setSummary([]));
      }
      return res;
    },
    [token, payment, archived]
  );
  const ledger = usePagedList<ExpenseLedgerRow>(token && tab === "obihub" ? fetchLedger : null);
  // Detay/ödeme ya da yeni kayıt ekranından dönüldüğünde yüklü sayfalar ve özet sessizce tazelenir.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current && tab === "obihub") {
        ledger.refreshLoaded();
        if (token) getExpenseSummary(token).then(setSummary).catch(() => undefined);
      }
      focusedOnce.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, token])
  );

  // Yetenekler ve ayar: ilk başarılı listeden sonra bir kez (web ile aynı); okunamazsa kapalı / varsayılan açık.
  useEffect(() => {
    if (!token || metaLoaded.current || ledger.loading || ledger.error) return;
    metaLoaded.current = true;
    Promise.all([getUiCapabilities(token), getExpenseModuleEnabled(token)])
      .then(([c, m]) => {
        // Okuma başarısızsa (NO_CAPS) bir sonraki yüklemede yeniden denenir.
        if (c === NO_CAPS) metaLoaded.current = false;
        setCaps(c);
        setModuleOn(m);
      })
      .catch(() => {
        // Geçici hatada bir sonraki yüklemede yeniden okunur.
        metaLoaded.current = false;
      });
  }, [token, ledger.loading, ledger.error]);

  const parasutOn = caps.parasutView === true;
  useEffect(() => {
    if (tab === "parasut" && !parasutOn) setTab("obihub");
  }, [tab, parasutOn]);

  const fetchParasut = useCallback((page: number) => getParasutExpenseInvoices(token as string, page), [token]);
  const parasut = usePagedList<ExpenseInvoice>(token && tab === "parasut" && parasutOn ? fetchParasut : null);

  const subtitle =
    tab === "parasut"
      ? parasut.loading
        ? "Paraşüt"
        : `${parasut.total} kayıt · Paraşüt`
      : ledger.loading
        ? undefined
        : `${ledger.total} kayıt`;

  const tabs = parasutOn ? (
    <ChipRow>
      <Chip testID="expenses-tab-obihub" label="ObiHub kayıtları" selected={tab === "obihub"} onPress={() => setTab("obihub")} />
      <Chip testID="expenses-tab-parasut" label="Paraşüt'teki kayıtlar" selected={tab === "parasut"} onPress={() => setTab("parasut")} />
    </ChipRow>
  ) : null;

  const note = (text: string, tone: "info" | "warning" = "info") => (
    <View style={[styles.note, { backgroundColor: tone === "warning" ? colors.amberSoft : colors.infoBg }]}>
      <AlertIcon size={16} color={tone === "warning" ? colors.amber : colors.info} />
      <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  );

  if (tab === "parasut" && parasutOn) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="expenses-screen">
        <StackHeader title="Gider faturaları" subtitle={subtitle} />
        {tabs}
        <ListBody
          state={parasut}
          icon={<DownloadIcon size={30} color={colors.error} />}
          emptyTitle="Gider faturası yok"
          emptyDescription="Paraşüt'te gider faturası bulunmuyor."
          header={note("Bu sekme Paraşüt'ten canlı çekilir ve salt okumadır; ObiHub defterine işlenmez.")}
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

  // Web ExpenseInvoicesPage canWrite: modül açık ve elle giriş yeteneği; mobilde fatura yönetme izni de aranır.
  const canAdd = moduleOn && caps.manualEntry === true && canManage(user, "billing");
  const header = (
    <View>
      {!moduleOn ? note("ObiHub ön muhasebesi kapalı. Mevcut kayıtlar yalnız görüntülenir; Ayarlar'dan yeniden açabilirsiniz.", "warning") : null}
      {summary.map((c) => (
        <SummaryHero
          key={c.currency}
          testID={`expenses-summary-${c.currency}`}
          tone="blue"
          label={`Ödenecek borç · ${c.currency === "TRY" ? "TL" : c.currency}`}
          value={formatMoney(c.payable, c.currency)}
          amount={Number(c.payable) || 0}
          format={(n) => formatMoney(n, c.currency)}
          facts={[{ label: "Gecikmiş", value: formatMoney(c.overdue, c.currency), tone: c.overdue > 0 ? "bad" : undefined }]}
          style={{ marginHorizontal: 0, marginBottom: spacing.sm }}
        />
      ))}
      {canAdd ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Button testID="expenses-new" label="Gider ekle" icon={<PlusIcon size={18} color="#FFFFFF" />} onPress={() => router.push("/expenses/kinds" as any)} />
        </View>
      ) : null}
      {note("Satıra dokunarak ayrıntıyı açın ve ödeme ekleyin. Gider kategorilerini web panelinden yönetin.")}
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="expenses-screen">
      <StackHeader title="Gider faturaları" subtitle={subtitle} />
      {tabs}
      <ChipRow>
        {FILTERS.map(([id, label]) => (
          <Chip key={id || "all"} testID={`expenses-filter-${id || "all"}`} label={label} selected={payment === id} onPress={() => setPayment(id)} />
        ))}
        <Chip testID="expenses-filter-archived" label="Arşiv" selected={archived} onPress={() => setArchived(!archived)} />
      </ChipRow>
      <ListBody
        state={ledger}
        icon={<DownloadIcon size={30} color={colors.error} />}
        emptyTitle={payment ? "Bu görünümde gider faturası yok" : "Henüz gider faturası yok"}
        emptyAction={payment ? { label: "Süzgeci temizle", onPress: () => setPayment("") } : canAdd ? { label: "Gider / alış ekle", onPress: () => router.push("/expenses/kinds" as any) } : null}
        emptyDescription={payment ? "Süzgeci değiştirin." : "Gelen e-faturaları içeri aldığınızda ya da web panelinden gider eklediğinizde burada listelenir."}
        header={header}
        renderItem={(x) => {
          const st = EXPENSE_PAY[x.reversed ? "reversed" : String(x.payment_status || "unknown")] || EXPENSE_PAY.unknown;
          const cur = x.currency || "TRY";
          const metaParts = [
            x.due_date ? `Vade ${formatDate(x.due_date)}` : null,
            x.remaining !== null && !x.reversed && x.payment_status !== "paid" ? `Kalan ${formatMoney(x.remaining, cur)}` : null,
            x.source_kind ? EXPENSE_SOURCE[x.source_kind] : null,
            // 16 Kas: ObiHub sınıflandırması yoksa Paraşüt kategorisi (salt okunur).
            x.category ? (x.category.parasut ? `${x.category.name} (Paraşüt kategorisi)` : x.category.name) : null,
          ].filter(Boolean);
          return (
            <RowCard
              testID={`expense-${x.id}`}
              onPress={() => router.push({ pathname: "/expenses/[id]", params: { id: x.id } })}
              accent={x.payment_status === "overdue" && !x.reversed ? colors.error : undefined}
              leading={
                <IconTile tint={colors.errorBg}>
                  <DownloadIcon size={18} color={colors.error} />
                </IconTile>
              }
              title={x.supplier_name || "Tedarikçi"}
              subtitle={[x.document_number, x.issue_date ? formatDate(x.issue_date) : null].filter(Boolean).join(" · ") || undefined}
              meta={metaParts.length ? metaParts.join(" · ") : undefined}
              amount={x.total !== null ? formatMoney(x.total, cur) : "—"}
              badge={<StatusBadge label={x.archived ? "Arşivde" : st.label} kind={x.archived ? "neutral" : st.kind} size="sm" />}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm },
});
