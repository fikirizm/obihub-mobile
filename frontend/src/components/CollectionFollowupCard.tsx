// Dalga 2 (P2.3): fatura "Tahsilat takibi" — GET /local-invoices/{id}/collection-followup. Kalan, vade/gecikme, mahsup bildirimi,
// gönderilen hatırlatmalar; satırdan vade değiştirme (PUT {due_date}, bilgi ekranı) ve onaylı tahsilat hatırlatma e-postası.
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { request } from "../api";
import { followupView } from "../followup";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { formatDate, formatMoney } from "../utils";
import { Button } from "../ui/Button";
import { Card, SectionTitle } from "../ui/ListRow";

export function CollectionFollowupCard({ token, invoiceId, title, mayWrite, reloadKey }: { token: string; invoiceId: string; title: string; mayWrite: boolean; reloadKey?: unknown }) {
  const { colors } = useTheme();
  const [raw, setRaw] = useState<any>(null);
  useEffect(() => {
    let live = true;
    request<any>(`/local-invoices/${encodeURIComponent(invoiceId)}/collection-followup`, { method: "GET" }, token)
      .then((r) => live && setRaw(r))
      .catch(() => live && setRaw(null));
    return () => {
      live = false;
    };
  }, [token, invoiceId, reloadKey]);
  if (!raw) return null;
  const f = followupView(raw);
  if (f.remaining <= 0.004 && !f.reminderCount) return null;
  const late = f.dueText?.includes("gecikti");
  return (
    <View testID="followup-card">
      <SectionTitle title="Tahsilat takibi" />
      <Card padded style={[styles.block, { gap: spacing.xs }]}>
        <View style={styles.row}>
          <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>Kalan</Text>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{formatMoney(f.remaining, f.currency)}</Text>
        </View>
        {f.dueDate ? (
          <View style={styles.row}>
            <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>{`Vade ${formatDate(f.dueDate)}`}</Text>
            {f.dueText ? (
              <View style={[styles.pill, { backgroundColor: late ? colors.errorBg : colors.infoBg }]}>
                <Text testID="followup-due" style={[type.caption, { color: late ? colors.error : colors.info }]}>{f.dueText}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {f.reminderCount ? (
          <Text style={[type.caption, { color: colors.textTertiary }]}>{`${f.reminderCount} hatırlatma gönderildi · son ${formatDate(String(f.lastReminder || ""))}`}</Text>
        ) : null}
        {f.notice ? <Text style={[type.footnote, { color: colors.textSecondary }]}>{f.notice}</Text> : null}
        {mayWrite && (f.canDue || f.canRemind) ? (
          <View style={styles.acts}>
            {f.canDue ? (
              <Button testID="followup-due-change" size="sm" variant="secondary" label="Vadeyi değiştir" onPress={() => router.push({ pathname: "/local-invoices/meta", params: { id: invoiceId, title } })} style={{ flex: 1 }} />
            ) : null}
            {f.canRemind ? (
              <Button
                testID="followup-remind"
                size="sm"
                variant="secondary"
                label="Hatırlatma gönder"
                onPress={() => router.push({ pathname: "/local-invoices/reminder", params: { id: invoiceId, title, to: f.recipient } } as any)}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pill: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.pill },
  acts: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
});
