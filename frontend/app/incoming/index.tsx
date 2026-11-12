import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { getIncomingInvoicePdf, getIncomingInvoices, resolveIncomingSource } from "../../src/api";
import { getIncomingInbox, getUiCapabilities, InboxUnavailable } from "../../src/api-gider";
import { usePagedList } from "../../src/hooks/usePagedList";
import { openBase64Pdf } from "../../src/pdf";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { InboxIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { OrderCardSkeleton } from "../../src/components/Skeleton";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
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
  // Web IncomingEInvoicesPage.js: ui-capabilities.inbox_read açıksa kalıcı gelen kutusu (/incoming-inbox) okunur;
  // uç bu sağlayıcı için 404 dönerse eski sağlayıcı listesine düşülür ve oturum boyunca gelen kutusu denenmez.
  const inboxOn = useRef(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([resolveIncomingSource(token), getUiCapabilities(token)])
      .then(([r, caps]) => {
        inboxOn.current = caps.inboxRead === true;
        setConnected(r.connected);
        setSource(r.source);
      })
      .catch(() => undefined)
      .finally(() => setResolving(false));
  }, [token]);

  const fetchPage = useCallback(
    async (page: number) => {
      const src = source as IncomingSource;
      if (inboxOn.current) {
        try {
          return await getIncomingInbox(token as string, src, page);
        } catch (e) {
          if (!(e instanceof InboxUnavailable)) throw e;
          inboxOn.current = false;
        }
      }
      return getIncomingInvoices(token as string, src, page);
    },
    [token, source]
  );
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
        <View style={styles.skeleton} accessibilityLabel="Gelen faturalar yükleniyor">
          {[0, 1, 2, 3, 4].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </View>
      ) : !source ? (
        <EmptyState
          icon={<InboxIcon size={30} color={colors.amber} />}
          title="Gelen fatura kaynağı yok"
          description="Gelen e-faturalar Paraşüt, BenimPOS veya Turkcell e-Fatura bağlantısıyla çalışır. Bağlantı web panelinden yapılır."
        />
      ) : (
        <>
          {connected.length > 1 ? (
            <SafeAnimatedView entering={FadeInDown.duration(380)}>
              <ChipRow>
                {connected.map((s) => (
                  <Chip key={s} label={SOURCE_LABELS[s]} selected={s === source} onPress={() => setSource(s)} />
                ))}
              </ChipRow>
            </SafeAnimatedView>
          ) : null}
          <ListBody
            state={list}
            icon={<InboxIcon size={30} color={colors.amber} />}
            emptyTitle="Gelen fatura yok"
            emptyDescription="Bu kaynakta gelen e-fatura bulunmuyor."
            header={
              <View style={[styles.note, { backgroundColor: colors.amberSoft }]}>
                <InboxIcon size={16} color={colors.amber} />
                <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
                  {hasPdf && Platform.OS !== "web" ? "Faturayı görüntülemek için satıra dokunun. " : ""}
                  Faturayı gidere işleme (İçeri Al) web panelinden yapılır.
                </Text>
              </View>
            }
            renderItem={(inv) => {
              const key = String(inv.import_status || "none");
              const st = IMPORT_STATUS[key] || IMPORT_STATUS.none;
              // Şerit rengi içeri alma durumunu izler; bilinmeyen durum "işlenmedi" sayılır.
              const accent =
                st === IMPORT_STATUS.applied
                  ? colors.success
                  : st === IMPORT_STATUS.none || st === IMPORT_STATUS.needs_review
                    ? colors.warning
                    : st === IMPORT_STATUS.in_progress
                      ? colors.info
                      : undefined;
              return (
                <RowCard
                  testID={`incoming-${inv.id}`}
                  accent={accent}
                  leading={
                    <IconTile tint={colors.amberSoft}>
                      <InboxIcon size={18} color={colors.amber} />
                    </IconTile>
                  }
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

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  skeleton: { padding: spacing.lg, gap: spacing.sm },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm },
});
