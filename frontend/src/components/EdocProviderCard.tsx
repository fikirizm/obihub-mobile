// E-belge sağlayıcısı kartı (EDM e-Fatura / Trendyol E-Faturam): durum rozeti, Test ortamı rozeti, resmî numara, ETTN, önceki ETTN'ler,
// notlar; "Durumu yenile" ve (yalnız EDM, başarısız gönderimde) "Yeniden gönder". Kurallar: src/edoc-provider.ts.
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { EdocProviderView, Tone } from "../edoc-provider";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { Card, SectionTitle } from "../ui/ListRow";
import { PressableScale } from "./KPICard";

function Pill({ label, tone, testID }: { label: string; tone: Tone | "test"; testID?: string }) {
  const { colors } = useTheme();
  const map = {
    ok: [colors.successBg, colors.success],
    warn: [colors.warningBg, colors.amber],
    crit: [colors.errorBg, colors.error],
    neutral: [colors.surfaceMuted, colors.textSecondary],
    test: [colors.warningBg, colors.amber],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[type.caption, { color: fg, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

export function EdocProviderCard({ view, busy, onRefresh, onResend }: { view: EdocProviderView; busy: string | null; onRefresh: () => void; onResend?: () => void }) {
  const { colors } = useTheme();
  const [showPrev, setShowPrev] = useState(false);
  return (
    <View testID="edoc-provider-card">
      <SectionTitle title="e-Belge" action={<Text style={[type.caption, { color: colors.textTertiary }]}>{view.provider}</Text>} />
      <Card style={styles.block}>
        <View style={styles.body}>
          <View style={styles.pills}>
            {view.status ? <Pill label={view.status.label} tone={view.status.tone} testID="edoc-provider-status" /> : null}
            {view.testMode ? <Pill label="Test ortamı" tone="test" testID="edoc-test-mode" /> : null}
          </View>
          {view.facts.map(([k, v]) => (
            <View key={k} style={styles.fact}>
              <Text style={[type.footnote, { color: colors.textSecondary }]}>{k}</Text>
              <Text style={[type.footnote, k === "ETTN" ? tabular : null, { color: colors.textPrimary, flexShrink: 1, textAlign: "right" }]} selectable numberOfLines={2}>
                {v}
              </Text>
            </View>
          ))}
          {view.previousEttns.length ? (
            <View testID="edoc-previous-ettns">
              <PressableScale onPress={() => setShowPrev((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: showPrev }} style={styles.fact}>
                <Text style={[type.footnote, { color: colors.textSecondary }]}>Önceki ETTN'ler</Text>
                <Text style={[type.footnote, { color: colors.primary, fontWeight: "600" }]}>{`${view.previousEttns.length} · ${showPrev ? "Gizle" : "Göster"}`}</Text>
              </PressableScale>
              {showPrev
                ? view.previousEttns.map((e) => (
                    <Text key={e} style={[type.caption, tabular, { color: colors.textTertiary, textAlign: "right" }]} selectable>
                      {e}
                    </Text>
                  ))
                : null}
              {showPrev ? (
                <Text style={[type.caption, { color: colors.textTertiary }]}>Yeniden gönderimde ETTN yenilenir; resmî fatura numarası aynı kalır.</Text>
              ) : null}
            </View>
          ) : null}
          {view.notes.map((n) => (
            <View key={n.key} testID={`edoc-note-${n.key}`} style={[styles.note, { backgroundColor: n.tone === "warn" ? colors.warningBg : colors.infoBg }]}>
              <Text style={[type.footnote, { color: colors.textPrimary }]}>{n.text}</Text>
            </View>
          ))}
          <View style={styles.actions}>
            <Button testID="edoc-provider-refresh" size="sm" variant="secondary" label="Durumu yenile" busy={busy === "edoc"} disabled={Boolean(busy)} onPress={onRefresh} style={{ flex: 1 }} />
            {view.canResend && onResend ? (
              <Button testID="edoc-provider-resend" size="sm" label="Yeniden gönder" busy={busy === "resend"} disabled={Boolean(busy)} onPress={onResend} style={{ flex: 1 }} />
            ) : null}
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  body: { padding: spacing.md, gap: spacing.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, minHeight: 28 },
  note: { padding: spacing.sm, borderRadius: radius.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
});
