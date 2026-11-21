// Geçmiş: otomatik sipariş SMS'leri (GET /netgsm/messages; telefon maskeli, teslim raporu) ve toplu gönderimler (GET /netgsm/campaigns).
// 403: Satış ya da Ayarlar yetkisi yoksa bölüm yerine açıklama gösterilir.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { request } from "../../api";
import { EVENT_LABEL, firstLine, fmtDate, IYS_OPTIONS, stateInfo } from "../../sms";
import { useTheme } from "../../theme/ThemeProvider";
import { spacing, tabular, type } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Card, SectionTitle } from "../../ui/ListRow";
import { StatusBadge } from "../StatusBadge";
import { Note } from "./SmsParts";

type Load = { status: "loading" } | { status: "error"; msg: string } | { status: "ready"; items: any[] };
const IYS = Object.fromEntries(IYS_OPTIONS);

function useList(token: string | null, path: string) {
  const [state, setState] = useState<Load>({ status: "loading" });
  const load = useCallback(() => {
    if (!token) return;
    setState({ status: "loading" });
    request<any>(path, { method: "GET" }, token)
      .then((d) => setState({ status: "ready", items: Array.isArray(d?.items) ? d.items : [] }))
      .catch((e: any) =>
        setState({ status: "error", msg: Number(e?.status) === 403 ? "Bu listeyi görme yetkiniz yok (Satış ya da Ayarlar yetkisi gerekir)." : e?.message || "Liste yüklenemedi." })
      );
  }, [token, path]);
  useEffect(() => {
    load();
  }, [load]);
  return { state, load };
}

function Row({ title, sub, meta, row, divider }: { title: string; sub: string; meta?: string; row: any; divider?: boolean }) {
  const { colors } = useTheme();
  const s = stateInfo(row);
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={styles.top}>
        <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>{title}</Text>
        <StatusBadge label={s.label} kind={s.tone} size="sm" />
      </View>
      <Text style={[type.caption, tabular, { color: colors.textTertiary }]} numberOfLines={1}>{sub}</Text>
      {meta ? <Text style={[type.caption, { color: colors.textSecondary }]}>{meta}</Text> : null}
      {s.detail ? <Text style={[type.caption, { color: s.tone === "error" ? colors.error : colors.textSecondary }]}>{s.detail}</Text> : null}
    </View>
  );
}

function ListCard({ title, state, onReload, empty, render }: { title: string; state: Load; onReload: () => void; empty: string; render: (r: any, i: number) => React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <>
      <SectionTitle title={title} action={<Button variant="ghost" size="sm" label="Yenile" onPress={onReload} />} />
      <View style={styles.block}>
        {state.status === "loading" ? <ActivityIndicator color={colors.primary} /> : null}
        {state.status === "error" ? <Note tone="error">{state.msg}</Note> : null}
        {state.status === "ready" ? (
          <Card style={{ marginHorizontal: 0 }}>
            {state.items.length ? state.items.slice(0, 100).map(render) : <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>{empty}</Text>}
          </Card>
        ) : null}
      </View>
    </>
  );
}

export function HistorySection({ token }: { token: string | null }) {
  const messages = useList(token, "/netgsm/messages");
  const campaigns = useList(token, "/netgsm/campaigns");
  return (
    <View testID="sms-history">
      <ListCard
        title="Sipariş SMS'leri"
        state={messages.state}
        onReload={messages.load}
        empty="Henüz sipariş SMS'i gönderilmedi. Otomatik SMS'i açtığınızda müşterilere giden mesajlar burada listelenir."
        render={(r, i) => (
          <Row
            key={String(r.id)}
            divider={i > 0}
            row={r}
            title={`${r.order_no ? `#${r.order_no} · ` : ""}${EVENT_LABEL[r.event] || r.event || "SMS"}`}
            sub={[fmtDate(r.created_at), r.customer_name, r.phone].filter(Boolean).join(" · ")}
          />
        )}
      />
      <ListCard
        title="Toplu gönderimler"
        state={campaigns.state}
        onReload={campaigns.load}
        empty="Henüz toplu gönderim yok."
        render={(r, i) => (
          <Row
            key={String(r.id)}
            divider={i > 0}
            row={r}
            title={firstLine(r.text) || "—"}
            sub={[fmtDate(r.created_at), `${r.total ?? 0} alıcı`, `kabul ${r.accepted ?? 0} / ret ${r.rejected ?? 0}`].join(" · ")}
            meta={[r.commercial ? `Ticari${IYS[r.iys_filter] ? ` · ${IYS[r.iys_filter]}` : ""}` : "Bilgilendirme", r.sender].filter(Boolean).join(" · ")}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
