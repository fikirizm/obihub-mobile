// Dalga 2 (C-15): cari kartı "Notlar ve mesajlar" — GET /customers/{id}/timeline?kind=all|notes|messages, POST/DELETE notes.
// Notlar ekip içi (müşteriye gitmez); mesajlar gönderilen hatırlatma, ekstre ve fatura paylaşımları; mahsuplar etkinlik olarak.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { newIdempotencyKey, request } from "../api";
import { followupErrorText, noteProblem, TIMELINE_KINDS, timelineRows } from "../followup";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Chip, ChipRow } from "../ui/Chip";
import { useFeedback } from "../ui/Feedback";
import { FormField } from "../ui/FormField";
import { Card, SectionTitle } from "../ui/ListRow";

const when = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function PartyTimeline({ token, customerId, mayWrite }: { token: string; customerId: string; mayWrite: boolean }) {
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [kind, setKind] = useState("all");
  const [rows, setRows] = useState<ReturnType<typeof timelineRows> | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey("note"));
  const base = `/customers/${encodeURIComponent(customerId)}`;

  const load = useCallback(async () => {
    try {
      setRows(timelineRows(await request<any>(`${base}/timeline?kind=${kind}`, { method: "GET" }, token)));
    } catch {
      setRows(null);
    }
  }, [token, base, kind]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const p = noteProblem(text);
    if (p) return setError(p);
    setBusy(true);
    setError("");
    try {
      await request<any>(`${base}/notes`, { method: "POST", body: JSON.stringify({ text: text.trim(), idempotency_key: key.current }), headers: { "Idempotency-Key": key.current } }, token);
      key.current = newIdempotencyKey("note");
      setText("");
      load();
    } catch (e: any) {
      setError(followupErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    const ok = await confirm({ title: "Not silinsin mi?", message: "Not zaman çizelgesinden kalkar.", confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    try {
      await request<any>(`${base}/notes/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
      load();
    } catch (e: any) {
      toast(followupErrorText(e), "error");
    }
  };

  if (rows === null) return null;
  return (
    <View testID="party-timeline">
      <SectionTitle title="Notlar ve mesajlar" />
      <ChipRow>
        {TIMELINE_KINDS.map(([k, l]) => (
          <Chip key={k} testID={`timeline-kind-${k}`} label={l} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </ChipRow>
      {mayWrite && kind !== "messages" ? (
        <View style={[styles.block, { gap: spacing.xs, marginTop: spacing.sm }]}>
          <FormField testID="timeline-note-input" label="Not ekle" value={text} onChangeText={(t) => (setText(t), error && setError(""))} multiline maxLength={2000} placeholder="Örn. Arandı, cuma ödeyecek" hint="Ekip içi not; müşteriye gönderilmez." error={error || undefined} />
          <Button testID="timeline-note-add" size="sm" label="Notu kaydet" busy={busy} disabled={!text.trim()} onPress={add} />
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Henüz kayıt yok.</Text>
      ) : (
        <Card style={[styles.block, { marginTop: spacing.sm }]}>
          {rows.map((r, i) => (
            <View key={r.id || i} style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`timeline-row-${i}`}>
              <View style={styles.head}>
                <View style={[styles.tag, { backgroundColor: r.tag === "Not" ? colors.warningBg : r.tag === "Mesaj" ? colors.infoBg : colors.surfaceMuted }]}>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{r.tag}</Text>
                </View>
                <Text style={[type.caption, { color: colors.textTertiary, flex: 1 }]} numberOfLines={1}>
                  {[when(r.at), r.actor].filter(Boolean).join(" · ")}
                </Text>
                {mayWrite && r.canDelete ? (
                  <Pressable testID={`timeline-note-delete-${i}`} onPress={() => remove(r.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notu sil">
                    <Text style={[type.caption, { color: colors.error }]}>Sil</Text>
                  </Pressable>
                ) : null}
              </View>
              {r.tag !== "Not" ? <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{r.title}</Text> : null}
              {r.body ? <Text style={[type.callout, { color: colors.textSecondary }]}>{r.body}</Text> : null}
              {r.invoiceId ? (
                <Pressable onPress={() => router.push({ pathname: "/local-invoices/[id]", params: { id: r.invoiceId as string } })} hitSlop={6} accessibilityRole="link">
                  <Text style={[type.caption, { color: colors.primary, fontWeight: "600" }]}>Faturayı aç</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  item: { padding: spacing.md, gap: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tag: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.pill },
});
