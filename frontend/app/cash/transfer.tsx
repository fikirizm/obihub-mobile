import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getCashAccounts, newIdempotencyKey } from "../../src/api";
import { createTransfer, moneyRetryable } from "../../src/api-finans";
import { todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { ArrowRightIcon, WalletIcon } from "../../src/components/Icons";
import { Button } from "../../src/ui/Button";
import { parseAmount, useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount } from "../../src/types";
import { AccountOption } from "../../src/components/AccountOption";

const cur = (a?: CashAccount | null) => String(a?.currency || "TRY").toUpperCase();

export default function TransferScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromId, setFromId] = useState(String(params.from || ""));
  const [toId, setToId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Önceki gönderimin sonucu belirsiz kaldıysa (yanıt alınamadı) doğrudur; yeniden gönderim ayrıca onaylatılır.
  const [uncertain, setUncertain] = useState(false);
  // Aşama 4 P1: virman başına bir anahtar; belirsiz sonuçta alanlar kilitlenir ve AYNI anahtarla gönderilir.
  const keyRef = useRef<string | null>(null);
  const mayWrite = canManage(user, "billing");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const rows = await getCashAccounts(token);
      setAccounts(rows);
      setFromId((prev) => (rows.some((a) => a.id === prev) ? prev : rows[0]?.id || ""));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Hesaplar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const source = accounts.find((a) => a.id === fromId) || null;
  // Sunucu farklı para birimleri arasında virmanı kabul etmez; hedef listesi kaynağın para birimine göre süzülür (web ile aynı).
  const targets = useMemo(() => accounts.filter((a) => a.id !== fromId && cur(a) === cur(source)), [accounts, fromId, source]);
  const target = targets.find((a) => a.id === toId) || null;

  // Kaynak değişince hedef geçersiz kaldıysa ilk uygun hesap seçilir.
  useEffect(() => {
    if (!targets.some((a) => a.id === toId)) setToId(targets[0]?.id || "");
  }, [targets, toId]);

  const amount = parseAmount(amountText, true);
  const amountError = tried && (!amount || amount <= 0) ? "Geçerli bir tutar girin: en çok 2 ondalık, ör. 1.234,56." : undefined;

  const submit = async () => {
    setTried(true);
    if (!token || !source || !target || !amount || amount <= 0 || sending.current) return;
    const after = Number(source.balance || 0) - amount;
    const ok = await confirm({
      title: uncertain ? "Aynı virman yeniden gönderilsin mi?" : "Virman kaydedilsin mi?",
      message:
        (uncertain ? "Önceki gönderimin sonucu alınamadı. Aynı virman aynı anahtarla gönderilir; kaydedildiyse ikinci kez aktarılmaz.\n" : "") +
        `${source.name} hesabından ${target.name} hesabına ${formatMoney(amount, source.currency)} aktarılacak.\nTarih: ${formatDate(todayIso())}` +
        (after < 0 ? `\nDikkat: ${source.name} bakiyesi ${formatMoney(after, source.currency)} olacak.` : ""),
      confirmLabel: uncertain ? "Yeniden gönder" : "Virmanı kaydet",
    });
    if (!ok || sending.current) return;
    sending.current = true;
    setBusy(true);
    if (!uncertain || !keyRef.current) keyRef.current = newIdempotencyKey("trf");
    try {
      const r = await createTransfer(token, {
        from_account_id: source.id,
        to_account_id: target.id,
        amount,
        entry_date: todayIso(),
        description: description.trim(),
        reference: "",
      }, keyRef.current);
      toast(r?.replayed ? "Virman zaten kaydedilmişti." : "Virman kaydedildi", "success");
      router.back();
    } catch (e: any) {
      if (moneyRetryable(e)) {
        // İstek sunucuda işlenmiş olabilir: alanlar kilitlenir, yeniden gönderim aynı anahtarla yapılır.
        setUncertain(true);
        toast("Sonuç alınamadı. Aynı virmanı yeniden gönderebilirsiniz; ikinci kez aktarılmaz.", "error");
        load();
      } else if (e?.code === "MONEY_PARTIAL") {
        toast(e?.message || "İşlem yarım kaldı; yeniden göndermeden önce hesap hareketlerini kontrol edin.", "error");
        load();
      } else {
        keyRef.current = null;
        toast(e?.message || "Virman kaydedilemedi.", "error");
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const body = () => {
    if (!mayWrite)
      return <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Virman kaydı için fatura ve kasa yönetimi yetkisi gerekir." />;
    if (loading) return <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yükleniyor" description="Hesaplar getiriliyor." />;
    if (error)
      return <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={load} />;
    if (accounts.length < 2)
      return (
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="İkinci hesap gerekli"
          description="Virman için en az iki hesap olmalıdır. Önce yeni bir kasa ya da banka hesabı ekleyin."
        />
      );
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="emerald">
            <Text style={styles.heroLabel}>Aktarılacak tutar</Text>
            <Text testID="transfer-amount-preview" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(amount || 0, source?.currency)}
            </Text>
            <View style={styles.heroRoute}>
              <Text style={styles.heroRouteText} numberOfLines={1}>
                {source?.name || "Kaynak"}
              </Text>
              <ArrowRightIcon size={16} color={ON_HERO.live} />
              <Text style={[styles.heroRouteText, { textAlign: "right" }]} numberOfLines={1}>
                {target?.name || "Hedef seçin"}
              </Text>
            </View>
          </HeroCard>

          <SectionTitle title="Kaynak hesap" />
          <Card style={styles.block}>
            <View accessibilityRole="radiogroup">
              {accounts.map((a, i) => (
                <AccountOption key={a.id} testID={`transfer-from-${a.id}`} account={a} selected={a.id === fromId} divider={i > 0} onPress={() => !uncertain && setFromId(a.id)} />
              ))}
            </View>
          </Card>

          <SectionTitle title="Hedef hesap" />
          {targets.length === 0 ? (
            <Card padded style={styles.block}>
              <Text style={[type.body, { color: colors.amber }]}>Aynı para biriminde başka hesap yok. Farklı para birimleri arasında virman yapılamaz.</Text>
            </Card>
          ) : (
            <Card style={styles.block}>
              <View accessibilityRole="radiogroup">
                {targets.map((a, i) => (
                  <AccountOption key={a.id} testID={`transfer-to-${a.id}`} account={a} selected={a.id === toId} divider={i > 0} onPress={() => !uncertain && setToId(a.id)} />
                ))}
              </View>
            </Card>
          )}

          <View style={styles.fields}>
            <FormField
              testID="transfer-amount"
              label={`Tutar (${cur(source)})`}
              value={amountText}
              onChangeText={setAmountText}
              editable={!uncertain}
              placeholder="0,00"
              keyboardType="decimal-pad"
              suffix={cur(source)}
              error={amountError}
            />
            <FormField
              testID="transfer-description"
              label="Açıklama (isteğe bağlı)"
              value={description}
              onChangeText={setDescription}
              editable={!uncertain}
              placeholder="Örn. Kasadan bankaya yatırılan"
              maxLength={140}
              returnKeyType="done"
            />
            <Text style={[type.caption, { color: colors.textTertiary }]}>
              Virman bugünün tarihiyle kaydedilir; kaynak hesapta çıkış, hedef hesapta giriş hareketi oluşur.
            </Text>
            {uncertain ? (
              <Text testID="transfer-uncertain" style={[type.callout, { color: colors.amber }]}>
                Önceki gönderimin sonucu alınamadı. Virman kaydedilmiş olabilir; yeniden göndermeden önce hesap hareketlerini ve yukarıdaki bakiyeleri kontrol edin.
              </Text>
            ) : null}
            <Button testID="transfer-submit" label={uncertain ? "Virmanı yeniden gönder" : "Virmanı kaydet"} busy={busy} disabled={!target} onPress={submit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-transfer-screen">
      <StackHeader title="Virman" subtitle="Hesaplar arası aktarım" />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  fields: { marginHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.md },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, marginTop: 2 },
  heroRoute: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroRouteText: { flex: 1, color: ON_HERO.text, fontSize: 13, fontWeight: "600" },
});
