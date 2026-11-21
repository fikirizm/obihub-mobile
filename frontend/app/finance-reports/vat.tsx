// KDV raporu (D-20) + KDV devri (P6.4): ay seçimi; hesaplanan, indirilecek, tevkifat, ödenecek/devreden; oranlara göre; belge dökümü;
// devir paneli (yalnız TL). Açılış devri yazma/kaldırma yalnız Ayarlar düzenleme yetkisinde (sunucu settings.manage; yetkisizde salt okuma).
// Kurallar: src/vat-report.ts (web pages/reports/VatReportPage.jsx). Beyanname değildir.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { request } from "../../src/api";
import { money, pickCurrency } from "../../src/finance-reports";
import {
  amountToInput,
  CARRY_PATH,
  carryBody,
  carryErrorText,
  carryResult,
  carryView,
  currentMonth,
  filterRows,
  hasAnyDocument,
  monthLabel,
  rateLabel,
  resultOf,
  rowView,
  shiftMonth,
  vatErrorText,
  vatNotes,
  vatPath,
} from "../../src/vat-report";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, ReceiptIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { CurrencyChips, FigureHero, InfoNote } from "../../src/components/reports/ReportParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";

export default function VatReportScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => currentMonth());
  const [currency, setCurrency] = useState("");
  const [side, setSide] = useState("all");
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: any; message: string }>({ status: "loading", data: null, message: "" });
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const my = ++seq.current;
    try {
      const data = await request<any>(vatPath(month), { method: "GET" }, token);
      if (my === seq.current) setState({ status: "ready", data, message: "" });
    } catch (e: any) {
      if (my === seq.current) setState({ status: "error", data: null, message: vatErrorText(e) });
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [token, month]);
  useEffect(() => {
    setState({ status: "loading", data: null, message: "" });
    load();
  }, [load]);

  const data = state.data;
  const cur = pickCurrency<any>(data?.currencies, currency);
  const code = cur?.currency || "TRY";
  const carryOn = state.status === "ready" && data?.carry && typeof data.carry === "object";
  const atNow = month >= currentMonth();
  const nav = (
    <View style={[styles.block, styles.monthNav]}>
      <PressableScale testID="vat-prev" accessibilityRole="button" accessibilityLabel="Önceki ay" onPress={() => setMonth((x) => shiftMonth(x, -1))} style={[styles.navBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <ArrowLeftIcon size={18} color={colors.textPrimary} />
      </PressableScale>
      <Text testID="vat-month" style={[type.headline, { color: colors.textPrimary, flex: 1, textAlign: "center" }]}>{monthLabel(month)}</Text>
      <PressableScale
        testID="vat-next"
        accessibilityRole="button"
        accessibilityLabel="Sonraki ay"
        disabled={atNow}
        onPress={() => setMonth((x) => shiftMonth(x, 1))}
        style={[styles.navBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: atNow ? 0.4 : 1 }]}
      >
        <ArrowRightIcon size={18} color={colors.textPrimary} />
      </PressableScale>
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.wrap, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="report-vat">
      <StackHeader title="KDV raporu" subtitle="Aylık KDV ve devir" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
      >
        {nav}
        {state.status === "loading" ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : null}
        {state.status === "error" ? (
          <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="KDV raporu yüklenemedi" description={state.message} actionLabel="Tekrar dene" onAction={load} />
        ) : null}
        {state.status === "ready" && (!cur || !hasAnyDocument(data?.currencies)) ? (
          <EmptyState
            icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
            title="Bu ay için KDV'li belge yok"
            description={`${monthLabel(month)} içinde satış faturası, POS satışı, alış faturası ya da gider kaydı bulunmuyor.`}
          />
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
                const res = resultOf(cur);
                const out = cur.output || {};
                const inp = cur.input || {};
                return (
                  <FigureHero
                    testID="vat-figs"
                    title={res.label}
                    value={money(res.amount, code)}
                    hint={res.tone === "zero" ? "Hesaplanan ile indirilecek eşit" : "Bu ayın farkı (devir hariç)"}
                    cells={[
                      { label: "Hesaplanan KDV", value: money(out.vat, code) },
                      { label: "Beyan edilen hesaplanan", value: money(out.declared_vat, code) },
                      { label: `İndirilecek KDV (${Number(inp.count) || 0} alış)`, value: money(inp.vat, code) },
                      { label: "Tevkifat (satış)", value: money(out.withholding, code) },
                    ]}
                  />
                );
              })()}
            </View>
            {vatNotes(cur, data).map((n) => (
              <View key={n} style={styles.block}>
                <InfoNote tone={n.includes("bilinmiyor") ? "warning" : "info"}>{n}</InfoNote>
              </View>
            ))}
          </>
        ) : null}

        {carryOn ? <CarryPanel token={token} carry={data.carry} month={month} canEdit={canManage(user, "settings")} onSaved={load} /> : null}

        {state.status === "ready" && cur && hasAnyDocument(data?.currencies) ? (
          <>
            {[
              ["Satış (hesaplanan): oranlara göre", cur.output],
              ["Alış (indirilecek): oranlara göre", cur.input],
            ].map(([title, s]: any) => (
              <React.Fragment key={title}>
                <SectionTitle title={title} />
                <Card style={styles.block}>
                  {(s?.by_rate || []).length ? (
                    s.by_rate.map((r: any, i: number) => (
                      <View key={String(r.rate)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                        <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]}>{rateLabel(r.rate)}</Text>
                        <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`Matrah ${money(r.base, code)}`}</Text>
                        <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary, minWidth: 90, textAlign: "right" }]}>{money(r.vat, code)}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Bu tarafta kayıt yok.</Text>
                  )}
                </Card>
              </React.Fragment>
            ))}
            <SectionTitle title="Belge dökümü" />
            <View style={styles.block}>
              <OptionChips
                testIDPrefix="vat-side"
                options={[
                  { value: "all", label: "Tümü" },
                  { value: "sales", label: "Satış" },
                  { value: "purchases", label: "Alış" },
                ]}
                value={side}
                onChange={setSide}
              />
            </View>
            <Card style={styles.block}>
              {(() => {
                const rows = filterRows(data.rows, code, side);
                if (!rows.length) return <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Bu süzgeçte belge yok.</Text>;
                return rows.slice(0, 200).map((r: any, i: number) => {
                  const v = rowView(r, code);
                  return (
                    <View key={`${r.side}:${r.kind}:${r.id || i}`} style={[styles.doc, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={styles.docTop}>
                        <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{v.title}</Text>
                        <Text style={[type.callout, tabular, { color: r.vat_known ? colors.textPrimary : colors.textTertiary }]}>{v.amount}</Text>
                      </View>
                      <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={2}>{v.sub}</Text>
                      {v.detail ? <Text style={[type.caption, tabular, { color: colors.textSecondary }]}>{v.detail}</Text> : null}
                    </View>
                  );
                });
              })()}
            </Card>
          </>
        ) : null}
        {state.status === "ready" ? (
          <Text style={[type.caption, styles.block, { color: colors.textTertiary, marginTop: spacing.sm }]}>
            Beyanname değildir. ObiHub'daki kayıtlardan hesaplanır. Ayın farkına önceki aylardan devreden KDV dahil edilmez; devir, açılış devriyle ayrıca zincirlenir.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Devir paneli: bu ayın devir sonucu + açılış devri (elle, bir kez). Ödeme/beyan kaydı oluşturmaz.
function CarryPanel({ token, carry, month, canEdit, onSaved }: { token: string | null; carry: any; month: string; canEdit: boolean; onSaved: () => void }) {
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const v = carryView(carry);
  const res = carryResult(carry);
  const [form, setForm] = useState<{ month: string; amount: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opening = carry?.opening;

  const save = async () => {
    if (!token || !form || busy) return;
    const b = carryBody(form.month.trim(), form.amount);
    if (!b.ok) return setError(b.error);
    setBusy(true);
    setError("");
    try {
      await request<any>(CARRY_PATH, { method: "PUT", body: JSON.stringify(b.body) }, token);
      setForm(null);
      toast("Açılış devri kaydedildi.", "success");
      onSaved();
    } catch (e: any) {
      setError(carryErrorText(e, "Açılış devri kaydedilemedi. Biraz sonra yeniden deneyin."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!token || busy) return;
    const ok = await confirm({ title: "Açılış devri kaldırılsın mı?", message: "Devir yeniden 'girilmemiş' görünür. Değişiklik kaydı kalır.", confirmLabel: "Kaldır", destructive: true });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await request<any>(CARRY_PATH, { method: "DELETE" }, token);
      setForm(null);
      toast("Açılış devri kaldırıldı.", "success");
      onSaved();
    } catch (e: any) {
      setError(carryErrorText(e, "Açılış devri kaldırılamadı. Biraz sonra yeniden deneyin."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="vat-carry">
      <SectionTitle title="Önceki aylardan devreden KDV (TL)" />
      <View style={[styles.block, { gap: spacing.sm }]}>
        {v.ok ? (
          <Card style={{ marginHorizontal: 0 }}>
            {[
              ["Önceki aydan devreden", carry.carry_in],
              ["Beyan edilen hesaplanan", carry.declared_vat],
              ["İndirilecek", carry.input_vat],
              // Sonraki aya devreden tutar sonuç satırında (devreden ya da ödenecek) gösterilir.
            ].map(([label, val], i) => (
              <View key={label} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Text style={[type.body, { color: colors.textSecondary, flex: 1 }]}>{label}</Text>
                <Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{money(val, "TRY")}</Text>
              </View>
            ))}
            {res ? (
              <View testID="vat-carry-result" style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>{res.label}</Text>
                <Text style={[type.bodyStrong, tabular, { color: res.tone === "carry" ? colors.success : colors.textPrimary }]}>{money(res.amount, "TRY")}</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <InfoNote tone={v.tone === "warning" ? "warning" : "info"}>{v.message}</InfoNote>
        )}
        {v.warnings.map((w) => (
          <InfoNote key={w} tone={w.startsWith("KDV tutarı") ? "warning" : "info"}>{w}</InfoNote>
        ))}
        {v.openingText ? <Text style={[type.caption, { color: colors.textSecondary }]}>{v.openingText}</Text> : null}

        {!canEdit ? (
          <Text style={[type.caption, { color: colors.textTertiary }]}>Açılış devri bir firma ayarıdır; değiştirmek için Ayarlar düzenleme izni gerekir.</Text>
        ) : form ? (
          <View style={{ gap: spacing.sm }} testID="vat-carry-form">
            <FormField testID="vat-carry-month" label="Hangi aydan önce (YYYY-AA)" value={form.month} onChangeText={(x) => setForm((f) => f && { ...f, month: x })} maxLength={7} autoCapitalize="none" placeholder="2026-08" />
            <FormField testID="vat-carry-amount" label="Devreden KDV" suffix="₺" value={form.amount} onChangeText={(x) => setForm((f) => f && { ...f, amount: x })} keyboardType="decimal-pad" placeholder="0,00" />
            <Text style={[type.caption, { color: colors.textTertiary }]}>Muhasebecinizin verdiği, seçtiğiniz aydan önceki son beyannamedeki "sonraki döneme devreden KDV" tutarını girin.</Text>
            {error ? <InfoNote tone="warning">{error}</InfoNote> : null}
            <View style={styles.actions}>
              <Button testID="vat-carry-save" size="sm" label={busy ? "Kaydediliyor…" : "Kaydet"} disabled={busy} onPress={save} />
              <Button size="sm" variant="secondary" label="Vazgeç" disabled={busy} onPress={() => (setForm(null), setError(""))} />
              {opening ? <Button testID="vat-carry-remove" size="sm" variant="ghost" label="Açılış devrini kaldır" disabled={busy} onPress={remove} /> : null}
            </View>
          </View>
        ) : (
          <>
            {error ? <InfoNote tone="warning">{error}</InfoNote> : null}
            <Button
              testID="vat-carry-edit"
              size="sm"
              variant="secondary"
              label={opening ? "Açılış devrini düzenle" : "Açılış devrini gir"}
              onPress={() => (setError(""), setForm({ month: opening?.month || shiftMonth(month, -1), amount: amountToInput(opening?.amount) }))}
              style={{ alignSelf: "flex-start" }}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  monthNav: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  navBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 48 },
  doc: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  docTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
