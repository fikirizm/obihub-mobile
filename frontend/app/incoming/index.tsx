import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { getIncomingInvoicePdf, getIncomingInvoices, resolveIncomingSource } from "../../src/api";
import { usePagedList } from "../../src/hooks/usePagedList";
import { openBase64Pdf } from "../../src/pdf";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { InboxIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { RowCard } from "../../src/ui/RowCard";
import type { IncomingInvoice, IncomingSource } from "../../src/types";

const SOURCE_LABELS: Record<IncomingSource, string> = { parasut: "Paraşüt", benimpos: "BenimPOS", "turkcell-efatura": "Turkcell e-Fatura" };

const IMPORT_STATUS: Record<string, { label: string; kind: StatusKind }> = {
  none: { label: "İşlenmedi", kind: "warning" },
  in_progress: { label: "İşleniyor", kind: "info" },
  applied: { label: "İçeri alındı", kind: "success" },
  needs_review: { label: "İnceleme bekliyor", kind: "warning" },
  reversed: { label: "Geri alındı", kind: "neutral" },
};

export default function IncomingInvoicesScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [resolving, setResolving] = useState(true);
  const [connected, setConnected] = useState<IncomingSource[]>([]);
  const [source, setSource] = useState<IncomingSource | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    resolveIncomingSource(token)
      .then((r) => {
        setConnected(r.connected);
        setSource(r.source);
      })
      .finally(() => setResolving(false));
  }, [token]);

  const fetchPage = useCallback((page: number) => getIncomingInvoices(token as string, source as IncomingSource, page), [token, source]);
  const list = usePagedList<IncomingInvoice>(token && source ? fetchPage : null);
  const hasPdf = source === "parasut" || source === "turkcell-efatura";

  const openPdf = async (inv: IncomingInvoice) => {
    if (!token || !source || pdfBusyId) return;
    setPdfBusyId(inv.id);
    try {
      const data = await getIncomingInvoicePdf(token, source, inv.id);
      if (!data) throw new Error("Fatura görüntüsü alınamadı.");
      await openBase64Pdf(data, `gelen-fatura-${inv.invoice_no || inv.id}`);
    } catch (e: any) {
      toast(e?.message || "Fatura açılamadı.", "error");
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="incoming-screen">
      <StackHeader title="Gelen e-faturalar" subtitle={source ? SOURCE_LABELS[source] : undefined} />
      {resolving ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : !source ? (
        <EmptyState
          icon={<InboxIcon size={30} color={colors.textTertiary} />}
          title="Gelen fatura kaynağı yok"
          description="Gelen e-faturalar Paraşüt, BenimPOS veya Turkcell e-Fatura bağlantısıyla çalışır. Bağlantı web panelinden yapılır."
        />
      ) : (
        <>
          {connected.length > 1 ? (
            <ChipRow>
              {connected.map((s) => (
                <Chip key={s} label={SOURCE_LABELS[s]} selected={s === source} onPress={() => setSource(s)} />
              ))}
            </ChipRow>
          ) : null}
          <ListBody
            state={list}
            emptyTitle="Gelen fatura yok"
            emptyDescription="Bu kaynakta gelen e-fatura bulunmuyor."
            header={
              <Text style={[type.caption, { color: colors.textTertiary, marginBottom: spacing.sm }]}>
                {hasPdf && Platform.OS !== "web" ? "Faturayı görüntülemek için satıra dokunun. " : ""}
                Faturayı gidere işleme (İçeri Al) web panelinden yapılır.
              </Text>
            }
            renderItem={(inv) => {
              const st = IMPORT_STATUS[String(inv.import_status || "none")] || IMPORT_STATUS.none;
              return (
                <RowCard
                  testID={`incoming-${inv.id}`}
                  title={inv.sender_name || "Gönderen"}
                  subtitle={[inv.invoice_no, formatDate(inv.issue_date)].filter(Boolean).join(" · ")}
                  meta={pdfBusyId === inv.id ? "Fatura açılıyor…" : inv.sender_tax_no ? `VKN ${inv.sender_tax_no}` : undefined}
                  amount={formatMoney(inv.gross_total, inv.currency)}
                  badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
                  onPress={hasPdf && Platform.OS !== "web" ? () => openPdf(inv) : undefined}
                />
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
