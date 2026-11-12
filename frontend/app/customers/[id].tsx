import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getCashAccounts } from "../../src/api";
import { collectPartyPaymentCompat, getLegacyPartyCurrency, getPartyLedgerCompat } from "../../src/api-gider";
import { isUncertainWrite } from "../../src/api-finans";
import { PAYMENT_METHODS, todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { DetailHero } from "../../src/ui/DetailHero";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { AlertIcon, DownloadIcon, InboxIcon, ReceiptIcon, WalletIcon } from "../../src/components/Icons";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import type { PartyLedgerRow } from "../../src/types";

// Cari adından en fazla iki harflik baş harf üretir (avatar için).
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toLocaleUpperCase("tr-TR");
}

export default function CustomerDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    balance?: string;
    registered?: string;
    currency?: string;
    origin?: string;
    source?: string;
    ledger?: string;
  }>();
  const id = String(params.id || "");
  // Liste okuma modelinden mi (/accounting/read-model/parties) yoksa eski /customers ucundan mı geldi; web CustomersPage.js ile aynı ayrım.
  const origin = params.origin === "read_model" ? "read_model" : "customers";
  const source = String(params.source || "");
  const viewLedger = params.ledger !== "0";
  // Okuma modelindeki eski cari para birimi taşımaz; eski uçtan okunur. Okunamazsa bilinmez sayılır (tahsilat kapalı).
  const [cur, setCur] = useState<string | null>(params.currency ? String(params.currency).toUpperCase().replace("TRL", "TRY") : null);
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, promptEntry } = useFeedback();
  const [rows, setRows] = useState<PartyLedgerRow[]>([]);
  const [balance, setBalance] = useState(Number(params.balance || 0));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Tahsilat yalnızca kayıtlı carilerde yapılabilir; siparişlerden türetilen carilerde uç 404 döner.
  const registered = params.registered === "1";
  const mayCollect = canManage(user, "customers") || canManage(user, "billing");
  // Sunucu tahsilatı para birimine bakmadan ilk kasa hesabına gelir yazar; dövizli caride tutar TL kasaya
  // döviz tutarıyla işlenirdi. Sunucu hesap seçimi sunana kadar dövizli caride mobilden tahsilat alınmaz.
  const foreign = cur !== "TRY";
  const curLabel = cur || "TRY";

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      if (origin === "read_model" && source === "legacy" && !params.currency) {
        const c = await getLegacyPartyCurrency(token, id);
        setCur(c ? c.replace("TRL", "TRY") : null);
      }
      if (!viewLedger) {
        setRows([]);
        setError(null);
        return;
      }
      const res = await getPartyLedgerCompat(token, { id, origin, source });
      setRows(res.rows);
      if (res.balance !== null) setBalance(res.balance);
      if (res.currency && origin === "read_model" && source === "obihub") setCur(res.currency.toUpperCase());
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Ekstre yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, id, origin, source, viewLedger, params.currency]);

  useEffect(() => {
    load();
  }, [load]);

  const onCollect = async () => {
    if (!token || foreign || !cur) return;
    // Fatura tahsilatındaki gibi tahsilatın yazılacağı kasa/banka hesabı seçilir; yalnız carinin para birimindeki hesaplar.
    let accounts: Awaited<ReturnType<typeof getCashAccounts>> = [];
    try {
      accounts = await getCashAccounts(token);
    } catch (e: any) {
      toast(e?.message || "Kasa/banka hesapları okunamadı.", "error");
      return;
    }
    const usable = accounts.filter((a) => String(a.currency || "TRY").toUpperCase().replace("TRL", "TRY") === cur);
    if (accounts.length > 0 && usable.length === 0) {
      toast(`${cur} para biriminde kasa/banka hesabı yok. Önce Kasa ve Bankalar'dan hesap ekleyin.`, "error");
      return;
    }
    const entry = await promptEntry({
      title: "Tahsilat al",
      message: String(params.name || ""),
      initial: Math.max(0, balance),
      decimal: true,
      noteLabel: "Not (isteğe bağlı)",
      methods: [...PAYMENT_METHODS],
      accounts: usable.map((a) => ({ value: a.id, label: a.name })),
      accountsLabel: usable.length > 0 ? "Hesap" : undefined,
    });
    if (!entry || entry.amount <= 0) return;
    const method = entry.method || "nakit";
    setBusy(true);
    try {
      await collectPartyPaymentCompat(token, id, {
        amount: entry.amount,
        payment_method: method,
        note: entry.note || undefined,
        payment_date: todayIso(),
        account_id: entry.account || null,
      });
      toast("Tahsilat kaydedildi", "success");
      await load();
    } catch (e: any) {
      // Bağlantı koptuysa ya da sunucu hatasıysa tahsilat işlenmiş olabilir; tekrar eklemeden önce ekstre kontrol edilmeli.
      toast(
        isUncertainWrite(e)
          ? "Tahsilat işlenmiş olabilir. Tekrar eklemeden önce ekstreyi yenileyip kontrol edin."
          : e?.message || "Tahsilat kaydedilemedi.",
        "error"
      );
      if (isUncertainWrite(e)) await load();
    } finally {
      setBusy(false);
    }
  };

  const name = String(params.name || "Cari");
  const balanceLabel = balance > 0 ? "Alacağınız" : balance < 0 ? "Borcunuz" : "Bakiye";

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="customer-detail">
      <StackHeader title={name} subtitle="Ekstre" />
      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <DetailHero
          tone={balance >= 0 ? "emerald" : "violet"}
          eyebrow="Ekstre"
          title={name}
          leading={
            <View style={styles.avatar}>
              <Text style={styles.avatarText} numberOfLines={1} adjustsFontSizeToFit>
                {initialsOf(name)}
              </Text>
            </View>
          }
        >
          <View style={styles.valueBlock}>
            <Text style={styles.valueLabel}>{balanceLabel}</Text>
            <Text testID="customer-balance" style={[styles.value, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(Math.abs(balance), curLabel)}
            </Text>
          </View>
        </DetailHero>

        {registered && mayCollect && cur && !foreign ? (
          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)} style={styles.action}>
            <Button
              testID="customer-collect"
              label="Tahsilat al"
              icon={<WalletIcon size={18} color="#FFFFFF" />}
              busy={busy}
              onPress={onCollect}
            />
          </SafeAnimatedView>
        ) : null}
        {registered && mayCollect && cur && foreign ? (
          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
            <View testID="customer-collect-foreign-notice" style={[styles.notice, { backgroundColor: colors.infoBg }]}>
              <AlertIcon size={18} color={colors.info} />
              <Text style={[type.footnote, styles.noticeText, { color: colors.textSecondary }]}>
                Bu cari {cur} para biriminde. Dövizli cari tahsilatı mobil uygulamadan alınamaz; lütfen web panelini kullanın.
              </Text>
            </View>
          </SafeAnimatedView>
        ) : null}
        {!registered && mayCollect && source === "orders" ? (
          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
            <View style={[styles.notice, { backgroundColor: colors.infoBg }]}>
              <AlertIcon size={18} color={colors.info} />
              <Text style={[type.footnote, styles.noticeText, { color: colors.textSecondary }]}>
                Bu cari siparişlerden oluşmuş. Tahsilat almak için web panelinde cari olarak kaydedin.
              </Text>
            </View>
          </SafeAnimatedView>
        ) : null}

        <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
          <SectionTitle title="Hareketler" />
          {loading ? (
            <Card style={styles.block}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.skeletonRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <Skeleton width={36} height={36} borderRadius={10} />
                  <View style={styles.skeletonText}>
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="35%" height={11} />
                  </View>
                  <Skeleton width={72} height={14} />
                </View>
              ))}
            </Card>
          ) : error ? (
            <Card padded style={[styles.block, styles.state]}>
              <IconTile tint={colors.errorBg}>
                <AlertIcon size={18} color={colors.error} />
              </IconTile>
              <Text style={[type.body, styles.stateText, { color: colors.error }]}>{error}</Text>
            </Card>
          ) : rows.length === 0 ? (
            <Card padded style={[styles.block, styles.state]}>
              <IconTile tint={colors.surfaceMuted}>
                <InboxIcon size={18} color={colors.textTertiary} />
              </IconTile>
              <Text style={[type.body, styles.stateText, { color: colors.textSecondary }]}>Henüz hareket yok.</Text>
            </Card>
          ) : (
            <Card style={styles.block}>
              {rows.map((r, i) => {
                const debit = Number(r.debit || 0);
                const credit = Number(r.credit || 0);
                const isCredit = credit > 0;
                return (
                  <ListRow
                    key={r.id || i}
                    divider={i > 0}
                    leading={
                      <IconTile tint={isCredit ? colors.successBg : colors.surfaceMuted}>
                        {isCredit ? <DownloadIcon size={18} color={colors.success} /> : <ReceiptIcon size={18} color={colors.textSecondary} />}
                      </IconTile>
                    }
                    title={r.description || r.reference || "Hareket"}
                    subtitle={formatDate(r.date)}
                    meta={r.balance != null ? `Bakiye ${formatMoney(r.balance, curLabel)}` : undefined}
                    trailing={
                      <Text style={[type.bodyStrong, tabular, { color: isCredit ? colors.success : colors.textPrimary }]}>
                        {isCredit ? `-${formatMoney(credit, curLabel)}` : `+${formatMoney(debit, curLabel)}`}
                      </Text>
                    }
                  />
                );
              })}
            </Card>
          )}
        </SafeAnimatedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  action: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint, paddingHorizontal: 6 },
  avatarText: { color: ON_HERO.text, fontSize: 17, fontWeight: "700" },
  valueBlock: { marginTop: spacing.md },
  valueLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  value: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  noticeText: { flex: 1, minWidth: 0 },
  state: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stateText: { flex: 1, minWidth: 0 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  skeletonText: { flex: 1, gap: 8 },
});
