// Satışlar / Giderler raporu (P6.1): GET /reports/sales|expenses?from&to&group&rows=false (özet), belge dökümü rows=true
// (20.000 üstü 409 REPORT_TOO_LARGE). Para birimi başına blok; dövizde TL karşılığı yalnız bilgi. Döküm CSV olarak paylaşılır.
// Kurallar: src/finance-reports.ts (web pages/reports/PeriodReportPage.jsx).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import {
  csvName,
  docLine,
  fixGroup,
  GROUPS,
  groupAllowed,
  hasAnyDocument,
  isNeg,
  money,
  PARASUT_NOTE,
  periodCsv,
  periodErrorText,
  periodFigs,
  periodLabel,
  periodNotes,
  periodPath,
  pickCurrency,
  presetRange,
  REPORT,
  TAGS_NOTE,
  type Kind,
} from "../../src/finance-reports";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, ChartIcon } from "../../src/components/Icons";
import { CurrencyChips, FigureHero, InfoNote, RangeBar } from "../../src/components/reports/ReportParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";

const LIST_LIMIT = 15;

export default function PeriodReportScreen() {
  const p = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = p.kind === "expenses" ? "expenses" : "sales";
  const cfg = REPORT[kind];
  const { token, parasutConnected } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [range, setRange] = useState(() => presetRange("month"));
  const [group, setGroup] = useState(() => fixGroup("", range.from, range.to));
  const [currency, setCurrency] = useState("");
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: any; message: string }>({ status: "loading", data: null, message: "" });
  const [dim, setDim] = useState(cfg.dims[0][0]);
  const [all, setAll] = useState(false);
  const [docs, setDocs] = useState<{ status: "idle" | "loading" | "ready" | "error"; rows: any[]; message: string }>({ status: "idle", rows: [], message: "" });
  const [sharing, setSharing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, status: s.data ? s.status : "loading" }));
    setDocs({ status: "idle", rows: [], message: "" });
    try {
      const data = await request<any>(periodPath(kind, range.from, range.to, group, false), { method: "GET" }, token);
      if (my === seq.current) setState({ status: "ready", data, message: "" });
    } catch (e: any) {
      if (my === seq.current) setState({ status: "error", data: null, message: periodErrorText(e, kind) });
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [token, kind, range, group]);
  useEffect(() => {
    load();
  }, [load]);

  const data = state.data;
  const cur = pickCurrency<any>(data?.currencies, currency);
  const code = cur?.currency || "TRY";

  const loadDocs = async () => {
    if (!token) return [];
    setDocs({ status: "loading", rows: [], message: "" });
    try {
      const full = await request<any>(periodPath(kind, range.from, range.to, group, true), { method: "GET" }, token);
      const rows = Array.isArray(full?.rows) ? full.rows : [];
      setDocs({ status: "ready", rows, message: "" });
      return rows;
    } catch (e: any) {
      const message = periodErrorText(e, kind);
      setDocs({ status: "error", rows: [], message });
      throw new Error(message);
    }
  };
  const shareCsv = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const rows = docs.status === "ready" ? docs.rows : await loadDocs();
      const csv = periodCsv(kind, rows, code);
      if (Platform.OS === "web") {
        toast("CSV paylaşımı telefonda çalışır.", "info");
      } else {
        const path = `${FileSystem.cacheDirectory}${csvName(kind, code, range.from, range.to)}`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: `${cfg.title} raporu`, UTI: "public.comma-separated-values-text" });
      }
    } catch (e: any) {
      toast(e?.message || "Dosya hazırlanamadı. Yeniden deneyin.", "error");
    } finally {
      setSharing(false);
    }
  };

  const changeRange = (r: { from: string; to: string }) => {
    setRange(r);
    setGroup((g) => fixGroup(g, r.from, r.to));
  };
  const list: any[] = Array.isArray(cur?.[dim]) ? cur[dim] : [];
  const shownDocs = docs.rows.filter((r) => r.currency === code);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID={`report-${kind}`}>
      <StackHeader title={`${cfg.title} raporu`} subtitle={kind === "sales" ? "Fatura, POS ve Paraşüt satışları" : "Gider faturaları ve kayıtları"} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
      >
        <View style={[styles.block, { gap: spacing.sm }]}>
          <RangeBar from={range.from} to={range.to} onChange={changeRange} />
          <OptionChips
            testIDPrefix="report-group"
            options={GROUPS.filter(([k]) => groupAllowed(k, range.from, range.to)).map(([value, label]) => ({ value, label }))}
            value={group}
            onChange={setGroup}
          />
          {!groupAllowed("day", range.from, range.to) ? <Text style={[type.caption, { color: colors.textTertiary }]}>Gün kırılımı en çok 93 günlük dönemde seçilebilir.</Text> : null}
        </View>

        {state.status === "loading" ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : null}
        {state.status === "error" ? (
          <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title={`${cfg.title} raporu yüklenemedi`} description={state.message} actionLabel="Tekrar dene" onAction={load} />
        ) : null}
        {state.status === "ready" && (!cur || !hasAnyDocument(data?.currencies)) ? (
          <EmptyState icon={<ChartIcon size={30} color={colors.textTertiary} />} title={kind === "sales" ? "Bu dönemde satış yok" : "Bu dönemde gider yok"} description={cfg.empty} />
        ) : null}

        {state.status === "ready" && cur && hasAnyDocument(data?.currencies) ? (
          <>
            {data.currencies.length > 1 ? (
              <View style={styles.block}>
                <CurrencyChips list={data.currencies} value={code} onChange={setCurrency} />
              </View>
            ) : null}
            <View style={styles.block}>
              {(() => {
                const figs = periodFigs(cur);
                const total = figs[figs.length - 1];
                return (
                  <FigureHero
                    testID="report-figs"
                    title="Toplam (KDV dahil)"
                    value={money(total.value, code)}
                    hint={total.hint}
                    cells={figs.slice(0, -1).map((f) => ({ label: f.label, value: money(f.value, code) }))}
                  />
                );
              })()}
            </View>
            {periodNotes(cur, kind).map((n) => (
              <View key={n} style={styles.block}>
                <InfoNote tone={n.includes("bilinmiyor") ? "warning" : "info"}>{n}</InfoNote>
              </View>
            ))}
            {parasutConnected ? (
              <View style={styles.block}>
                <InfoNote>{PARASUT_NOTE}</InfoNote>
              </View>
            ) : null}

            <SectionTitle title={`${GROUPS.find(([k]) => k === group)?.[1] || ""} kırılımı`} />
            <Card style={styles.block}>
              {(cur.periods || []).map((pp: any, i: number) => (
                <View key={pp.key} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: colors.textPrimary }]}>{periodLabel(pp, group)}</Text>
                    <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${pp.count} belge · Net ${money(pp.net, code)} · KDV ${money(pp.vat, code)}`}</Text>
                  </View>
                  <Text style={[type.bodyStrong, tabular, { color: isNeg(pp.gross) ? colors.error : colors.textPrimary }]}>{money(pp.gross, code)}</Text>
                </View>
              ))}
            </Card>

            <SectionTitle title="Kırılım" />
            <View style={[styles.block, { gap: spacing.xs }]}>
              <OptionChips testIDPrefix="report-dim" options={cfg.dims.map(([value, label]) => ({ value, label }))} value={dim} onChange={(v) => (setDim(v), setAll(false))} />
              {dim === "tags" ? <Text style={[type.caption, { color: colors.textTertiary }]}>{TAGS_NOTE}</Text> : null}
            </View>
            <Card style={styles.block}>
              {list.length ? (
                (all ? list : list.slice(0, LIST_LIMIT)).map((r, i) => (
                  <View key={`${i}:${r.name}`} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                      <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${r.count} belge · Net ${money(r.net, code)}`}</Text>
                    </View>
                    <Text style={[type.bodyStrong, tabular, { color: isNeg(r.gross) ? colors.error : colors.textPrimary }]}>{money(r.gross, code)}</Text>
                  </View>
                ))
              ) : (
                <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Bu dönemde kayıt yok.</Text>
              )}
            </Card>
            {list.length > LIST_LIMIT ? (
              <View style={styles.block}>
                <Button variant="ghost" size="sm" label={all ? "Daha az göster" : `Tümünü göster (${list.length})`} onPress={() => setAll((v) => !v)} style={{ alignSelf: "flex-start" }} />
              </View>
            ) : null}

            <SectionTitle title="Belge dökümü" />
            <View style={[styles.block, { gap: spacing.sm }]}>
              {docs.status === "idle" ? <Text style={[type.caption, { color: colors.textTertiary }]}>Döküm, rapor ağırlaşmasın diye istenince açılır.</Text> : null}
              {docs.status === "error" ? <InfoNote tone="warning">{docs.message}</InfoNote> : null}
              <View style={styles.actions}>
                {docs.status !== "ready" ? (
                  <Button testID="report-docs" size="sm" variant="secondary" label={docs.status === "loading" ? "Yükleniyor…" : "Belge dökümünü göster"} disabled={docs.status === "loading"} onPress={() => loadDocs().catch(() => undefined)} />
                ) : null}
                <Button testID="report-csv" size="sm" variant="secondary" label={sharing ? "Hazırlanıyor…" : "CSV paylaş"} disabled={sharing} onPress={shareCsv} />
              </View>
            </View>
            {docs.status === "ready" ? (
              <Card style={styles.block}>
                {shownDocs.length ? (
                  shownDocs.slice(0, 200).map((r, i) => {
                    const v = docLine(r, kind);
                    return (
                      <View key={`${i}:${v.title}`} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>{v.title}</Text>
                          <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={2}>{v.sub}</Text>
                        </View>
                        <Text style={[type.callout, tabular, { color: isNeg(v.gross) ? colors.error : colors.textPrimary }]}>{money(v.gross, code)}</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Bu para biriminde belge yok.</Text>
                )}
              </Card>
            ) : null}
            {docs.status === "ready" && shownDocs.length > 200 ? (
              <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>{`İlk 200 belge gösteriliyor (toplam ${shownDocs.length}). Tümü CSV dosyasında.`}</Text>
            ) : null}
            <Text style={[type.caption, styles.block, { color: colors.textTertiary, marginTop: spacing.sm }]}>{cfg.footnote}</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
