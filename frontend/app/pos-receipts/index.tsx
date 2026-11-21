// Faz A (M2a): Satış Fişleri — GET /pos/receipts?page&per_page=25&q (fiş no ya da müşteri). Web: pages/POSReceiptsPage.jsx.
// Menüde orders.view|manage iznine görünür; "Yeni satış" yalnız orders.manage (canSell).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canSell } from "../../src/auth/permissions";
import { request } from "../../src/api";
import { hasNext, pageCount, readError, receiptRow, receiptsPath, receiptSummary, type ReceiptRow, type ReceiptSummary } from "../../src/pos-receipts";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { formatDate, formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, WalletIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { StackHeader } from "../../src/ui/Header";
import { RowCard } from "../../src/ui/RowCard";
import { SearchField } from "../../src/ui/SearchField";

export default function PosReceiptsScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [total, setTotal] = useState(0);
  // Geri bildirim 2: süzülmüş tüm kümenin özeti (iptal edilen fişler hariç); eski sunucu göndermezse gösterilmez.
  const [summary, setSummary] = useState<ReceiptSummary | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (p: number) => {
      if (!token) return;
      const my = ++seq.current;
      try {
        const r = await request<any>(receiptsPath(p, q), { method: "GET" }, token);
        if (my !== seq.current) return;
        const list = (Array.isArray(r?.items) ? r.items : []).map(receiptRow);
        setRows((prev) => (p > 1 && prev ? [...prev, ...list] : list));
        setTotal(Number(r?.total) || 0);
        if (p === 1) setSummary(receiptSummary(r?.summary));
        setPage(p);
        setError("");
        setForbidden(false);
      } catch (e: any) {
        if (my !== seq.current) return;
        setForbidden(Number(e?.status) === 403);
        setError(readError(e));
      } finally {
        if (my === seq.current) setRefreshing(false);
      }
    },
    [token, q]
  );
  useEffect(() => {
    setRows(null);
    const t = setTimeout(() => load(1), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  // Fiş silinip/faturalaşıp dönüldüğünde liste tazelenir.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      load(1);
    }, [load])
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="pos-receipts-screen">
      <StackHeader
        title="Satış Fişleri"
        subtitle={rows ? `${total} satış fişi` : "Mağaza satışları"}
        right={canSell(user) ? <Button testID="pos-receipts-new" size="sm" label="Yeni satış" onPress={() => router.push("/pos")} /> : undefined}
      />
      <SearchField value={q} onChangeText={setQ} placeholder="Fiş numarası veya müşteri ara" />
      {error ? (
        <EmptyState
          icon={<AlertIcon size={30} color={colors.error} />}
          title="Satış fişleri okunamadı"
          description={error}
          actionLabel={forbidden ? undefined : "Tekrar dene"}
          onAction={forbidden ? undefined : () => load(1)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.huge, gap: spacing.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load(1))} tintColor={colors.primary} />}
        >
          {rows && summary && (summary.count > 0 || summary.excludedCount > 0) ? (
            <HeroCard tone="blue" style={{ marginHorizontal: spacing.lg, marginBottom: spacing.xs }}>
              <View testID="pos-receipts-summary">
                <Text style={{ color: ON_HERO.soft, fontSize: 13, fontWeight: "600" }}>{q.trim() ? "Aramadaki satışlar" : "Toplam satış"}</Text>
                <Text style={[tabular, styles.heroValue]} numberOfLines={1} adjustsFontSizeToFit>{formatTry(summary.total)}</Text>
                <Text testID="pos-receipts-summary-note" style={{ color: ON_HERO.soft, fontSize: 12, marginTop: 2 }}>{summary.note}</Text>
                {summary.methods.length ? (
                  <View style={styles.heroFoot}>
                    {summary.methods.map((m) => (
                      <View key={m.key} style={styles.heroCell} testID={`pos-receipts-summary-${m.key}`}>
                        <Text style={styles.heroLabel}>{m.label}</Text>
                        <Text style={[tabular, styles.heroSub]} numberOfLines={1} adjustsFontSizeToFit>{formatTry(m.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {summary.uninvoicedCount > 0 ? (
                  <Text style={{ color: ON_HERO.soft, fontSize: 12, marginTop: spacing.sm }}>
                    {`Faturalanmamış: ${summary.uninvoicedCount} fiş · ${formatTry(summary.uninvoicedAmount)}`}
                  </Text>
                ) : null}
              </View>
            </HeroCard>
          ) : null}
          {rows && !rows.length ? (
            <EmptyState
              icon={<WalletIcon size={30} color={colors.textTertiary} />}
              title={q.trim() ? "Eşleşen fiş yok" : "Henüz satış fişi yok"}
              description={q.trim() ? "Fiş numarasını ya da müşteri adını kontrol edin." : "Hızlı satıştan tamamlanan mağaza satışları burada listelenir."}
            />
          ) : null}
          {(rows || []).map((r) => {
            const b = r.badges[0];
            return (
              <View key={r.id} style={styles.block} testID={`pos-receipt-${r.id}`}>
                <RowCard
                  onPress={() => router.push({ pathname: "/pos-receipts/[id]", params: { id: r.id } } as any)}
                  title={r.number}
                  subtitle={[r.customer, formatDate(r.createdAt), r.method].join(" · ")}
                  meta={`${r.itemCount} kalem · ${r.status}`}
                  amount={formatTry(r.total)}
                  badge={b ? <StatusBadge label={b.label} kind={b.tone === "neutral" ? "info" : b.tone} size="sm" /> : undefined}
                />
              </View>
            );
          })}
          {rows && hasNext(page, total) ? (
            <View style={styles.block}>
              <Button testID="pos-receipts-more" variant="secondary" size="sm" label={`Daha fazla (${page} / ${pageCount(total)})`} onPress={() => load(page + 1)} />
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  heroValue: { color: ON_HERO.text, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroFoot: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm, marginTop: spacing.md },
  heroCell: { width: "50%" },
  heroLabel: { color: ON_HERO.soft, fontSize: 12 },
  heroSub: { color: ON_HERO.text, fontSize: 16, fontWeight: "700", marginTop: 2 },
});
