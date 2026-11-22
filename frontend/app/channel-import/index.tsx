// Faz C5: Ürünleri kanaldan çek. Kanal seç → çek (POST scan → 202 {job_id, run_id}; iş GET /integration-jobs/{id} ile izlenir;
// mağazada başka eşitleme sürüyorsa 409 + X-Job-Id) → önizleme (sayılar, uyarılar, satırlar süzgeçli) → onayla (POST apply → 202) → sonuç.
// Önizlemede hiçbir şey yazılmaz. Stok sahibi muhasebe programıysa stok yazılmaz. Kurallar: src/channel-import.ts.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getIntegrations, request } from "../../src/api";
import {
  applyPath,
  channelLabel,
  defaultFilter,
  doneView,
  FILTERS,
  importableIntegrations,
  jobOutcome,
  latestPath,
  progressText,
  reviewView,
  rowCodes,
  rowDecisionText,
  rowsPath,
  runPath,
  scanPath,
  stepForRun,
} from "../../src/channel-import";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { PackageIcon } from "../../src/components/Icons";
import { Note } from "../../src/components/sms/SmsParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

type Integ = { id: string; provider: string; name: string };
type Step = "pick" | "loading" | "start" | "working" | "review" | "done";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ChannelImportScreen() {
  const p = useLocalSearchParams<{ integrationId?: string }>();
  const { token } = useAuth();
  const { colors } = useTheme();
  const { confirm, toast } = useFeedback();
  const [list, setList] = useState<Integ[] | null>(null);
  const [integ, setInteg] = useState<Integ | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [run, setRun] = useState<any>(null);
  const [error, setError] = useState("");
  const [job, setJob] = useState<any>(null);
  const [working, setWorking] = useState<"scan" | "apply">("scan");
  const [filter, setFilter] = useState("new");
  const [rows, setRows] = useState<{ items: any[]; total: number; page: number; loading: boolean }>({ items: [], total: 0, page: 1, loading: false });
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  useEffect(() => {
    if (!token) return;
    getIntegrations(token)
      .then((all) => {
        const l = importableIntegrations(all as any[]);
        setList(l);
        const fixed = l.find((i) => i.id === p.integrationId) || (l.length === 1 ? l[0] : null);
        if (fixed) {
          setInteg(fixed);
          setStep("loading");
        }
      })
      .catch(() => setList([]));
  }, [token, p.integrationId]);

  const showRun = useCallback((r: any) => {
    setRun(r);
    const s = stepForRun(r);
    if (s === "review") setFilter(defaultFilter(r?.counts));
    if (r?.state === "failed" && r?.error_tr) setError(String(r.error_tr));
    setStep(s);
  }, []);

  useEffect(() => {
    if (!token || !integ || step !== "loading") return;
    request<any>(latestPath(integ.id), { method: "GET" }, token)
      .then((res) => {
        const r = res?.run;
        alive.current && showRun(r && (r.state === "ready" || r.state === "partial") ? r : null);
      })
      .catch(() => alive.current && setStep("start"));
  }, [token, integ, step, showRun]);

  const loadRows = useCallback(
    async (runId: string, decision: string, page = 1) => {
      if (!token) return;
      setRows((x) => ({ ...x, loading: true }));
      try {
        const res = await request<any>(rowsPath(runId, decision, page), { method: "GET" }, token);
        if (alive.current) setRows({ items: Array.isArray(res?.items) ? res.items : [], total: Number(res?.total || 0), page, loading: false });
      } catch {
        if (alive.current) setRows({ items: [], total: 0, page, loading: false });
      }
    },
    [token]
  );
  useEffect(() => {
    if (step === "review" && run?.id) loadRows(run.id, filter, 1);
  }, [step, run?.id, filter, loadRows]);

  // İşi başlatır ve bitene dek izler. 409 + X-Job-Id: o mağazada süren işi izler, sonra yeniden denemeyi önerir.
  const runJob = async (path: string): Promise<{ ok: boolean; runId: string | null; message: string; busy?: boolean }> => {
    let res: any;
    let busyJob = "";
    try {
      res = await request<any>(path, { method: "POST", body: "{}" }, token!);
    } catch (e: any) {
      if (Number(e?.status) === 409 && e?.jobId) busyJob = String(e.jobId);
      else throw e;
    }
    const jobId = busyJob || res?.job_id;
    const runId = res?.run_id || null;
    if (!jobId) return { ok: true, runId, message: res?.message || "" };
    const started = Date.now();
    for (;;) {
      try {
        const j = await request<any>(`/integration-jobs/${encodeURIComponent(jobId)}`, { method: "GET" }, token!);
        if (alive.current) setJob(j);
        const o = jobOutcome(j);
        if (o.phase === "done") return busyJob ? { ok: false, busy: true, runId: null, message: "Bu mağazada başka bir eşitleme sürüyordu; bittiğinde yeniden deneyin." } : { ok: true, runId, message: "" };
        if (o.phase === "failed") return { ok: false, runId, message: o.message };
      } catch (e: any) {
        if (Number(e?.status) === 404) return { ok: false, runId, message: "İşlem bulunamadı ya da süresi doldu." };
      }
      if (Date.now() - started > 10 * 60 * 1000) return { ok: false, runId, message: "İşlem arka planda sürüyor; biraz sonra bu ekranı yeniden açın." };
      await wait(2000);
      if (!alive.current) return { ok: false, runId, message: "" };
    }
  };

  const scan = async () => {
    if (!token || !integ) return;
    setError("");
    setJob(null);
    setWorking("scan");
    setStep("working");
    try {
      const out = await runJob(scanPath(integ.id));
      if (!out.ok) {
        setError(out.message);
        setStep("start");
        return;
      }
      const r = out.runId ? await request<any>(runPath(out.runId), { method: "GET" }, token) : (await request<any>(latestPath(integ.id), { method: "GET" }, token))?.run;
      showRun(r || null);
    } catch (e: any) {
      setError(e?.message || "Ürünler çekilemedi.");
      setStep("start");
    }
  };
  const apply = async () => {
    if (!token || !run?.id) return;
    const ok = await confirm({ title: "Ürünler aktarılsın mı?", message: "Yeni ürün kartları açılır ve eşleşen ürünler kanala bağlanır. Onay bekleyenler kuyruğa düşer.", confirmLabel: "Onayla ve aktar" });
    if (!ok) return;
    setError("");
    setJob(null);
    setWorking("apply");
    setStep("working");
    try {
      const out = await runJob(applyPath(run.id));
      const r = await request<any>(runPath(run.id), { method: "GET" }, token);
      setRun(r);
      if (!out.ok && out.message) setError(out.message);
      setStep(r?.state === "ready" ? "review" : "done");
      if (out.ok) toast("Aktarım tamamlandı.", "success");
    } catch (e: any) {
      setError(e?.message || "Aktarım tamamlanamadı.");
      setStep("review");
    }
  };

  const label = channelLabel(integ?.provider);
  const header = <StackHeader title={integ ? `${label} ürünlerini çek` : "Ürünleri kanaldan çek"} subtitle={integ && integ.name !== label ? integ.name : undefined} />;

  let body: React.ReactNode = null;
  if (step === "pick") {
    body =
      list === null ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : !list.length ? (
        <EmptyState icon={<PackageIcon size={30} color={colors.textTertiary} />} title="Ürün çekilecek mağaza yok" description="Trendyol, Hepsiburada, n11, Amazon, idefix, Pazarama ya da WooCommerce mağazası bağladığınızda ürünlerini buradan çekebilirsiniz." />
      ) : (
        <>
          <SectionTitle title="Mağaza seçin" />
          <Card style={styles.block}>
            {list.map((i, k) => (
              <ListRow key={i.id} testID={`ci-pick-${i.id}`} divider={k > 0} title={i.name} subtitle={channelLabel(i.provider)} chevron onPress={() => (setInteg(i), setStep("loading"))} />
            ))}
          </Card>
        </>
      );
  } else if (step === "loading") {
    body = <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />;
  } else if (step === "start") {
    body = (
      <View style={[styles.block, { gap: spacing.sm, marginTop: spacing.md }]}>
        <Text style={[type.body, { color: colors.textSecondary }]}>{`${label} mağazanızdaki ürünler okunur ve önizlenir. Onaylayana kadar hiçbir şey yazılmaz.`}</Text>
        {error ? <Note tone="error">{error}</Note> : null}
        <Button testID="ci-scan" label="Ürünleri çek" onPress={scan} />
        <Button testID="ci-queue" variant="secondary" label="Onay bekleyenler" onPress={() => router.push({ pathname: "/channel-import/queue", params: { integrationId: integ?.id || "" } } as any)} />
      </View>
    );
  } else if (step === "working") {
    body = (
      <View style={[styles.block, styles.center]} testID="ci-working">
        <ActivityIndicator color={colors.primary} />
        <Text style={[type.headline, { color: colors.textPrimary, textAlign: "center" }]}>{working === "scan" ? `${label} ürünleri çekiliyor…` : "Ürünler aktarılıyor…"}</Text>
        <Text style={[type.footnote, tabular, { color: colors.textSecondary, textAlign: "center" }]}>{progressText(job, working === "scan" ? "Ürünler alınıyor" : "Ürünler aktarılıyor")}</Text>
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>İşlem sunucuda sürer; ekranı kapatsanız da yarıda kalmaz.</Text>
      </View>
    );
  } else if (step === "review") {
    const v = reviewView(run);
    body = (
      <>
        <View style={[styles.block, styles.stats]} testID="ci-review-stats">
          {v.stats.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[type.caption, { color: colors.textTertiary }]}>{s.label}</Text>
              <Text style={[type.headline, tabular, { color: s.value && s.tone === "warning" ? colors.amber : colors.textPrimary }]}>{s.value.toLocaleString("tr-TR")}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.block, { gap: spacing.xs, marginTop: spacing.sm }]}>
          <Text style={[type.caption, { color: colors.textTertiary }]}>{`${label} · ${v.total.toLocaleString("tr-TR")} ürün bulundu. Henüz hiçbir şey yazılmadı.`}</Text>
          <Note tone={run?.stock_mode === "none" ? "warning" : "info"}>{v.stockNote}</Note>
          {v.warnings.map((w) => (
            <Note key={w} tone="warning">{w}</Note>
          ))}
          {error ? <Note tone="error">{error}</Note> : null}
          <OptionChips testIDPrefix="ci-filter" options={FILTERS.map(([value, l]) => ({ value, label: `${l} ${Number(run?.counts?.[value] || 0)}` }))} value={filter} onChange={setFilter} />
        </View>
        <Card style={[styles.block, { marginTop: spacing.sm }]}>
          {rows.loading && !rows.items.length ? (
            <ActivityIndicator style={{ margin: spacing.md }} color={colors.primary} />
          ) : rows.items.length ? (
            rows.items.map((r, i) => (
              <View key={r.id || i} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>{`${r.name}${r.variant ? ` · ${r.variant}` : ""}`}</Text>
                <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{rowCodes(r)}</Text>
                <Text style={[type.caption, { color: r.decision === "ambiguous" ? colors.amber : r.decision === "skip" ? colors.textTertiary : colors.success }]}>{rowDecisionText(r)}</Text>
              </View>
            ))
          ) : (
            <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Bu grupta ürün yok.</Text>
          )}
        </Card>
        {rows.total > 50 ? (
          <View style={[styles.block, styles.pager]}>
            <Button size="sm" variant="ghost" label="Önceki" disabled={rows.page <= 1 || rows.loading} onPress={() => loadRows(run.id, filter, rows.page - 1)} />
            <Text style={[type.caption, tabular, { color: colors.textSecondary }]}>{`${rows.page} / ${Math.ceil(rows.total / 50)}`}</Text>
            <Button size="sm" variant="ghost" label="Sonraki" disabled={rows.page * 50 >= rows.total || rows.loading} onPress={() => loadRows(run.id, filter, rows.page + 1)} />
          </View>
        ) : null}
        <View style={[styles.block, { gap: spacing.sm, marginTop: spacing.md }]}>
          {v.writable ? <Button testID="ci-apply" label="Onayla ve aktar" onPress={apply} /> : null}
          <Button testID="ci-rescan" variant="secondary" label="Yeniden çek" onPress={scan} />
        </View>
      </>
    );
  } else {
    const d = doneView(run);
    body = (
      <View style={[styles.block, { gap: spacing.sm, marginTop: spacing.md }]} testID="ci-done">
        <Text style={[type.headline, { color: colors.textPrimary }]}>{d.title}</Text>
        {d.message ? <Text style={[type.footnote, { color: colors.textSecondary }]}>{d.message}</Text> : null}
        <View style={styles.stats}>
          {d.stats.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[type.caption, { color: colors.textTertiary }]}>{s.label}</Text>
              <Text style={[type.headline, tabular, { color: s.value && s.tone === "error" ? colors.error : s.value && s.tone === "warning" ? colors.amber : colors.textPrimary }]}>{s.value.toLocaleString("tr-TR")}</Text>
            </View>
          ))}
        </View>
        {error ? <Note tone="error">{error}</Note> : null}
        {d.retry ? <Button testID="ci-retry" variant="secondary" label="Kalanları yeniden dene" onPress={apply} /> : null}
        {d.queued ? <Button testID="ci-open-queue" variant="secondary" label="Onay bekleyenleri gör" onPress={() => router.push({ pathname: "/channel-import/queue", params: { integrationId: integ?.id || "" } } as any)} /> : null}
        <Button label="Tamam" onPress={() => (router.canGoBack() ? router.back() : router.replace("/products" as any))} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="channel-import">
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}>{body}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  center: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  stat: { flexBasis: "48%", flexGrow: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
});
