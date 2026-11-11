import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { getCashAccounts } from "../../src/api";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { BagIcon, HomeIcon, ReceiptIcon, TagIcon, WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { CashAccount } from "../../src/types";

const ACCOUNT_TYPES: Record<string, string> = {
  cash: "Nakit kasa",
  bank: "Banka",
  pos: "POS",
  credit_card: "Kredi kartı",
  marketplace: "Pazaryeri",
  other: "Diğer",
};

const isTry = (a: CashAccount) => {
  const cur = String(a.currency || "TRY").toUpperCase();
  return cur === "TRY" || cur === "TRL";
};

// Hesap türüne göre simge: nakit ve banka yeşil, kart ve diğerleri mavi tonda.
function AccountTile({ accountType }: { accountType?: string }) {
  const { colors } = useTheme();
  const kind = String(accountType || "");
  const money = kind === "cash" || kind === "bank";
  const color = money ? colors.emerald : colors.info;
  const Icon = kind === "bank" ? HomeIcon : kind === "pos" ? ReceiptIcon : kind === "credit_card" ? TagIcon : kind === "marketplace" ? BagIcon : WalletIcon;
  return (
    <IconTile tint={money ? colors.emeraldSoft : colors.infoBg}>
      <Icon size={18} color={color} />
    </IconTile>
  );
}

// Yükleme sırasında içerikle aynı biçimde duran yer tutucu.
function LoadingSkeleton() {
  const { colors } = useTheme();
  const bar = (width: number | `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: radius.xs, backgroundColor: colors.border }} />
  );
  return (
    <View accessibilityLabel="Yükleniyor" style={{ paddingTop: spacing.xs }}>
      <View style={[styles.skeletonHero, { backgroundColor: colors.backgroundElevated, borderColor: colors.borderSubtle }]}>
        {bar(120, 12)}
        <View style={{ marginTop: spacing.sm }}>{bar("70%", 32)}</View>
        <View style={{ marginTop: spacing.lg }}>{bar("45%", 12)}</View>
      </View>
      <View style={[styles.skeletonList, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {[0, 1, 2].map((i) => (
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

export default function CashScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setAccounts(await getCashAccounts(token));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Hesaplar yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const tryAccounts = accounts.filter(isTry);
  const foreignCount = accounts.length - tryAccounts.length;
  const tryTotal = tryAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-screen">
      <StackHeader title="Kasa ve bankalar" subtitle={loading ? undefined : `${accounts.length} hesap`} />
      {loading ? (
        <LoadingSkeleton />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title={error ? "Yüklenemedi" : "Hesap yok"}
          description={error || "Kasa ve banka hesapları web panelinden eklenir."}
          actionLabel={error ? "Tekrar dene" : undefined}
          onAction={error ? load : undefined}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, paddingTop: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {tryAccounts.length > 0 ? (
            <SafeAnimatedView entering={FadeInDown.duration(380)}>
              <HeroCard tone="emerald">
                <View
                  accessible
                  accessibilityLabel={`Toplam TL bakiyesi: ${formatMoney(tryTotal, "TRY")}, ${tryAccounts.length} TL hesabı`}
                >
                  <Text style={styles.heroLabel}>Toplam bakiye (TL)</Text>
                  <Text testID="cash-total-balance" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoney(tryTotal, "TRY")}
                  </Text>
                  <View style={styles.heroFoot}>
                    <Text style={[styles.heroFootText, tabular]}>{tryAccounts.length} TL hesabı</Text>
                    {foreignCount > 0 ? <Text style={[styles.heroFootText, { flex: 1, textAlign: "right" }]} numberOfLines={2}>Dövizli hesaplar hariç</Text> : null}
                  </View>
                </View>
              </HeroCard>
            </SafeAnimatedView>
          ) : null}

          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
            <SectionTitle title="Hesaplar" />
            <Card style={styles.block}>
              {accounts.map((a, i) => (
                <ListRow
                  key={a.id}
                  testID={`cash-account-${a.id}`}
                  divider={i > 0}
                  leading={<AccountTile accountType={a.account_type} />}
                  title={a.name}
                  subtitle={[ACCOUNT_TYPES[String(a.account_type)] || a.account_type, a.bank_name].filter(Boolean).join(" · ")}
                  trailing={
                    <Text
                      style={[type.bodyStrong, tabular, styles.amount, { color: Number(a.balance) < 0 ? colors.error : colors.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatMoney(a.balance, a.currency)}
                    </Text>
                  }
                  chevron
                  onPress={() => router.push({ pathname: "/cash/[id]", params: { id: a.id } })}
                />
              ))}
            </Card>
            <Text style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
              Yeni hesap ve hesaplar arası virman web panelinden yapılır.
            </Text>
          </SafeAnimatedView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  amount: { maxWidth: 150, textAlign: "right" },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, marginTop: 2 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroFootText: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  skeletonHero: { marginHorizontal: spacing.lg, borderRadius: radius.xxl, borderWidth: 1, padding: spacing.lg },
  skeletonList: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingHorizontal: spacing.md },
  skeletonIcon: { width: 36, height: 36, borderRadius: 10 },
});
