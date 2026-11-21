// Gelen e-faturalar — kalıcı gelen kutusu (D-17; web IncomingEInvoicesPage + IncomingInvoicesOS + IncomingWorkflow).
// Görünümler (İşlenmemiş / Arşivlenmiş / Reddedilen / Tümü, sayılarıyla), sunucu araması ve sıralaması; satırda KDV dahil tutar,
// belge durumu (onay bekleyende kalan gün), tür, içeri alma durumu ve kabul/red yanıt notu. "Seç" kipinde toplu arşiv (yalnız ObiHub)
// ve en çok 20 belge PDF/XML zip. Kabul et / Reddet faturanın İçeri Al ekranındadır (onay penceresiyle, geri alınamaz).
// Gelen kutusu kapalıysa (ui-capabilities.inbox_read yok ya da 404) eski sağlayıcı listesine düşülür.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../src/auth/AuthProvider";
import { getIncomingInvoicePdf, getIncomingInvoices, resolveIncomingSource } from "../../src/api";
import { BENIMPOS_TEXT, NO_SOURCE_TEXT } from "../../src/incoming-source";
import { archiveInbox, downloadInbox, getIncomingInbox, getUiCapabilities, InboxUnavailable, type InboxMeta } from "../../src/api-gider";
import { getQuickImportCapability } from "../../src/api-iceri-al";
import { acceptGate } from "../../src/api-iceri-al";
import { archiveText, DEFAULT_VIEW, downloadProblem, downloadText, MAX_DOWNLOAD, responseNote, SORT_OPTIONS, VIEW_OPTIONS, viewLabel } from "../../src/inbox-ui";
import { canManage } from "../../src/auth/permissions";
import { router, useFocusEffect } from "expo-router";
import { useDebounce } from "../../src/hooks/useDebounce";
import { usePagedList } from "../../src/hooks/usePagedList";
import { openBase64Pdf } from "../../src/pdf";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import type { StatusKind } from "../../src/utils";
import { CheckIcon, InboxIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { OrderCardSkeleton } from "../../src/components/Skeleton";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ListBody } from "../../src/ui/ListBody";
import { IconTile } from "../../src/ui/ListRow";
import { RowCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";
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
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [resolving, setResolving] = useState(true);
  const [connected, setConnected] = useState<IncomingSource[]>([]);
  const [source, setSource] = useState<IncomingSource | null>(null);
  const [benimposOnly, setBenimposOnly] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [importOn, setImportOn] = useState(false);
  const mayWrite = canManage(user, "billing");
  useEffect(() => {
    if (!token || !source) return;
    let live = true;
    getQuickImportCapability(token, source).then((c) => live && setImportOn(Boolean(c) && mayWrite));
    return () => {
      live = false;
    };
  }, [token, source, mayWrite]);
  // ui-capabilities.inbox_read açıksa kalıcı gelen kutusu; uç 404 dönerse eski sağlayıcı listesine düşülür.
  const inboxOn = useRef(false);
  const [inboxServed, setInboxServed] = useState(false);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [sort, setSort] = useState("-issue_date");
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim(), 350);
  const [meta, setMeta] = useState<InboxMeta | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState("");

  useEffect(() => {
    if (!token) return;
    Promise.all([resolveIncomingSource(token), getUiCapabilities(token)])
      .then(([r, caps]) => {
        inboxOn.current = caps.inboxRead === true;
        setConnected(r.connected);
        setSource(r.source);
        setBenimposOnly(r.benimposOnly);
      })
      .catch(() => undefined)
      .finally(() => setResolving(false));
  }, [token]);

  const fetchPage = useCallback(
    async (page: number) => {
      const src = source as IncomingSource;
      if (inboxOn.current) {
        try {
          const res = await getIncomingInbox(token as string, src, page, { q, view, sort, onMeta: setMeta });
          setInboxServed(true);
          return res;
        } catch (e) {
          if (!(e instanceof InboxUnavailable)) throw e;
          inboxOn.current = false;
        }
      }
      setInboxServed(false);
      return getIncomingInvoices(token as string, src, page);
    },
    [token, source, q, view, sort]
  );
  const list = usePagedList<IncomingInvoice>(token && source ? fetchPage : null);
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) list.refreshLoaded();
      focusedOnce.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  useEffect(() => {
    setSelected([]);
  }, [view, q, source]);
  const hasPdf = source === "parasut" || source === "turkcell-efatura";
  const caps = meta?.capabilities || {};
  const canArchive = inboxServed && mayWrite && caps.archive !== false;
  const canDownload = inboxServed && caps.download !== false && source === "parasut";

  const openPdf = async (inv: IncomingInvoice) => {
    if (!token || !source || pdfBusyId) return;
    setPdfBusyId(inv.id);
    try {
      const data = await getIncomingInvoicePdf(token, source, inv.pdf_id || inv.id);
      if (!data) throw new Error("Fatura görüntüsü alınamadı.");
      await openBase64Pdf(data, `gelen-fatura-${inv.invoice_no || inv.id}`);
    } catch (e: any) {
      toast(e?.message || "Fatura açılamadı.", "error");
    } finally {
      setPdfBusyId(null);
    }
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const endSelect = () => {
    setSelecting(false);
    setSelected([]);
  };
  const archived = view === "archived";
  const doArchive = async () => {
    if (!token || !source || bulkBusy || !selected.length) return;
    setBulkBusy("archive");
    try {
      const res = await archiveInbox(token, source, selected, !archived);
      toast(archiveText(Array.isArray(res?.updated) ? res.updated.length : selected.length, !archived), "success");
      endSelect();
      list.refresh();
    } catch (e: any) {
      toast(e?.message || "Arşiv işlemi yapılamadı.", "error");
    } finally {
      setBulkBusy("");
    }
  };
  const doDownload = async (format: "pdf" | "xml") => {
    if (!token || !source || bulkBusy) return;
    const problem = downloadProblem(selected.length);
    if (problem) return toast(problem, "error");
    setBulkBusy(format);
    try {
      const res = await downloadInbox(token, source, selected, format);
      // Zip cihaza yazılır ve paylaşım penceresiyle (Dosyalar'a kaydet, e-posta…) verilir. Web önizlemesinde dosya sistemi yoktur.
      if (Platform.OS !== "web") {
        const path = `${FileSystem.cacheDirectory}gelen-e-faturalar-${format}.zip`;
        await FileSystem.writeAsStringAsync(path, res.base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: "application/zip", dialogTitle: "Gelen e-faturalar" });
      }
      toast(downloadText(res.count, res.missing, format), res.missing > 0 ? "info" : "success");
    } catch (e: any) {
      toast(e?.message || "Belgeler indirilemedi.", "error");
    } finally {
      setBulkBusy("");
    }
  };

  const openRow = (inv: IncomingInvoice) => {
    const key = String(inv.import_status || "none");
    // Kabul/red bekleyen ticari fatura İçeri Al ekranında yanıtlanır; içeri alma kapalı olsa da açılır.
    if (importOn || (inv.can_respond && mayWrite && caps.respond !== false)) {
      router.push({
        pathname: "/incoming/[id]",
        params: {
          id: inv.id,
          provider: source as string,
          status: key,
          reimportable: inv.import_reimportable ? "1" : "0",
          title: [inv.sender_name, inv.invoice_no].filter(Boolean).join(" · "),
          pdf: inv.pdf_id || inv.id,
          respond: inv.can_respond && caps.respond !== false ? "1" : "0",
          elsewhere: inv.importedElsewhere ? "1" : "0",
          block: inv.importBlock?.code || "",
          blockDetail: inv.importBlock?.detail || "",
        },
      });
    } else if (hasPdf && Platform.OS !== "web") openPdf(inv);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="incoming-screen">
      <StackHeader
        title="Gelen e-faturalar"
        subtitle={source ? SOURCE_LABELS[source] : undefined}
        right={
          inboxServed && (canArchive || canDownload) ? (
            <Button testID="incoming-select" size="sm" variant={selecting ? "secondary" : "ghost"} label={selecting ? "Bitti" : "Seç"} onPress={() => (selecting ? endSelect() : setSelecting(true))} />
          ) : undefined
        }
      />
      {resolving ? (
        <View style={styles.skeleton} accessibilityLabel="Gelen faturalar yükleniyor">
          {[0, 1, 2, 3, 4].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </View>
      ) : !source ? (
        <EmptyState
          icon={<InboxIcon size={30} color={colors.amber} />}
          title={benimposOnly ? "BenimPOS gelen e-fatura kaynağı değil" : "Gelen fatura kaynağı yok"}
          description={benimposOnly ? BENIMPOS_TEXT : NO_SOURCE_TEXT}
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
          {inboxServed || inboxOn.current ? (
            <>
              <ChipRow>
                {VIEW_OPTIONS.map(([v]) => (
                  <Chip key={v} testID={`incoming-view-${v}`} label={viewLabel(v, meta?.viewCounts)} selected={view === v} onPress={() => setView(v)} />
                ))}
              </ChipRow>
              <SearchField testID="incoming-search" value={search} onChangeText={setSearch} placeholder="Fatura no, tedarikçi, VKN ara" />
              <ChipRow>
                {SORT_OPTIONS.map(([v, l]) => (
                  <Chip key={v} testID={`incoming-sort-${v}`} label={l} selected={sort === v} onPress={() => setSort(v)} />
                ))}
              </ChipRow>
            </>
          ) : null}
          {selecting ? (
            <View testID="incoming-bulk" style={[styles.bulk, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={[type.callout, { color: colors.textPrimary, fontWeight: "700" }]}>{selected.length ? `${selected.length} belge seçildi` : "Belgeleri seçin"}</Text>
              <View style={styles.bulkRow}>
                {canArchive ? (
                  <Button
                    testID="incoming-archive"
                    size="sm"
                    variant="secondary"
                    label={archived ? "Arşivden çıkar" : "Arşivle"}
                    busy={bulkBusy === "archive"}
                    disabled={!selected.length || Boolean(bulkBusy)}
                    onPress={doArchive}
                  />
                ) : null}
                {canDownload ? (
                  <>
                    <Button testID="incoming-download-pdf" size="sm" variant="secondary" label="PDF indir" busy={bulkBusy === "pdf"} disabled={!selected.length || selected.length > MAX_DOWNLOAD || Boolean(bulkBusy)} onPress={() => doDownload("pdf")} />
                    <Button testID="incoming-download-xml" size="sm" variant="secondary" label="XML indir" busy={bulkBusy === "xml"} disabled={!selected.length || selected.length > MAX_DOWNLOAD || Boolean(bulkBusy)} onPress={() => doDownload("xml")} />
                  </>
                ) : null}
              </View>
              <Text style={[type.caption, { color: selected.length > MAX_DOWNLOAD ? colors.error : colors.textTertiary }]}>
                {selected.length > MAX_DOWNLOAD ? `İndirme için en çok ${MAX_DOWNLOAD} belge seçin.` : "Arşiv yalnız ObiHub görünümünü değiştirir; Paraşüt'e yazılmaz."}
              </Text>
            </View>
          ) : null}
          <ListBody
            state={list}
            icon={<InboxIcon size={30} color={colors.amber} />}
            emptyTitle={inboxServed && view !== "all" ? "Bu görünümde fatura yok" : "Gelen fatura yok"}
            emptyDescription={inboxServed && (view !== "all" || q) ? "Görünümü ya da aramayı değiştirin." : "Bu kaynakta gelen e-fatura bulunmuyor."}
            header={
              !selecting ? (
                <View style={[styles.note, { backgroundColor: colors.amberSoft }]}>
                  <InboxIcon size={16} color={colors.amber} />
                  <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
                    {importOn ? "Faturayı gidere işlemek (İçeri Al), kabul/red ya da görüntülemek için satıra dokunun." : "Faturayı gidere işleme (İçeri Al) web panelinden yapılır."}
                  </Text>
                </View>
              ) : undefined
            }
            renderItem={(inv) => {
              const key = String(inv.import_status || "none");
              const imp = IMPORT_STATUS[key] || IMPORT_STATUS.none;
              const accent = inv.statusKind === "error" ? colors.error : key === "applied" || inv.importedElsewhere ? colors.success : inv.can_respond ? colors.warning : key === "in_progress" ? colors.info : undefined;
              // İçeri Al 2: onay bekleyen ticari fatura önce kabul edilir (import_block); not satırda söylenir.
              const gate = acceptGate(inv.importBlock?.code);
              const note = (inv.inbox_row ? responseNote(inv.response_request || null) : null) || (gate ? gate.title : null);
              const on = selected.includes(inv.id);
              return (
                <RowCard
                  testID={`incoming-${inv.id}`}
                  accent={accent}
                  leading={
                    selecting ? (
                      <View style={[styles.check, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
                        {on ? <CheckIcon size={14} color="#FFFFFF" /> : null}
                      </View>
                    ) : (
                      <IconTile tint={colors.amberSoft}>
                        <InboxIcon size={18} color={colors.amber} />
                      </IconTile>
                    )
                  }
                  title={inv.sender_name || "Gönderen"}
                  subtitle={[inv.invoice_no, formatDate(inv.issue_date), inv.type_label].filter(Boolean).join(" · ")}
                  meta={pdfBusyId === inv.id ? "Fatura açılıyor…" : note || (inv.sender_tax_no ? `VKN ${inv.sender_tax_no}` : undefined)}
                  amount={formatMoney(inv.gross_total, inv.currency)}
                  badge={
                    <View style={styles.badges}>
                      {inv.statusText ? <StatusBadge label={inv.statusText} kind={inv.statusKind || "neutral"} size="sm" /> : null}
                      <StatusBadge label={inv.importLabel || imp.label} kind={inv.importedElsewhere || key === "applied" ? "success" : imp.kind} size="sm" />
                    </View>
                  }
                  onPress={selecting ? () => toggle(inv.id) : importOn || inv.can_respond || (hasPdf && Platform.OS !== "web") ? () => openRow(inv) : undefined}
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
  badges: { alignItems: "flex-end", gap: 4 },
  bulk: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, gap: spacing.xs },
  bulkRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
