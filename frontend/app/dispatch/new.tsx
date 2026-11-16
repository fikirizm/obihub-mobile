// Dalga 5a (P5.1): siparişten ya da faturadan irsaliye — GET /dispatch-notes/prefill?order_id=|invoice_id= ile form dolu gelir (siparişte
// kargo firması ve takip no dahil). Kullanıcı takip no ve notu düzeltir; POST /dispatch-notes + Idempotency-Key (belirsiz sonuçta aynı anahtar).
// Siparişe bağlı irsaliye stoğa dokunmaz; faturadan irsaliye yalnız stok çıkışı yapmayan faturada (aksi 409 INVOICE_MOVES_STOCK).
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { dispatchErrorText, prefillBody } from "../../src/dispatch";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

export default function DispatchNewScreen() {
  const p = useLocalSearchParams<{ orderId?: string; invoiceId?: string; title?: string }>();
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [pre, setPre] = useState<any>(null);
  const [error, setError] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey("dn"));

  useEffect(() => {
    if (!token) return;
    const qs = p.orderId ? `order_id=${encodeURIComponent(String(p.orderId))}` : `invoice_id=${encodeURIComponent(String(p.invoiceId || ""))}`;
    request<any>(`/dispatch-notes/prefill?${qs}`, { method: "GET" }, token)
      .then((r) => {
        setPre(r);
        setCarrier(String(r?.cargo?.carrier || ""));
        setTracking(String(r?.cargo?.tracking_no || ""));
        setNotes(String(r?.notes || ""));
      })
      .catch((e) => setError(dispatchErrorText(e)));
  }, [token, p.orderId, p.invoiceId]);

  const save = async () => {
    if (!token || !pre || busy) return;
    setBusy(true);
    const body = prefillBody(pre, { carrier, tracking, notes });
    const out = await sendKeyedMoney(
      () => request<any>("/dispatch-notes", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key.current } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "İrsaliye oluşturulmuş olabilir. Yeniden gönderirseniz ikinci kez oluşmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      const note = out.result?.note || out.result;
      toast(out.result?.created === false ? "Bu irsaliye zaten oluşturulmuştu." : `İrsaliye oluşturuldu${note?.number ? `: ${note.number}` : ""}.`, "success");
      if (note?.id) router.replace({ pathname: "/dispatch/[id]", params: { id: String(note.id) } } as any);
      else router.back();
      return;
    }
    if (!out.uncertain) key.current = newIdempotencyKey("dn");
    toast(dispatchErrorText(out.error), "error");
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dispatch-new">
      <StackHeader title="İrsaliye oluştur" subtitle={p.title ? String(p.title) : undefined} />
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="İrsaliye hazırlanamadı" description={error} />
      ) : !pre ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
            <SectionTitle title="Bilgiler" />
            <Card style={styles.block}>
              <ListRow title="Müşteri" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{pre.party_name}</Text>} />
              <ListRow divider title="Tarih" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{formatDate(pre.issue_date)}</Text>} />
              {pre.order_no ? <ListRow divider title="Sipariş" trailing={<Text style={[type.callout, { color: colors.textPrimary }]}>{pre.order_no}</Text>} /> : null}
            </Card>
            <View style={[styles.block, { gap: spacing.sm }]}>
              <FormField testID="dispatch-carrier" label="Kargo firması" value={carrier} onChangeText={setCarrier} maxLength={120} />
              <FormField testID="dispatch-tracking" label="Takip no" value={tracking} onChangeText={setTracking} autoCapitalize="characters" maxLength={80} />
              <FormField testID="dispatch-notes" label="Not (isteğe bağlı)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
            </View>
            <SectionTitle title="Kalemler" />
            <Card style={styles.block}>
              {(pre.lines || []).map((l: any, i: number) => (
                <ListRow
                  key={l.line_key || i}
                  divider={i > 0}
                  title={l.product_name || l.description || "Kalem"}
                  trailing={<Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{`${String(l.quantity).replace(".", ",")} ${l.unit || ""}`}</Text>}
                />
              ))}
            </Card>
            <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>
              {pre.order_id ? "Siparişe bağlı irsaliye stoğa dokunmaz; stok siparişte düştü." : "Faturadan irsaliye: stok irsaliyeyle düşer."}
            </Text>
            <View style={styles.block}>
              <Button testID="dispatch-save" label="İrsaliyeyi oluştur" busy={busy} onPress={save} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg } });
