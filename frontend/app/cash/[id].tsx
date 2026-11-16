import React, { useCallback, useEffect, useState } from "react";
import { isReadOnly, mirrorBadge } from "../../src/mirror";
import { InlineEmpty } from "../../src/components/InlineEmpty";
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { createCashEntry, getCashAccount, newIdempotencyKey, request } from "../../src/api";
import { archiveAccount, deleteAccount, getAccountMovements, moneyRetryable, unarchiveAccount, type MovementsPage } from "../../src/api-finans";
import { canUndo, movementLabel } from "../../src/kasa-ui";
import { accountActions, archiveError, DELETE_CONFIRM_TEXT, ARCHIVE_CONFIRM_TEXT, movementRow, movementTotals } from "../../src/kasa-ui";
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
  const [busy, setBusy] = useState<"income" | "expense" | "archive" | "unarchive" | "delete" | null>(null);
  // D-15: imleçli hareket listesi; eski sunucuda (404/405) tek seferlik hesap detayı.
  const [page, setPage] = useState<Omit<MovementsPage, "items"> | null>(null);
  const [undone, setUndone] = useState<CashEntry[]>([]);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      try {
        const res = await getAccountMovements(token, id);
        const detail = res.account ? null : await getCashAccount(token, id);
        setAccount(res.account || detail?.account || null);
        setEntries(res.items);
        setUndone(res.undone_items || []);
        setPage(res);
      } catch (e: any) {
        if (![404, 405].includes(Number(e?.status)) || e?.code === "ACCOUNT_NOT_FOUND") throw e;
        const res = await getCashAccount(token, id);
        setAccount(res.account);
        setEntries(res.entries);
        setPage(null);
      }
    } catch {
      // Yüklenemezse eldeki kayıt kalır.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, id]);

  const loadMore = async () => {
    if (!token || !page?.next_cursor || more) return;
    setMore(true);
    try {
      const res = await getAccountMovements(token, id, { cursor: page.next_cursor });
      setEntries((prev) => [...prev, ...res.items.filter((r) => !prev.some((p) => p.id === r.id))]);
      setPage({ ...res, totals: page.totals ?? res.totals });
    } catch (e: any) {
      toast(e?.message || "Hareketler yüklenemedi.", "error");
    } finally {
      setMore(false);
    }
  };

  // D-05 Geri al: elle hareket, virman (iki bacak) ve bakiye düzeltme — DELETE /finance/entries/{id}; diğerleri kaynağından.
  const undoMove = async (e: CashEntry) => {
    if (!token || busy) return;
    const ok = await confirm({
      title: "Hareket geri alınsın mı?",
      message: `${e.description || movementLabel(e as any) || "Hareket"} · ${formatMoney(e.amount, account?.currency)}\nTers kayıt yazılır; satır "Geri alınanlar"a geçer.${(e as any).entry_type?.startsWith("transfer") ? " Virmanın iki bacağı birlikte geri alınır." : ""}`,
      confirmLabel: "Geri al",
      destructive: true,
    });
    if (!ok) return;
    try {
      await request<any>(`/finance/entries/${encodeURIComponent(String(e.id))}`, { method: "DELETE" }, token);
      toast("Hareket geri alındı.", "success");
    } catch (err: any) {
      toast(err?.code === "ENTRY_LOCKED" ? "Bu hareket bir tahsilat ya da belgeden geliyor; kaynağından geri alın." : err?.message || "Geri alınamadı.", "error");
    } finally {
      load();
    }
  };

  const lifecycle = async (kind: "archive" | "unarchive" | "delete") => {
    if (!token || !account || busy) return;
    if (kind !== "unarchive") {
      const ok = await confirm(
        kind === "archive"
          ? { title: "Hesap arşivlensin mi?", message: ARCHIVE_CONFIRM_TEXT, confirmLabel: "Arşivle" }
          : { title: "Hesap silinsin mi?", message: DELETE_CONFIRM_TEXT, confirmLabel: "Sil", destructive: true }
      );
      if (!ok) return;
    }
    setBusy(kind);
    try {
      if (kind === "archive") {
        try {
          await archiveAccount(token, account.id);
        } catch (e: any) {
          const r = archiveError(e, formatMoney);
          if (!r.confirm) throw e;
          const again = await confirm({ title: "Bakiye sıfır değil", message: r.text, confirmLabel: "Yine de arşivle" });
          if (!again) return;
          await archiveAccount(token, account.id, true);
        }
        toast("Hesap arşivlendi.", "success");
      } else if (kind === "unarchive") {
        await unarchiveAccount(token, account.id);
        toast("Hesap arşivden çıkarıldı.", "success");
      } else {
        await deleteAccount(token, account.id);
        toast("Hesap silindi.", "success");
        router.back();
        return;
      }
      await load();
    } catch (e: any) {
      toast(archiveError(e, formatMoney).text, "error");
    } finally {
      setBusy(null);
    }
  };

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
            toast(archiveError(e, formatMoney).text || "Kaydedilemedi.", "error");
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
  const acts = account ? accountActions(account) : null;
  const totals = page ? movementTotals(page) : null;
  const total = typeof page?.total === "number" ? page.total : entries.length;
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
          {account.iban ? (
            <View style={[styles.block, styles.ibanRow]}>
              <Text testID="cash-iban" selectable style={[type.callout, { color: colors.textPrimary, flex: 1 }]}>{String(account.iban).replace(/(.{4})/g, "$1 ").trim()}</Text>
              <Button testID="cash-iban-share" size="sm" variant="secondary" label="IBAN'ı paylaş" onPress={() => Share.share({ message: String(account.iban) }).catch(() => {})} />
            </View>
          ) : null}
          {account.archived ? (
            <View testID="cash-archived-notice" style={[styles.mirrorNote, { backgroundColor: colors.warningBg }]}>
              <Text style={[type.footnote, { color: colors.textSecondary }]}>Bu hesap arşivde; yeni hareket yazılamaz. Hareketler ve bakiye korunur.</Text>
            </View>
          ) : null}
          {canManage(user, "billing") && !isReadOnly(account) && acts?.addMovement ? (
            <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)} style={styles.actions}>
              <Button testID="cash-add-income" label="Gelir ekle" busy={busy === "income"} disabled={Boolean(busy)} onPress={() => add("income")} style={{ flex: 1 }} />
              <Button testID="cash-add-expense" label="Gider ekle" variant="secondary" busy={busy === "expense"} disabled={Boolean(busy)} onPress={() => add("expense")} style={{ flex: 1 }} />
            </SafeAnimatedView>
          ) : null}
          {canManage(user, "billing") && !isReadOnly(account) && acts?.addMovement ? (
            <View style={[styles.block, { marginTop: spacing.xs }]}>
              <Button
                testID="cash-adjust"
                size="sm"
                variant="ghost"
                label="Bakiyeyi sabitle"
                onPress={() => router.push({ pathname: "/cash/adjust", params: { id: account.id, name: account.name, currency: account.currency || "TRY" } } as any)}
              />
            </View>
          ) : null}

          <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
            <SectionTitle
              title="Hareketler"
              action={total > 0 ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{total} kayıt</Text> : undefined}
            />
            {totals && totals.count > 0 ? (
              <Card style={[styles.block, styles.totals]}>
                <View style={styles.totalCol}>
                  <Text style={[type.caption, { color: colors.textTertiary }]}>Giriş</Text>
                  <Text testID="cash-total-in" style={[type.bodyStrong, tabular, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totals.in, cur)}</Text>
                </View>
                <View style={styles.totalCol}>
                  <Text style={[type.caption, { color: colors.textTertiary }]}>Çıkış</Text>
                  <Text testID="cash-total-out" style={[type.bodyStrong, tabular, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totals.out, cur)}</Text>
                </View>
                <View style={styles.totalCol}>
                  <Text style={[type.caption, { color: colors.textTertiary }]}>Net</Text>
                  <Text testID="cash-total-net" style={[type.bodyStrong, tabular, { color: totals.net < 0 ? colors.error : colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(totals.net, cur)}</Text>
                </View>
              </Card>
            ) : null}
            {totals?.beforeNote ? (
              <Text testID="cash-before-opening-note" style={[type.caption, styles.note, { color: colors.textTertiary }]}>{`${totals.beforeNote}${account.opening_balance_date ? ` Açılış tarihi: ${formatDate(account.opening_balance_date)}.` : ""}`}</Text>
            ) : null}
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
                  const row = movementRow(e);
                  const incoming = row.incoming;
                  return (
                    <ListRow
                      key={e.id}
                      testID={`cash-move-${i}`}
                      divider={i > 0}
                      onPress={canManage(user, "billing") && !isReadOnly(account) && canUndo(e as any) ? () => undoMove(e) : undefined}
                      leading={
                        <IconTile tint={incoming ? colors.successBg : colors.errorBg}>
                          {incoming ? <TrendUpIcon size={18} color={colors.success} /> : <TrendDownIcon size={18} color={colors.error} />}
                        </IconTile>
                      }
                      title={e.description || e.counterparty_name || e.category_name || e.source?.label || ENTRY_LABELS[e.entry_type] || "Hareket"}
                      subtitle={[movementLabel(e as any) === "Bakiye düzeltme" ? "Bakiye düzeltme" : row.typeLabel, e.related_account_name, e.counterparty_name && e.description ? e.counterparty_name : null, formatDate(e.entry_date)].filter(Boolean).join(" · ")}
                      meta={row.tag ? `${row.tag} · bakiyeyi etkilemez` : undefined}
                      trailing={
                        <View style={styles.amountCol}>
                          <Text style={[type.bodyStrong, tabular, styles.amount, { color: row.tag ? colors.textTertiary : incoming ? colors.success : colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                            {incoming ? "+" : "-"}
                            {formatMoney(e.amount, cur)}
                          </Text>
                          {row.balance != null && !row.tag ? (
                            <Text style={[type.caption, tabular, { color: colors.textTertiary }]} numberOfLines={1}>{`Bakiye ${formatMoney(row.balance, cur)}`}</Text>
                          ) : null}
                        </View>
                      }
                    />
                  );
                })}
              </Card>
            )}
            {page?.has_more && page.next_cursor ? (
              <View style={[styles.block, { marginTop: spacing.sm }]}>
                <Button testID="cash-more" variant="secondary" size="sm" label="Daha fazla hareket" busy={more} onPress={loadMore} />
              </View>
            ) : null}
            {undone.length > 0 ? (
              <>
                <SectionTitle title="Geri alınanlar" />
                <Card style={styles.block}>
                  {undone.map((e, i) => (
                    <ListRow
                      key={`u-${e.id}-${i}`}
                      testID={`cash-undone-${i}`}
                      divider={i > 0}
                      title={e.description || e.counterparty_name || ENTRY_LABELS[e.entry_type] || "Hareket"}
                      subtitle={[(e as any).undone_kind === "payment_voided" ? "Ödeme silindi" : "Geri alındı", formatDate(e.entry_date)].filter(Boolean).join(" · ")}
                      trailing={
                        <Text style={[type.callout, tabular, styles.amount, { color: colors.textTertiary, textDecorationLine: "line-through" }]} numberOfLines={1}>
                          {formatMoney(e.amount, cur)}
                        </Text>
                      }
                    />
                  ))}
                </Card>
                <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Geri alınan hareketler bakiyeye girmez.</Text>
              </>
            ) : null}
            {canManage(user, "billing") && acts && (acts.archive || acts.unarchive || acts.remove) ? (
              <View style={[styles.block, { marginTop: spacing.xl, gap: spacing.xs }]}>
                {acts.archive ? <Button testID="cash-archive" variant="secondary" label="Hesabı arşivle" busy={busy === "archive"} disabled={Boolean(busy)} onPress={() => lifecycle("archive")} /> : null}
                {acts.unarchive ? <Button testID="cash-unarchive" variant="secondary" label="Arşivden çıkar" busy={busy === "unarchive"} disabled={Boolean(busy)} onPress={() => lifecycle("unarchive")} /> : null}
                {acts.remove ? <Button testID="cash-delete" variant="ghost" label="Hesabı sil" busy={busy === "delete"} disabled={Boolean(busy)} onPress={() => lifecycle("delete")} /> : null}
              </View>
            ) : null}
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
  amountCol: { alignItems: "flex-end", gap: 2 },
  ibanRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  totals: { flexDirection: "row", padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  totalCol: { flex: 1, gap: 2 },
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
