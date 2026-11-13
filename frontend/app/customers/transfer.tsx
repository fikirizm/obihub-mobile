// K9 (13 Kas 2026) — cari → cari virman (C2 kalıbı). Kaynak caride ALACAK, hedef caride BORÇ; kasa/banka yok.
// Yeni: POST /customers/{id}/transfers {target_customer_id, amount (dize), date, note}. Düzenle: PATCH …/transfers/{tid} {amount, date, note}
// (kaynak/hedef değişmez; eskisi ters kayıt, yenisi yeni kimlik). Idempotency-Key zorunlu; belirsizde AYNI anahtarla yeniden gönderilir.
// Hedef cari aranarak seçilir: kendisi, siparişten türetilen ve farklı para birimli kartlar listelenmez (src/cari-ui.ts).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getParties } from "../../src/api";
import { createCustomerTransfer, patchCustomerTransfer, type CustomerTransfer } from "../../src/api-finans";
import { istanbulToday } from "../../src/api-gider";
import { transferBody, transferErrorText, transferFormError, transferPatchBody, transferTargets } from "../../src/cari-ui";
import { moneySubmitLabel, useMoneyWrite } from "../../src/useMoneyWrite";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, CheckIcon, RefreshIcon, UserIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { SummaryHero } from "../../src/ui/SummaryHero";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import type { Party } from "../../src/types";

const trDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
function parseDateInput(text: string): string {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
const shiftDay = (iso: string, days: number) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
};
const partyName = (p: Party) => p.name || p.company_name || p.full_name || "Cari";
const trAmount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};
function parseTransfer(raw: unknown): CustomerTransfer | null {
  try {
    const t = JSON.parse(String(raw || ""));
    return t && typeof t.id === "string" ? (t as CustomerTransfer) : null;
  } catch {
    return null;
  }
}

