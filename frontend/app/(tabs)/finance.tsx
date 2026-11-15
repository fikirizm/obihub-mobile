import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canAccess } from "../../src/auth/permissions";
import { getFinanceOverview } from "../../src/api";
import { getExpenseModuleEnabled, hasNonBizimhesapIncomingSource } from "../../src/api-gider";
import { todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney, formatTry } from "../../src/utils";
import { AlertIcon, ChartIcon, DownloadIcon, FileTextIcon, InboxIcon, ReceiptIcon, TagIcon, UserIcon, WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { useFocusLoad } from "../../src/hooks/useFocusLoad";
import { TabHeader } from "../../src/ui/Header";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { StatCard } from "../../src/ui/RowCard";
import { Skeleton } from "../../src/components/Skeleton";
import { InlineEmpty } from "../../src/components/InlineEmpty";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import type { FinanceOverview } from "../../src/types";

export default function FinanceScreen() {
  const { token, user, parasutConnected, accountingProvider } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const billing = canAccess(user, "billing");
  const customers = canAccess(user, "customers");
  // Web authz.js: /panel/finans fatura izni YA DA rapor görme izniyle açılır. Rapor izni yalnız okuma ekranlarını
  // (özet, kasa ve bankalar) açar; fatura/gider ekranları web'deki gibi fatura izni ister, yazma düğmeleri manage ister.
  const financeRead = billing || canAccess(user, "reports");
  // Web Sidebar.js: expense_module_enabled === false ise Gider Faturaları gizli (ayar okunamazsa görünür).
  const [expenseModuleOn, setExpenseModuleOn] = useState(true);
  // Web Sidebar.js: BizimHesap firmasında gelen faturalar yalnız BenimPOS/Turkcell bağlıysa görünür (bilinene dek gizli).
  const [altIncomingSource, setAltIncomingSource] = useState(false);
  const bizimhesap = accountingProvider === "bizimhesap";

  const load = useCallback(async () => {
    if (!token || !financeRead) return;
    if (billing) {
      getExpenseModuleEnabled(token).then(setExpenseModuleOn);
      if (bizimhesap) hasNonBizimhesapIncomingSource(token).then(setAltIncomingSource).catch(() => setAltIncomingSource(false));
    }
    try {
      setData(await getFinanceOverview(token));
      setFailed(false);
    } catch {
      // Özet alınamazsa bağlantılar yine kullanılabilir.
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [token, financeRead, billing, bizimhesap]);

  useFocusLoad(load, { hasData: Boolean(data), staleMs: 60 * 1000 });

  if (!financeRead && !customers) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="finance-screen">
        <TabHeader title="Finans" eyebrow="Nakit, alacak ve borç" />
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="Finans ekranlarına yetkiniz yok"
          description="Bu bölüm hesap sahibi ve muhasebe rolündeki kullanıcılara açıktır."
        />
      </View>
    );
  }

  const incomingVisible = !bizimhesap || altIncomingSource;
  const invoiceSource = parasutConnected ? "Paraşüt" : accountingProvider === "bizimhesap" ? "BizimHesap" : null;
  const upcoming = (data?.upcoming || []).slice(0, 5);
  // Sunucunun "bugün"ü UTC'dir; gece yarısından sonra geride kalabildiği için cihazın günü ilerideyse o kullanılır.
  const localToday = todayIso();
  const today = data?.today && data.today > localToday ? data.today : localToday;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="finance-screen">
      <TabHeader title="Finans" eyebrow="Nakit, alacak ve borç" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {financeRead && !data ? (
          failed ? (
            <Card style={[styles.block, { marginTop: spacing.xs }]}>
              <InlineEmpty
                icon={<AlertIcon size={22} color={colors.error} />}
                title="Finans özeti yüklenemedi"
                description="Bağlantınızı kontrol edip yeniden deneyin."
                actionLabel="Tekrar dene"
                onAction={() => load()}
              />
            </Card>
          ) : (
            <View accessible accessibilityRole="progressbar" accessibilityLabel="Finans özeti yükleniyor" style={{ gap: spacing.sm }}>
              <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.xs }}>
                <Skeleton height={168} borderRadius={28} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg }}>
                <Skeleton height={72} borderRadius={20} style={{ flex: 1 }} />
                <Skeleton height={72} borderRadius={20} style={{ flex: 1 }} />
              </View>
            </View>
          )
        ) : null}
        {financeRead && data ? (
          <>
            <HeroCard tone="emerald" style={{ marginTop: spacing.xs }}>
              <Text style={{ color: ON_HERO.soft, fontSize: 13, fontWeight: "600" }}>Kasa ve banka toplamı</Text>
              <Text
                testID="finance-cash-balance"
                style={[tabular, { color: ON_HERO.text, fontSize: 36, lineHeight: 42, fontWeight: "800", letterSpacing: -1, marginTop: 2 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatTry(data.cash_balance)}
              </Text>
              <View style={styles.heroFoot}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: ON_HERO.soft, fontSize: 12, fontWeight: "500" }}>Bu ay giren</Text>
                  <Text style={[tabular, { color: ON_HERO.live, fontSize: 16, fontWeight: "700", marginTop: 2 }]}>+{formatTry(data.month_cash_in)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: ON_HERO.soft, fontSize: 12, fontWeight: "500" }}>Bu ay çıkan</Text>
                  <Text style={[tabular, { color: ON_HERO.text, fontSize: 16, fontWeight: "700", marginTop: 2 }]}>-{formatTry(data.month_cash_out)}</Text>
                </View>
              </View>
            </HeroCard>
            <View style={styles.stats}>
              <StatCard label="Alacak" value={formatTry(data.receivable)} tone="success" />
              <StatCard label="Borç" value={formatTry(data.payable)} />
            </View>
            {data.overdue_receivable > 0 || data.overdue_payable > 0 ? (
              <View style={styles.stats}>
                <StatCard label="Vadesi geçen alacak" value={formatTry(data.overdue_receivable)} tone={data.overdue_receivable > 0 ? "error" : undefined} />
                <StatCard label="Vadesi geçen borç" value={formatTry(data.overdue_payable)} tone={data.overdue_payable > 0 ? "error" : undefined} />
              </View>
            ) : null}
            {data.multiCurrency ? (
              <Text style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg, marginTop: spacing.xs }]}>
                Alacak ve borç toplamları yalnızca TL tutarları gösterir; dövizli kayıtlar web panelinde ayrı listelenir.
              </Text>
            ) : null}
            {upcoming.length > 0 ? (
              <>
                <SectionTitle title="Yaklaşan vadeler" />
                <Card style={styles.block}>
                  {upcoming.map((u, i) => {
                    const overdue = Boolean(u.date && u.date.slice(0, 10) < today);
                    return (
                      <ListRow
                        key={`${u.reference || u.title}-${i}`}
                        divider={i > 0}
                        title={u.title || (u.kind === "receivable" ? "Alacak" : "Borç")}
                        subtitle={`${u.kind === "receivable" ? "Alacak" : "Borç"} · ${u.date ? formatDate(u.date) : "Vadesiz"}${overdue ? " · vadesi geçti" : ""}`}
                        trailing={
                          <Text style={[type.bodyStrong, tabular, { color: overdue ? colors.error : colors.textPrimary }]}>
                            {formatMoney(u.amount, u.currency)}
                          </Text>
                        }
                      />
                    );
                  })}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        <SectionTitle title="İşlemler" />
        <Card style={styles.block}>
          {billing ? (
            <ListRow
              testID="finance-local-invoices"
              leading={<IconTile tint={colors.primarySoft}><ReceiptIcon size={18} color={colors.primary} /></IconTile>}
              title="Satış faturaları"
              subtitle="ObiHub'da oluşturulan faturalar"
              chevron
              onPress={() => router.push("/local-invoices")}
            />
          ) : null}
          {billing && invoiceSource ? (
            <ListRow
              testID="finance-accounting-invoices"
              divider
              leading={<IconTile tint={colors.violetSoft}><FileTextIcon size={18} color={colors.violet} /></IconTile>}
              title={`${invoiceSource} faturaları`}
              subtitle="Muhasebe programındaki satış faturaları"
              chevron
              onPress={() => router.push("/invoices")}
            />
          ) : null}
          {billing ? (
            <ListRow
              testID="finance-offers"
              divider
              leading={<IconTile tint={colors.amberSoft}><TagIcon size={18} color={colors.amber} /></IconTile>}
              title="Teklifler"
              subtitle="Teklif hazırla, faturaya çevir"
              chevron
              onPress={() => router.push("/offers")}
            />
          ) : null}
          {customers ? (
            <ListRow
              testID="finance-customers"
              divider={billing}
              leading={<IconTile tint={colors.emeraldSoft}><UserIcon size={18} color={colors.emerald} /></IconTile>}
              title="Cari hesaplar"
              subtitle="Bakiye, ekstre ve tahsilat"
              chevron
              onPress={() => router.push("/customers")}
            />
          ) : null}
          {financeRead ? (
            <ListRow
              testID="finance-cash"
              divider={billing || customers}
              leading={<IconTile tint={colors.infoBg}><WalletIcon size={18} color={colors.info} /></IconTile>}
              title="Kasa ve bankalar"
              subtitle="Hesap bakiyeleri ve hareketler"
              chevron
              onPress={() => router.push("/cash")}
            />
          ) : null}
          {financeRead ? (
            <ListRow
              testID="finance-income-expense"
              divider
              leading={<IconTile tint={colors.successBg}><ChartIcon size={18} color={colors.success} /></IconTile>}
              title="Gelir-gider özeti"
              subtitle="Dönem sonucu, kaynaklar ve gider kategorileri"
              chevron
              onPress={() => router.push("/income-expense")}
            />
          ) : null}
        </Card>

        {billing && (incomingVisible || expenseModuleOn) ? (
          <>
            <SectionTitle title="Giderler" />
            <Card style={styles.block}>
              {incomingVisible ? (
                <ListRow
                  testID="finance-incoming"
                  leading={<IconTile tint={colors.amberSoft}><InboxIcon size={18} color={colors.amber} /></IconTile>}
                  title="Gelen e-faturalar"
                  subtitle="Tedarikçilerden gelen faturalar"
                  chevron
                  onPress={() => router.push("/incoming")}
                />
              ) : null}
              {expenseModuleOn ? (
                <ListRow
                  testID="finance-expenses"
                  divider={incomingVisible}
                  leading={<IconTile tint={colors.errorBg}><DownloadIcon size={18} color={colors.error} /></IconTile>}
                  title="Gider faturaları"
                  subtitle="Alış ve gider kayıtları, açık borçlar"
                  chevron
                  onPress={() => router.push("/expenses")}
                />
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  stats: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  heroFoot: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
});
