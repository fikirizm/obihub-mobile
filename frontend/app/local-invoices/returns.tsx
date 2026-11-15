// D-12: iade belgesi oluştur (web InvoiceLifecycle.ReturnDialog). Kalemler yalnız kaynak faturadan; miktar ≤ kalan (miktar − önceki iadeler).
// Belge türü İade faturası / Gider pusulası; "Ürünleri stoğa geri al". İade belgesi taslak açılır; kesince cari alacağı azalır.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { getLocalInvoice, newIdempotencyKey } from "../../src/api";
import { createInvoiceReturn, getInvoiceReturns, sendKeyedMoney } from "../../src/api-finans";
import { lifecycleErrorText, returnLines, returnRows, type ReturnRow } from "../../src/document-lifecycle";
import { todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

const qtyText = (n: number) => String(Math.round(n * 1e6) / 1e6).replace(".", ",");

export default function InvoiceReturnScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const id = String(params.id || "");
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [unkeyed, setUnkeyed] = useState(0);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<"iade_faturasi" | "gider_pusulasi">("iade_faturasi");
  const [stockIn, setStockIn] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lineErr, setLineErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = useRef(newIdempotencyKey("return"));

  useEffect(() => {
    if (!token || !id) return;
    let on = true;
    setState("loading");
    Promise.all([getLocalInvoice(token, id), getInvoiceReturns(token, id)])
      .then(([inv, ret]) => {
        if (!on) return;
        const r = returnRows((inv as any)?.items || [], ret?.returned_totals || {});
        setRows(r.rows);
        setUnkeyed(r.unkeyed);
        setState("ready");
      })
      .catch(() => on && setState("error"));
    return () => {
      on = false;
    };
  }, [token, id, attempt]);

  const submit = async () => {
    if (!token || busy) return;
    const out = returnLines(rows, qty);
    setLineErr(out.errors);
    if (Object.keys(out.errors).length) return setError("");
    if (out.error) return setError(out.error);
    setError("");
    const ok = await confirm({
      title: kind === "iade_faturasi" ? "İade faturası oluşturulsun mu?" : "Gider pusulası oluşturulsun mu?",
      message: `${out.lines.length} kalem · ${stockIn ? "ürünler stoğa geri alınır" : "stok değişmez"}. Belge taslak açılır; kesince carinin alacağı azalır.`,
      confirmLabel: "İade belgesi oluştur",
    });
    if (!ok) return;
    setBusy(true);
    const res = await sendKeyedMoney(
      () => createInvoiceReturn(token, id, { kind, lines: out.lines, stock_in: stockIn, date: todayIso(), ...(note.trim() ? { note: note.trim() } : {}) }, key.current),
      () => confirm({ title: "Sonuç alınamadı", message: "İade belgesi oluşmuş olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez oluşmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (res.ok) {
      const warn = Array.isArray(res.result?.warnings) && res.result.warnings.length ? ` ${res.result.warnings.map((w: any) => w?.detail).filter(Boolean).join(" ")}` : "";
      toast(`${kind === "iade_faturasi" ? "İade faturası" : "Gider pusulası"} taslak olarak oluşturuldu.${warn}`, "success");
      if (res.result?.id) router.replace({ pathname: "/local-invoices/[id]", params: { id: String(res.result.id) } });
      else router.back();
      return;
    }
    if (!res.uncertain) key.current = newIdempotencyKey("return");
    setError(lifecycleErrorText(res.error, res.uncertain ? "Sonuç alınamadı. Fatura listesini kontrol edin." : "İade belgesi oluşturulamadı."));
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invoice-return-screen">
      <StackHeader title="İade belgesi oluştur" subtitle={params.title ? String(params.title) : undefined} />
      {state === "loading" ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : state === "error" ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Kalemler yüklenemedi" description="Biraz sonra yeniden deneyin." actionLabel="Tekrar dene" onAction={() => setAttempt((n) => n + 1)} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[type.callout, { color: colors.textSecondary }]}>Kalemleri ve miktarı seçin. İade belgesi taslak açılır; kesince cari alacağı azalır.</Text>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow>
                <Chip testID="return-kind-iade" label="İade faturası" selected={kind === "iade_faturasi"} onPress={() => setKind("iade_faturasi")} />
                <Chip testID="return-kind-pusula" label="Gider pusulası" selected={kind === "gider_pusulasi"} onPress={() => setKind("gider_pusulasi")} />
              </ChipRow>
            </View>
            {unkeyed ? (
              <Text style={[type.caption, { color: colors.textTertiary }]}>{`${unkeyed} kalem eski kayıt olduğu için iade edilemez; gerekirse faturayı iptal edip yenisini oluşturun.`}</Text>
            ) : null}
            <Card padded style={{ gap: spacing.md }}>
              {rows.length ? (
                rows.map((r) => (
                  <View key={r.key} testID={`return-line-${r.key}`} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                        {r.name}
                      </Text>
                      <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>
                        {r.left <= 0 ? "Tamamı iade edildi" : `Faturada ${qtyText(r.total)} · İade edilen ${qtyText(r.done)} · Kalan ${qtyText(r.left)}`}
                      </Text>
                      {lineErr[r.key] ? <Text style={[type.caption, { color: colors.error }]}>{lineErr[r.key]}</Text> : null}
                    </View>
                    <FormField
                      style={{ width: 96 }}
                      testID={`return-qty-${r.key}`}
                      label="Miktar"
                      value={qty[r.key] ?? ""}
                      onChangeText={(t) => setQty((q) => ({ ...q, [r.key]: t }))}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      editable={r.left > 0 && !busy}
                    />
                  </View>
                ))
              ) : (
                <Text style={[type.callout, { color: colors.textSecondary }]}>İade edilebilecek kalem yok.</Text>
              )}
            </Card>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow>
                <Chip testID="return-stock-in" label="Ürünleri stoğa geri al" selected={stockIn} onPress={() => setStockIn(!stockIn)} />
              </ChipRow>
            </View>
            <FormField testID="return-note" label="Not (isteğe bağlı)" value={note} onChangeText={setNote} maxLength={300} />
            {error ? (
              <Text testID="return-error" style={[type.footnote, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}
            <Button testID="return-confirm" label={busy ? "Oluşturuluyor…" : "İade belgesi oluştur"} busy={busy} disabled={!rows.some((r) => r.left > 0)} onPress={submit} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderRadius: radius.md },
});