export default function CustomerTransferScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; currency?: string; t?: string }>();
  const id = String(params.id || "");
  const currency = String(params.currency || "TRY").toUpperCase().replace("TRL", "TRY");
  const editing = useMemo(() => parseTransfer(params.t), [params.t]);
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const mayWrite = canManage(user, "customers") || canManage(user, "billing");
  const write = useMoneyWrite(editing ? "trf-edit" : "trf", transferErrorText);
  const today = istanbulToday();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Party[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    editing ? { id: editing.target_customer_id, name: editing.direction === "in" ? editing.source_name || "Kaynak cari" : editing.target_name || "Hedef cari" } : null
  );
  const [amountText, setAmountText] = useState(editing ? trAmount(editing.amount) : "");
  const [dateText, setDateText] = useState(trDate(editing?.date?.slice(0, 10) || today));
  const [note, setNote] = useState(editing?.note || "");
  const [tried, setTried] = useState(false);
  const locked = write.locked || write.saving;

  // Hedef cari araması: 2+ harf, 350 ms bekleme; eski yanıt yenisinin üstüne yazmaz.
  useEffect(() => {
    if (!token || editing || target) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await getParties(token, { search: q });
        if (mine === seq.current) setResults(transferTargets(r.items, { id, currency }));
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [token, query, editing, target, id, currency]);

  const date = parseDateInput(dateText);
  const form = { targetId: target?.id || "", amount: amountText, date, note };
  const formError = tried ? transferFormError(form, today) : null;

  const submit = async () => {
    setTried(true);
    if (!token || write.blocked || transferFormError(form, today)) return;
    const out = editing
      ? await write.run((key) => patchCustomerTransfer(token, id, editing.id, transferPatchBody(form), key))
      : await write.run((key) => createCustomerTransfer(token, id, transferBody(form), key));
    if (out.kind === "done") {
      const r: any = out.result;
      toast(r?.replayed ? "Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi." : editing ? "Virman güncellendi; eski kayıt geri alınıp yenisi yazıldı." : "Virman kaydedildi.", "success");
      if (router.canGoBack()) router.back();
    } else if (out.kind === "pending" || out.kind === "partial") toast(transferErrorText(out.error), "info");
  };

  const body = () => {
    if (!mayWrite)
      return <EmptyState icon={<UserIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Virman için cari ya da fatura yönetimi yetkisi gerekir." />;
    const amountMinor = (() => {
      const n = Number(String(amountText).replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    })();
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SummaryHero
            testID="transfer-hero"
            tone="violet"
            label={editing ? "Virmanı düzenle" : "Virman tutarı"}
            value={formatMoney(amountMinor, currency)}
            facts={[
              { label: "Kaynak (alacak)", value: String(params.name || "Bu cari") },
              { label: "Hedef (borç)", value: target?.name || "Seçilmedi" },
            ]}
            footer={<Text style={styles.heroHint}>Kasa ve banka değişmez; tutar bu carinin alacağına, hedef carinin borcuna yazılır.</Text>}
          />

          <SectionTitle title="Hedef cari" />
          {target ? (
            <Card padded style={[styles.block, styles.picked]}>
              <UserIcon size={18} color={colors.primary} />
              <Text testID="transfer-target" style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                {target.name}
              </Text>
              {!editing ? <Button testID="transfer-target-change" size="sm" variant="secondary" label="Değiştir" disabled={locked} onPress={() => { setTarget(null); setQuery(""); }} /> : null}
            </Card>
          ) : (
            <View style={styles.form}>
              <FormField testID="transfer-search" label="Cari ara" value={query} onChangeText={setQuery} placeholder="En az 2 harf" editable={!locked} />
              {query.trim().length >= 2 ? (
                <Card>
                  {searching ? (
                    <Text style={[type.footnote, styles.pad, { color: colors.textTertiary }]}>Aranıyor…</Text>
                  ) : results.length === 0 ? (
                    <Text style={[type.footnote, styles.pad, { color: colors.textTertiary }]}>Uygun cari bulunamadı. Hedef cari kayıtlı ve aynı para biriminde ({currency}) olmalı.</Text>
                  ) : (
                    results.slice(0, 8).map((p, i) => (
                      <PressableScale key={p.id} testID={`transfer-target-${p.id}`} onPress={() => setTarget({ id: p.id, name: partyName(p) })} accessibilityRole="button" accessibilityLabel={partyName(p)}>
                        <View style={[styles.pad, styles.resultRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                            {partyName(p)}
                          </Text>
                          <CheckIcon size={16} color={colors.textTertiary} />
                        </View>
                      </PressableScale>
                    ))
                  )}
                </Card>
              ) : null}
            </View>
          )}

          <View style={styles.form}>
            <FormField testID="transfer-amount" label={`Tutar (${currency})`} value={amountText} onChangeText={setAmountText} editable={!locked} keyboardType="decimal-pad" placeholder="0,00" />
            <View style={{ gap: spacing.xs }}>
              <FormField testID="transfer-date" label="Tarih" value={dateText} onChangeText={setDateText} editable={!locked} placeholder="GG.AA.YYYY" />
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow>
                  <Chip label="Bugün" selected={date === today} onPress={() => !locked && setDateText(trDate(today))} />
                  <Chip label="Dün" selected={date === shiftDay(today, -1)} onPress={() => !locked && setDateText(trDate(shiftDay(today, -1)))} />
                </ChipRow>
              </View>
            </View>
            <FormField testID="transfer-note" label="Açıklama (zorunlu)" value={note} onChangeText={setNote} editable={!locked} placeholder="ör. Mahsup — aynı firmanın iki kartı" maxLength={200} />
            {formError ? (
              <Text testID="transfer-form-error" accessibilityRole="alert" style={[type.footnote, { color: colors.error }]}>
                {formError}
              </Text>
            ) : null}
            {write.locked ? (
              <View testID="transfer-uncertain" style={[styles.box, { backgroundColor: colors.warningBg }]}>
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Önceki gönderimin sonucu alınamadı; virman kaydedilmiş olabilir. Bilgiler kilitlendi: aynı işlemi yeniden gönderebilirsiniz, ikinci kez işlenmez.
                </Text>
              </View>
            ) : null}
            {write.error ? (
              <View testID="transfer-error" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.errorBg }]}>
                <AlertIcon size={16} color={colors.error} />
                <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{write.error}</Text>
              </View>
            ) : null}
            {write.blocked ? (
              <Button testID="transfer-close" variant="secondary" label="Kapat" onPress={() => router.canGoBack() && router.back()} />
            ) : (
              <Button testID="transfer-submit" label={moneySubmitLabel(write, editing ? "Virmanı güncelle" : "Virmanı kaydet")} icon={<RefreshIcon size={18} color="#FFFFFF" />} busy={write.saving} onPress={submit} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="transfer-screen">
      <StackHeader title={editing ? "Virmanı düzenle" : "Virman"} subtitle={params.name ? String(params.name) : undefined} />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  picked: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pad: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: "center" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroHint: { color: "#CBD5E1", fontSize: 12, marginTop: spacing.sm },
  box: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md },
});
