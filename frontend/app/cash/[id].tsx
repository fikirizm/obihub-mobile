import React, { useCallback, useEffect, useState } from "react";
import { isReadOnly, mirrorBadge } from "../../src/mirror";
import { InlineEmpty } from "../../src/components/InlineEmpty";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { createCashEntry, getCashAccount, newIdempotencyKey } from "../../src/api";
import { moneyRetryable } from "../../src/api-finans";
import { todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { InboxIcon, TrendDownIcon, TrendUpIcon, WalletIcon } from "../../src/components/Icons";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Button } from "../../src/ui/Button";
import { DetailHero } from "../../src/ui/DetailHero";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount, CashEntry } from "../../src/types";

const ENTRY_LABELS: Record<string, string> = { income: "Gelir", expense: "Gider", transfer_in: "Gelen virman", transfer_out: "Giden virman" };

const ACCOUNT_TYPES: Record<string, string> = {
  cash: "Nakit kasa",
  bank: "Banka",
  pos: "POS",
  credit_card: "Kredi kartı",
  marketplace: "Pazaryeri",
  other: "Diğer",
};

// Yükleme sırasında içerikle aynı biçimde duran yer tutucu.
function LoadingSkeleton() {
  const { colors } = useTheme();
  const bar = (width: number | `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: radius.xs, backgroundColor: colors.border }} />
  );
  return (
    <View accessibilityLabel="Yükleniyor" style={{ paddingTop: spacing.xs }}>
      <View style={[styles.skeletonHero, { backgroundColor: colors.backgroundElevated, borderColor: colors.borderSubtle }]}>
        <View style={styles.skeletonHead}>
          <View style={[styles.skeletonTile, { backgroundColor: colors.border }]} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            {bar("60%", 14)}
            {bar("40%", 12)}
          </View>
        </View>
        <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
          {bar(60, 12)}
          {bar("70%", 30)}
        </View>
      </View>
      <View style={[styles.skeletonList, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.skeletonRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <View style={[styles.skeletonIcon, { backgroundColor: colors.backgroundElevated }]} />
            <View style={{ flex: 1, gap: 6 }}>
              {bar("55%", 12)}
              {bar("35%", 10)}
            </View>
            {bar(64, 12)}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function CashAccountScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, promptEntry, confirm } = useFeedback();
  const [account, setAccount] = useState<CashAccount | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"income" | "expense" | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const res = await getCashAccount(token, id);
      setAccount(res.account);
      setEntries(res.entries);
    } catch {
      // Yüklenemezse eldeki kayıt kalır.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (kind: "income" | "expense") => {
    if (!token || !account) return;
    const entry = await promptEntry({ title: kind === "income" ? "Gelir ekle" : "Gider ekle", message: account.name, initial: 0, decimal: true, noteLabel: "Açıklama" });
    if (!entry || entry.amount <= 0) return;
    setBusy(kind);
    // Aşama 4 P1: işlem başına bir anahtar; sonuç belirsizse AYNI anahtar ve gövdeyle yeniden gönderilir (ikinci kayıt açılmaz).
    const key = newIdempotencyKey("cash");
    const body = { account_id: account.id, entry_type: kind, amount: entry.amount, entry_date: todayIso(), description: entry.note || undefined };
    try {
      for (;;) {
        try {
          const r = await createCashEntry(token, body, key);
          toast(r?.replayed ? "Hareket zaten kaydedilmişti." : kind === "income" ? "Gelir kaydedildi" : "Gider kaydedildi", "success");
          break;
        } catch (e: any) {
          if (!moneyRetryable(e)) {
            toast(e?.message || "Kaydedilemedi.", "error");
            break;
          }
          const again = await confirm({
            title: "Sonuç alınamadı",
            message: `${formatMoney(entry.amount, account.currency)} ${kind === "income" ? "gelir" : "gider"} kaydedilmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez kaydedilmez.`,
            confirmLabel: "Yeniden gönder",
          });
          if (!again) break;
        }
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const cur = account?.currency;
  const negative = Number(account?.balance) < 0;
  const typeLabel = account ? ACCOUNT_TYPES[String(account.account_type)] || account.account_type : undefined;
  const heroSubtitle = account ? [[typeLabel, account.bank_name].filter(Boolean).join(" · "), account.iban].filter(Boolean).join("\n") : "";

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-account-screen">
      <StackHeader title={account?.name || "Hesap"} subtitle="Hareketler" />
      {loading ? (
        <LoadingSkeleton />
      ) : !account ? (
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="Hesap bulunamadı"
          description="Hesap silinmiş olabilir ya da bağlantı kurulamadı. Listeye dönüp yeniden deneyebilirsiniz."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, paddingTop: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <DetailHero
            tone="emerald"
            leading={
              <View style={styles.heroTile}>
                <WalletIcon size={22} color={ON_HERO.text} />
              </View>
            }
            title={account.name}
            subtitle={heroSubtitle || undefined}
            badge={
              account.is_default || mirrorBadge(account) ? (
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>{mirrorBadge(account) ? "Paraşüt" : "Varsayılan"}</Text>
                </View>
              ) : undefined
            }
          >
            <View style={styles.balanceBlock}>
              <View style={styles.balanceLabelRow}>
                <Text style={styles.balanceLabel}>Bakiye</Text>
                {negative ? (
                  <View style={[styles.negativePill, { backgroundColor: colors.errorBg }]}>
                    <Text style={[type.caption, { color: colors.error }]}>Eksi bakiye</Text>
                  </View>
                ) : null}
              </View>
              <Text testID="cash-balance" style={[styles.balance, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(account.balance, cur)}
              </Text>
            </View>
          </DetailHero>

          {isReadOnly(account) ? (
            <View testID="cash-mirror-notice" style={[styles.mirrorNote, { backgroundColor: colors.infoBg }]}>
              <Text style={[type.footnote, { color: colors.textSecondary }]}>Bu hesap Paraşüt'ten geliyor; hareketleri Paraşüt'te girin.</Text>
            </View>
          ) : null}
          {canManage(user, "billing") && !isReadOnly(account) && (account as any)?.actions?.add_movement !== false ? (
            <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)} style={styles.actions}>
              <Button testID="cash-add-income" label="Gelir ekle" busy={busy === "income"} disabled={Boolean(busy)} onPress={() => add("income")} style={{ flex: 1 }} />
              <Button testID="cash-add-expense" label="Gider ekle" variant="secondary" busy={busy === "expense"} disabled={Boolean(busy)} onPress={() => add("expense")} style={{ flex: 1 }} />
            </SafeAnimatedView>
          ) : null}

          <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
            <SectionTitle
              title="Hareketler"
              action={entries.length > 0 ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{entries.length} kayıt</Text> : undefined}
            />
            {entries.length === 0 ? (
              <Card style={styles.block}>
                <InlineEmpty
                  icon={<InboxIcon size={22} color={colors.primary} />}
                  title="Henüz hareket yok"
                  description="Gelir, gider ve virmanlar bu hesaba işlendikçe burada görünür."
                />
              </Card>
            ) : (
              <Card style={styles.block}>
                {entries.map((e, i) => {
                  const incoming = e.entry_type === "income" || e.entry_type === "transfer_in";
                  return (
                    <ListRow
                      key={e.id}
                      divider={i > 0}
                      leading={
                        <IconTile tint={incoming ? colors.successBg : colors.errorBg}>
                          {incoming ? <TrendUpIcon size={18} color={colors.success} /> : <TrendDownIcon size={18} color={colors.error} />}
                        </IconTile>
                      }
                      title={e.description || e.counterparty_name || e.category || ENTRY_LABELS[e.entry_type] || "Hareket"}
                      subtitle={[ENTRY_LABELS[e.entry_type], e.related_account_name, formatDate(e.entry_date)].filter(Boolean).join(" · ")}
                      trailing={
                        <Text style={[type.bodyStrong, tabular, styles.amount, { color: incoming ? colors.success : colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                          {incoming ? "+" : "-"}
                          {formatMoney(e.amount, cur)}
                        </Text>
                      }
                    />
                  );
                })}
              </Card>
            )}
          </SafeAnimatedView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mirrorNote: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginHorizontal: spacing.lg },
  empty: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amount: { maxWidth: 150, textAlign: "right" },
  heroTile: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  heroPill: { paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: ON_HERO.faint },
  heroPillText: { color: ON_HERO.text, fontSize: 12, fontWeight: "600" },
  balanceBlock: { marginTop: spacing.md },
  balanceLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  balanceLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  negativePill: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.pill },
  balance: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, marginTop: 2 },
  skeletonHero: { marginHorizontal: spacing.lg, borderRadius: radius.xxl, borderWidth: 1, padding: spacing.lg },
  skeletonHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skeletonTile: { width: 44, height: 44, borderRadius: radius.md },
  skeletonList: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingHorizontal: spacing.md },
  skeletonIcon: { width: 36, height: 36, borderRadius: 10 },
});
