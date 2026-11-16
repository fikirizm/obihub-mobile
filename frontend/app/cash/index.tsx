import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getAccountsList, getFxRates, type AccountsList } from "../../src/api-finans";
import { approxTryTotal, type Rates } from "../../src/fx";
import { accountSections, archivedNote, currencyTotals, tabCounts, type AccountStatus } from "../../src/kasa-ui";
import { mirrorBadge } from "../../src/mirror";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { BagIcon, HomeIcon, PlusIcon, ReceiptIcon, RefreshIcon, TagIcon, WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Button } from "../../src/ui/Button";
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
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const mayWrite = canManage(user, "billing");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [rates, setRates] = useState<Rates>(null);
  const [list, setList] = useState<AccountsList>({ items: [] });
  const accounts: CashAccount[] = list.items;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setList(await getAccountsList(token, status));
      getFxRates(token).then((r) => setRates(r?.rates || null)).catch(() => setRates(null));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Hesaplar yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, status]);

  // Yeni hesap ya da virman ekranından dönüldüğünde bakiyeler tazelenir.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // D-15: toplamlar para birimi başına (TRY büyük, diğerleri altta); arşiv sekmesinde toplam kartı yok.
  const totals = currencyTotals(list);
  const tryTotal = totals.find((x) => x.currency === "TRY")?.amount ?? 0;
  const foreign = totals.filter((x) => x.currency !== "TRY");
  // Dalga 3: güncel TCMB alış kuruyla YAKLAŞIK TL toplamı (bir dövizin kuru yoksa gösterilmez).
  const approx = approxTryTotal(totals, rates);
  const counts = tabCounts(list);
  const archNote = status === "active" ? archivedNote(list, formatMoney) : null;
  const sections = accountSections(list);
  const writable = accounts.filter((a) => a.read_only !== true && a.actions?.transfer !== false);
  const switchTab = (next: AccountStatus) => {
    if (next === status) return;
    setLoading(true);
    setStatus(next);
  };
  const tabs = (
    <ChipRow>
      <Chip testID="cash-tab-active" label={`Aktif${counts.active ? ` · ${counts.active}` : ""}`} selected={status === "active"} onPress={() => switchTab("active")} />
      <Chip testID="cash-tab-archived" label={`Arşiv${counts.archived ? ` · ${counts.archived}` : ""}`} selected={status === "archived"} onPress={() => switchTab("archived")} />
    </ChipRow>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cash-screen">
      <StackHeader title="Kasa ve bankalar" subtitle={loading ? undefined : `${accounts.length} hesap`} />
      {loading ? (
        <LoadingSkeleton />
      ) : accounts.length === 0 && status === "archived" ? (
        <View style={{ flex: 1 }}>
          {tabs}
          <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Arşivde hesap yok" description="Arşivlediğiniz hesaplar burada görünür; hareketleri korunur." />
        </View>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title={error ? "Yüklenemedi" : "Hesap yok"}
          description={error || (mayWrite ? "İlk kasa ya da banka hesabınızı ekleyin." : "Henüz kasa ya da banka hesabı eklenmemiş.")}
          actionLabel={error ? "Tekrar dene" : mayWrite ? "Yeni hesap ekle" : undefined}
          onAction={error ? load : mayWrite ? () => router.push("/cash/new") : undefined}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, paddingTop: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {counts.archived > 0 || status === "archived" ? tabs : null}
          {status === "active" && totals.length > 0 ? (
            <SafeAnimatedView entering={FadeInDown.duration(380)}>
              <HeroCard tone="emerald">
                <View
                  accessible
                  accessibilityLabel={`Net bakiye: ${totals.map((x) => formatMoney(x.amount, x.currency)).join(", ")}`}
                >
                  <Text style={styles.heroLabel}>Net bakiye (TL)</Text>
                  <Text testID="cash-total-balance" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoney(tryTotal, "TRY")}
                  </Text>
                  <View style={styles.heroFoot}>
                    <Text style={[styles.heroFootText, tabular]}>{`${accounts.length} hesap`}</Text>
                    {foreign.length > 0 ? (
                      <Text testID="cash-foreign-totals" style={[styles.heroFootText, tabular, { flex: 1, textAlign: "right" }]} numberOfLines={2}>
                        {foreign.map((x) => formatMoney(x.amount, x.currency)).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </HeroCard>
            </SafeAnimatedView>
          ) : null}

          {status === "active" && approx ? (
            <Text testID="cash-approx-try" style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
              {`Tümü yaklaşık ${formatMoney(approx.amount, "TRY")} (${approx.currencies.join(", ")} güncel kurla)`}
            </Text>
          ) : null}
          {archNote ? (
            <Text testID="cash-archived-note" style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>{archNote}</Text>
          ) : null}
          {mayWrite && status === "active" ? (
            <SafeAnimatedView entering={FadeInDown.delay(40).duration(380)} style={styles.actions}>
              <Button
                testID="cash-transfer"
                label="Virman"
                icon={<RefreshIcon size={16} color={ON_HERO.text} />}
                disabled={writable.length < 2}
                onPress={() => router.push("/cash/transfer")}
                style={{ flex: 1 }}
              />
              <Button
                testID="cash-new-account"
                label="Yeni hesap"
                variant="secondary"
                icon={<PlusIcon size={16} color={colors.textPrimary} />}
                onPress={() => router.push("/cash/new")}
                style={{ flex: 1 }}
              />
            </SafeAnimatedView>
          ) : null}

          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)}>
            {sections.map((sec) => (
            <View key={sec.key}>
            <SectionTitle title={sec.title} />
            <Card style={styles.block}>
              {sec.items.map((a, i) => (
                <ListRow
                  key={a.id}
                  testID={`cash-account-${a.id}`}
                  divider={i > 0}
                  leading={<AccountTile accountType={a.account_type} />}
                  title={a.name}
                  subtitle={[ACCOUNT_TYPES[String(a.account_type)] || a.account_type, a.bank_name, a.iban ? `IBAN …${String(a.iban).replace(/\s/g, "").slice(-4)}` : null, mirrorBadge(a) ? "Paraşüt" : null, a.archived ? "Arşivde" : null].filter(Boolean).join(" · ")}
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
            </View>
            ))}
            {mayWrite && status === "active" && writable.length < 2 ? (
              <Text style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
                Virman için en az iki hesap gerekir.
              </Text>
            ) : null}
          </SafeAnimatedView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
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
