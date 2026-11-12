// Aşama 4 / P8 — "Avansı faturaya dağıt" (C2 kalıbı).  Web: components/customers/AllocateAdvanceDialog.jsx.
// GET /customers/{id}/allocation-state → POST /customers/{id}/allocations {allocations} + Idempotency-Key.
// Kasaya ve cari bakiyesine yeni kayıt yazılmaz; yalnız daha önce alınan avans faturalara bağlanır.  K4: taslak faturalar listelenmez.
import React, { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getAllocationState, postAllocations, type AllocationState } from "../../src/api-finans";
import { advanceAllocationError, allocatableInvoices, allocateDoneTexts, allocationErrorText, autoFill, buildAllocations, formatMinor, toMinor } from "../../src/allocation";
import { moneySubmitLabel, useMoneyWrite } from "../../src/useMoneyWrite";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { AllocationRows } from "../../src/components/AllocationRows";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, WalletIcon } from "../../src/components/Icons";
import { Skeleton } from "../../src/components/Skeleton";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card } from "../../src/ui/ListRow";

export default function AllocateAdvanceScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; currency?: string }>();
  const id = String(params.id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const mayWrite = canManage(user, "customers") || canManage(user, "billing");
  const write = useMoneyWrite("alc", allocationErrorText);
  const [state, setState] = useState<AllocationState | "error" | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setState(null);
    try {
      setState(await getAllocationState(token, id));
    } catch {
      setState("error");
    }
  }, [token, id]);
  useEffect(() => {
    load();
  }, [load]);

  const data = state && state !== "error" ? state : null;
  const cur = data?.currency || String(params.currency || "TRY").toUpperCase();
  const invoices = allocatableInvoices(data?.open_invoices);
  const advance = data ? toMinor(data.advance) ?? 0n : 0n;
  const alloc = buildAllocations(invoices, values, cur);
  const locked = write.locked || write.saving;
  const canSubmit = Boolean(data) && advance > 0n && invoices.length > 0 && !write.blocked;

  const submit = async () => {
    if (!token || !canSubmit) return;
    const err = advanceAllocationError(alloc, advance);
    setFormError(err);
    if (err) return;
    const total = alloc.total;
    const out = await write.run((key) => postAllocations(token, id, alloc.items, key));
    if (out.kind === "done") {
      toast(allocateDoneTexts(out.result, total, cur).join(" "), "success");
      if (router.canGoBack()) router.back();
      return;
    }
    if (out.kind === "pending" || out.kind === "partial") toast(allocationErrorText(out.error), "info");
    if (["ADVANCE_INSUFFICIENT", "PAYMENT_EXCEEDS_REMAINING", "ALLOCATION_INVALID", "INVOICE_NOT_ISSUED"].includes(out.error?.code)) {
      setValues({});
      load();
    }
  };

  const body = () => {
    if (!mayWrite)
      return <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Dağıtım için cari ya da fatura yönetimi yetkisi gerekir." />;
    if (state === null)
      return (
        <View style={{ padding: spacing.lg, gap: spacing.md }} accessibilityLabel="Avans ve açık faturalar yükleniyor">
          <Skeleton height={130} borderRadius={radius.xl} />
          <Skeleton height={72} borderRadius={radius.md} />
          <Skeleton height={72} borderRadius={radius.md} />
        </View>
      );
    if (state === "error")
      return <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Okunamadı" description="Avans ve açık faturalar şu anda okunamadı." actionLabel="Yeniden dene" onAction={load} />;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="violet">
            <Text style={styles.heroLabel}>Dağıtılabilir avans</Text>
            <Text testID="alloc-advance" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMinor(advance, cur)}
            </Text>
            <View style={styles.heroFacts}>
              <View style={styles.heroFact}>
                <Text style={styles.heroFactLabel}>Açık fatura</Text>
                <Text style={[styles.heroFactValue, tabular]}>{invoices.length}</Text>
              </View>
              <View style={styles.heroFact}>
                <Text style={styles.heroFactLabel}>Dağıtılacak</Text>
                <Text testID="alloc-total" style={[styles.heroFactValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMinor(alloc.total, cur)}
                </Text>
              </View>
              <View style={styles.heroFact}>
                <Text style={styles.heroFactLabel}>Kalan avans</Text>
                <Text style={[styles.heroFactValue, tabular, alloc.total > advance && { color: "#FECACA" }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMinor(alloc.total > advance ? 0n : advance - alloc.total, cur)}
                </Text>
              </View>
            </View>
          </HeroCard>

          {advance <= 0n ? (
            <Card padded style={[styles.block, { marginTop: spacing.md }]}>
              <Text testID="alloc-no-advance" style={[type.body, { color: colors.textSecondary }]}>
                Bu cari için dağıtılmamış avans yok. Önce faturasız bir tahsilat alın ya da "Avans olarak bırak" seçeneğini kullanın.
              </Text>
            </Card>
          ) : !invoices.length ? (
            <Card padded style={[styles.block, { marginTop: spacing.md }]}>
              <Text testID="alloc-no-invoices" style={[type.body, { color: colors.textSecondary }]}>Açık fatura yok; avans, fatura kesildiğinde buradan faturaya bağlanır.</Text>
            </Card>
          ) : (
            <>
              <Card style={[styles.block, { marginTop: spacing.md }]}>
                <AllocationRows invoices={invoices} values={values} errors={alloc.errors} currency={cur} disabled={locked} onChange={(k, v) => { setFormError(""); setValues((p) => ({ ...p, [k]: v })); }} />
              </Card>
              <View style={[styles.inline, styles.form]}>
                <Button testID="alloc-autofill" size="sm" variant="secondary" label="En eski vadeden doldur" disabled={locked} onPress={() => setValues(autoFill(invoices, advance))} />
                <Button testID="alloc-clear" size="sm" variant="secondary" label="Temizle" disabled={locked} onPress={() => setValues({})} />
              </View>
              <Text style={[type.caption, styles.hint, { color: colors.textTertiary }]}>
                Bu işlem kasaya ve cari bakiyesine yeni kayıt yazmaz; yalnız daha önce alınan avansı faturalara bağlar.
              </Text>
            </>
          )}

          <View style={styles.form}>
            {formError ? (
              <Text testID="alloc-form-error" accessibilityRole="alert" style={[type.footnote, { color: colors.error }]}>
                {formError}
              </Text>
            ) : null}
            {write.locked ? (
              <View testID="alloc-uncertain" style={[styles.box, { backgroundColor: colors.warningBg }]}>
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Önceki gönderimin sonucu alınamadı; dağıtım kaydedilmiş olabilir. Bilgiler kilitlendi: aynı dağıtımı yeniden gönderebilirsiniz, ikinci kez işlenmez.
                </Text>
              </View>
            ) : null}
            {write.error ? (
              <View testID="alloc-error" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.errorBg }]}>
                <AlertIcon size={16} color={colors.error} />
                <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{write.error}</Text>
              </View>
            ) : null}
            {write.blocked ? (
              <Button testID="alloc-close" variant="secondary" label="Kapat" onPress={() => router.canGoBack() && router.back()} />
            ) : canSubmit ? (
              <Button testID="alloc-submit" label={moneySubmitLabel(write, "Faturalara dağıt")} busy={write.saving} onPress={submit} />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="allocate-screen">
      <StackHeader title="Avansı faturaya dağıt" subtitle={params.name ? String(params.name) : undefined} />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, fontWeight: "800", letterSpacing: -0.6, marginTop: 2 },
  heroFacts: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroFact: { flex: 1, minWidth: 0 },
  heroFactLabel: { color: ON_HERO.soft, fontSize: 12 },
  heroFactValue: { color: ON_HERO.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  inline: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  hint: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  box: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md },
});
