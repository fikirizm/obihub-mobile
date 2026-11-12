import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { getParasutExpenseInvoices } from "../../src/api";
import {
  getExpenseLedger,
  getExpenseModuleEnabled,
  getExpenseSummary,
  getUiCapabilities,
  NO_CAPS,
  type ExpensePaymentFilter,
} from "../../src/api-gider";
import { usePagedList } from "../../src/hooks/usePagedList";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { AlertIcon, DownloadIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import { RowCard, StatCard } from "../../src/ui/RowCard";
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
const PAY: Record<string, { label: string; kind: StatusKind }> = {
  pending: { label: "Ödenecek", kind: "info" },
  partial: { label: "Kısmi ödendi", kind: "info" },
  overdue: { label: "Gecikti", kind: "error" },
  paid: { label: "Ödendi", kind: "success" },
  unknown: { label: "Bilinmiyor", kind: "neutral" },
  reversed: { label: "Geri alındı", kind: "neutral" },
};

const SOURCE: Record<string, string> = { import: "İçeri alınan", manual: "Elle girilen", legacy: "Eski kayıt" };

export default function ExpensesScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("obihub");
  const [payment, setPayment] = useState<ExpensePaymentFilter>("");
  const [caps, setCaps] = useState<UiCapabilities>(NO_CAPS);
  const [moduleOn, setModuleOn] = useState(true);
  const [summary, setSummary] = useState<ExpenseSummaryRow[]>([]);
  const metaLoaded = useRef(false);
  const summarySeq = useRef(0);

  // ObiHub defteri: özet her başarılı ilk sayfadan sonra istenir; özet hatası listeyi kapatmaz.
  const fetchLedger = useCallback(
    async (page: number) => {
      const res = await getExpenseLedger(token as string, { page, payment });
      if (page === 1) {
        const my = ++summarySeq.current;
        getExpenseSummary(token as string)
          .then((s) => my === summarySeq.current && setSummary(s))
          .catch(() => my === summarySeq.current && setSummary([]));
      }
      return res;
    },
    [token, payment]
  );
  const ledger = usePagedList<ExpenseLedgerRow>(token && tab === "obihub" ? fetchLedger : null);

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

  const header = (
    <View>
      {!moduleOn ? note("ObiHub ön muhasebesi kapalı. Mevcut kayıtlar yalnız görüntülenir; Ayarlar'dan yeniden açabilirsiniz.", "warning") : null}
      {summary.map((c) => (
        <View key={c.currency} style={styles.stats} testID={`expenses-summary-${c.currency}`}>
          <StatCard label={`Ödenecek borç · ${c.currency}`} value={formatMoney(c.payable, c.currency)} />
          <StatCard label={`Gecikmiş · ${c.currency}`} value={formatMoney(c.overdue, c.currency)} tone={c.overdue > 0 ? "error" : undefined} />
        </View>
      ))}
      {note("Gider eklemek, ödeme kaydetmek ve kategorileri yönetmek için web panelini kullanın.")}
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
      </ChipRow>
      <ListBody
        state={ledger}
        icon={<DownloadIcon size={30} color={colors.error} />}
        emptyTitle={payment ? "Bu görünümde gider faturası yok" : "Henüz gider faturası yok"}
        emptyDescription={payment ? "Süzgeci değiştirin." : "Gelen e-faturaları içeri aldığınızda ya da web panelinden gider eklediğinizde burada listelenir."}
        header={header}
        renderItem={(x) => {
          const st = PAY[x.reversed ? "reversed" : String(x.payment_status || "unknown")] || PAY.unknown;
          const cur = x.currency || "TRY";
          const metaParts = [
            x.due_date ? `Vade ${formatDate(x.due_date)}` : null,
            x.remaining !== null && !x.reversed && x.payment_status !== "paid" ? `Kalan ${formatMoney(x.remaining, cur)}` : null,
            x.source_kind ? SOURCE[x.source_kind] : null,
          ].filter(Boolean);
          return (
            <RowCard
              testID={`expense-${x.id}`}
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
              badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  stats: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm },
});
