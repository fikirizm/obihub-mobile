// Resmileştir onay sayfası (Dalga 1 #8: sistem uyarısı yerine uygulama içi sayfa; Dalga 2 P2.1: e-Arşiv "İnternet üzerinden yapıldı"
// ve iade e-belgesi). Fatura Paraşüt üzerinden e-belge olarak gönderilir; geri alınamaz. İnternet satışı yalnız e-Arşiv'e gider.
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { officializeLocalInvoice } from "../../src/api";
import { istanbulToday } from "../../src/api-gider";
import { autoSettlementText } from "../../src/cari-ui";
import { blankInternetSale, officializeBody, officializeErrorText, PAYMENT_TYPES, validateInternetSale, type InternetSale } from "../../src/officialize";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { Button } from "../../src/ui/Button";
import { Chip } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

const shift = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
// "GG.AA.YYYY" ya da "YYYY-AA-GG" → ISO; geçersiz olduğu gibi kalır (denetim yakalar).
const isoOf = (t: string) => {
  const v = t.trim();
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v;
};

export default function OfficializeScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; total?: string; paid?: string; kind?: string }>();
  const id = String(params.id || "");
  const isReturn = params.kind === "iade";
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const today = istanbulToday();
  const [sale, setSale] = useState<InternetSale>(blankInternetSale(today));
  const [dateText, setDateText] = useState(today);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = validateInternetSale(sale, today);
  const set = (patch: Partial<InternetSale>) => setSale((s) => ({ ...s, ...patch }));

  const submit = async () => {
    if (!token || busy) return;
    if (Object.keys(errors).length) return setShown(true);
    setBusy(true);
    setError("");
    try {
      const r = await officializeLocalInvoice(token, id, officializeBody(sale));
      const settled = autoSettlementText((r as any)?.auto_settlement);
      const main = r?.message || (r?.pending ? "E-belge sıraya alındı" : isReturn ? "İade faturası resmileşti" : "Fatura resmileşti");
      // 24 Kas: Paraşüt kategori/etiketi reddedip fatura sınıflandırmasız kesildiyse uyarı metni mesajdadır; başarı tonu yerine bilgi.
      toast([main, settled, r?.amount_note ? String(r.amount_note) : null].filter(Boolean).join(" "), (r as any)?.classification_skipped ? "info" : "success");
      router.back();
    } catch (e: any) {
      setError(officializeErrorText(e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="officialize-screen">
      <StackHeader title={isReturn ? "İade faturasını resmileştir" : "Faturayı resmileştir"} subtitle={params.title ? String(params.title) : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.note, { backgroundColor: colors.infoBg }]}>
            <Text style={[type.callout, { color: colors.textPrimary }]}>
              {isReturn
                ? "İade faturası, asıl faturaya bağlı iade belgesi olarak Paraşüt'e gönderilir. Bu işlem geri alınamaz."
                : "Fatura Paraşüt üzerinden e-belge olarak gönderilir: alıcı e-Fatura kullanıcısıysa e-Fatura, değilse e-Arşiv. Bu işlem geri alınamaz."}
            </Text>
            {Number(params.paid || 0) > 0 ? (
              <Text style={[type.footnote, { color: colors.textSecondary }]}>Alınan tahsilatlar ObiHub'da kalır, bu adımda Paraşüt'e gönderilmez.</Text>
            ) : null}
          </View>

          {!isReturn ? (
            <Card padded style={{ gap: spacing.sm }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>İnternet üzerinden yapıldı</Text>
                  <Text style={[type.caption, { color: colors.textTertiary }]}>Yalnız e-Arşiv belgesine yazılır (web adresi, ödeme şekli, tarih).</Text>
                </View>
                <Switch testID="internet-sale-toggle" value={sale.enabled} onValueChange={(v) => set({ enabled: v })} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
              {sale.enabled ? (
                <>
                  <FormField
                    testID="internet-sale-url"
                    label="Web adresi"
                    value={sale.url}
                    onChangeText={(t) => set({ url: t })}
                    placeholder="https://magazaniz.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    error={shown ? errors.url : undefined}
                  />
                  <Text style={[type.caption, { color: colors.textSecondary }]}>Ödeme şekli</Text>
                  <View style={styles.chips}>
                    {PAYMENT_TYPES.map(([v, l]) => (
                      <Chip key={v} testID={`internet-sale-pay-${v}`} label={l} selected={sale.payment_type === v} onPress={() => set({ payment_type: v })} />
                    ))}
                  </View>
                  {sale.payment_type === "payment_platform" ? (
                    <FormField
                      testID="internet-sale-platform"
                      label="Ödeme aracısı"
                      value={sale.payment_platform}
                      onChangeText={(t) => set({ payment_platform: t })}
                      placeholder="iyzico, PayTR…"
                      error={shown ? errors.payment_platform : undefined}
                    />
                  ) : null}
                  <Text style={[type.caption, { color: colors.textSecondary }]}>Ödeme tarihi</Text>
                  <View style={styles.chips}>
                    <Chip testID="internet-sale-today" label="Bugün" selected={sale.payment_date === today} onPress={() => (set({ payment_date: today }), setDateText(today))} />
                    <Chip label="Dün" selected={sale.payment_date === shift(today, -1)} onPress={() => (set({ payment_date: shift(today, -1) }), setDateText(shift(today, -1)))} />
                  </View>
                  <FormField
                    testID="internet-sale-date"
                    label="Başka bir tarih"
                    value={dateText}
                    onChangeText={(t) => {
                      setDateText(t);
                      set({ payment_date: isoOf(t) });
                    }}
                    placeholder="GG.AA.YYYY"
                    error={shown ? errors.payment_date : undefined}
                  />
                </>
              ) : null}
            </Card>
          ) : null}

          {error ? (
            <Text testID="officialize-error" style={[type.footnote, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}
          <Button testID="officialize-confirm" label={busy ? "Gönderiliyor…" : "Resmileştir"} busy={busy} onPress={submit} />
          <Button variant="ghost" label="Vazgeç" disabled={busy} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  note: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // Kart içinde: çipler yatay kaymaz, alt satıra sarılır.
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
