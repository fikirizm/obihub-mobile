// Dalga 3 / C2 — gider faturası detayı. Web: components/expenses/ExpenseInvoiceDetail.jsx.
// GET /accounting/expense-invoices/{id}: kalemler, KDV / tevkifat / diğer vergiler, kategori, borç ve kalan.
// "Ödeme ekle" yalnız modül açık + ui-capabilities.payable_payment + actions.can_pay + geri alınmamış borçta.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import {
  EXPENSE_PAY,
  EXPENSE_SOURCE,
  getExpenseDetail,
  getExpenseModuleEnabled,
  getUiCapabilities,
  type ExpenseDetail,
} from "../../src/api-gider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import {
  AlertIcon,
  DownloadIcon,
  ReceiptIcon,
  WalletIcon,
} from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import {
  FadeInDown,
  SafeAnimatedView,
} from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { DeleteGuardSheet } from "../../src/components/DeleteGuardSheet";
import { doneText, type GuardAction } from "../../src/delete-guard";
import { runExpenseLifecycle } from "../../src/api-gider";
import { DetailHero, type HeroStat } from "../../src/ui/DetailHero";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

function shortDate(iso: string) {
  const t = Date.parse(String(iso).slice(0, 10) + "T12:00:00Z");
  return Number.isNaN(t)
    ? iso
    : new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "short",
      }).format(new Date(t));
}

function DetailSkeleton() {
  const { colors } = useTheme();
  return (
    <View
      style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
      accessibilityLabel="Gider faturası yükleniyor"
    >
      <View
        style={[
          styles.skHero,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
          },
        ]}
      >
        <Skeleton width="55%" height={16} />
        <Skeleton width="35%" height={12} />
        <Skeleton width="50%" height={30} style={{ marginTop: spacing.sm }} />
        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            marginTop: spacing.sm,
          }}
        >
          <Skeleton width="30%" height={36} />
          <Skeleton width="30%" height={36} />
          <Skeleton width="30%" height={36} />
        </View>
      </View>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={52} borderRadius={radius.md} />
      ))}
    </View>
  );
}

export default function ExpenseDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [d, setD] = useState<ExpenseDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Ödeme kapısı (web ExpenseInvoicesPage canPay): modül açık ve sunucu yeteneği payable_payment.
  const [payCap, setPayCap] = useState(false);
  // 16 Kas: silme / arşivleme (Paraşüt gibi; engelleri sunucu söyler).
  const { toast } = useFeedback();
  const [life, setLife] = useState<GuardAction | null>(null);
  const [unarchiving, setUnarchiving] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const [detail, caps, moduleOn] = await Promise.all([
        getExpenseDetail(token, id),
        getUiCapabilities(token).catch(() => null),
        getExpenseModuleEnabled(token).catch(() => true),
      ]);
      setD(detail);
      setPayCap(Boolean(caps?.payablePayment) && moduleOn !== false);
      setState("ready");
    } catch (e: any) {
      setMessage(
        e?.status === 404
          ? "Gider faturası bulunamadı."
          : e?.message || "Fatura ayrıntısı şu anda okunamadı.",
      );
      setState((s) => (s === "ready" ? "ready" : "error"));
    } finally {
      setRefreshing(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);
  // Ödeme ekranından dönüldüğünde kalan borç yeniden okunur.
  const seenFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // İlk odak ilk yüklemeyle aynı anda gelir; sonraki odaklarda (ödeme ekranından dönüş) yeniden okunur.
      if (seenFocus.current) load();
      seenFocus.current = true;
    }, [load]),
  );

  if (state === "loading") {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Gider faturası" />
        <DetailSkeleton />
      </View>
    );
  }
  if (state === "error" || !d) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Gider faturası" />
        <EmptyState
          icon={<AlertIcon size={30} color={colors.error} />}
          title="Ayrıntı açılamadı"
          description={message}
          actionLabel="Tekrar dene"
          onAction={() => {
            setState("loading");
            load();
          }}
        />
      </View>
    );
  }

  const cur = d.currency || "TRY";
  const st =
    EXPENSE_PAY[
      d.reversed ? "reversed" : d.payable?.payment_status || "unknown"
    ] || EXPENSE_PAY.unknown;
  const canPay =
    payCap &&
    d.canPay &&
    Boolean(d.payable?.ref) &&
    !d.reversed &&
    canManage(user, "billing");
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, cur));
  const stats: HeroStat[] = [
    {
      label: "Ödenen",
      value: d.payable ? money(d.payable.paid) : "—",
      tone: d.payable?.paid ? "good" : undefined,
    },
    {
      label: "Kalan",
      value: d.payable ? money(d.payable.remaining) : "—",
      tone:
        d.payable &&
        (d.payable.remaining || 0) > 0 &&
        d.payable.payment_status === "overdue"
          ? "bad"
          : undefined,
    },
    // Hücre dar: yalnız gün ve ay ("24 Kas"); tam vade tarihi Bilgiler bölümünde.
    { label: "Vade", value: d.due_date ? shortDate(d.due_date) : "—" },
  ];
  const totals: [string, string][] = [
    ["Matrah", money(d.totals.taxable)],
    ["KDV", money(d.totals.vat)],
    ...(d.totals.withholding && d.totals.withholding > 0
      ? ([["KDV tevkifatı", money(d.totals.withholding)]] as [string, string][])
      : []),
    ...(d.totals.other_levies && d.totals.other_levies > 0
      ? ([["Diğer vergiler (gidere dahil)", money(d.totals.other_levies)]] as [
          string,
          string,
        ][])
      : []),
    ["Genel toplam (borç)", money(d.totals.payable)],
  ];

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.background }]}
      testID="expense-detail"
    >
      <StackHeader
        title="Gider faturası"
        subtitle={d.document_number || undefined}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <DetailHero
          tone="violet"
          leading={
            <View style={styles.heroIcon}>
              <DownloadIcon size={20} color={ON_HERO.text} />
            </View>
          }
          eyebrow="Tedarikçi"
          title={d.supplier.name || "Tedarikçi"}
          subtitle={
            [d.document_number, d.issue_date ? formatDate(d.issue_date) : null]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
          value={money(d.totals.payable)}
          valueLabel="Genel toplam"
          stats={stats}
        />

        {d.reversed ? (
          <View
            style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}
          >
            <AlertIcon size={16} color={colors.textSecondary} />
            <Text
              style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}
            >
              Bu kayıt geri alındı; borç artık geçerli değil.
            </Text>
          </View>
        ) : null}

        {d.archived ? (
          <View testID="expense-archived-note" style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}>
            <AlertIcon size={16} color={colors.textSecondary} />
            <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>Bu fatura arşivde; listede varsayılan olarak gizlenir.</Text>
          </View>
        ) : null}

        {canPay ? (
          <SafeAnimatedView
            entering={FadeInDown.delay(60).duration(380)}
            style={styles.payWrap}
          >
            <Button
              testID="expense-pay-btn"
              label="Ödeme ekle"
              icon={<WalletIcon size={18} color="#FFFFFF" />}
              onPress={() =>
                router.push({
                  pathname: "/expenses/pay",
                  params: {
                    ref: d.payable!.ref,
                    title: [d.supplier.name, d.document_number]
                      .filter(Boolean)
                      .join(" · "),
                  },
                })
              }
            />
          </SafeAnimatedView>
        ) : null}

        <SafeAnimatedView entering={FadeInDown.delay(100).duration(380)}>
          <SectionTitle title="Bilgiler" />
          <Card style={styles.block}>
            <ListRow
              title="Tedarikçi VKN"
              trailing={
                <Text
                  style={[type.callout, tabular, { color: colors.textPrimary }]}
                >
                  {d.supplier.tax_id || "—"}
                </Text>
              }
            />
            <ListRow
              divider
              title="Fatura tarihi"
              trailing={
                <Text style={[type.callout, { color: colors.textPrimary }]}>
                  {d.issue_date ? formatDate(d.issue_date) : "—"}
                </Text>
              }
            />
            <ListRow
              divider
              title="Vade"
              trailing={
                <Text style={[type.callout, { color: colors.textPrimary }]}>
                  {d.due_date ? formatDate(d.due_date) : "—"}
                </Text>
              }
            />
            <ListRow
              divider
              title="Kategori"
              trailing={
                <Text style={[type.callout, { color: colors.textPrimary }]}>
                  {d.categoryName || "—"}
                </Text>
              }
            />
            {d.sourceKind ? (
              <ListRow
                divider
                title="Kaynak"
                trailing={
                  <Text style={[type.callout, { color: colors.textPrimary }]}>
                    {EXPENSE_SOURCE[d.sourceKind] || d.sourceKind}
                  </Text>
                }
              />
            ) : null}
          </Card>
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(150).duration(380)}>
          <SectionTitle title="Kalemler" />
          <Card style={styles.block}>
            {d.lines.length === 0 ? (
              <View style={styles.emptyRow}>
                <ReceiptIcon size={18} color={colors.textTertiary} />
                <Text style={[type.footnote, { color: colors.textSecondary }]}>
                  Bu kayıtta kalem bilgisi yok.
                </Text>
              </View>
            ) : (
              d.lines.map((l, i) => (
                <View
                  key={i}
                  style={[
                    styles.line,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                  testID={`expense-line-${i}`}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[type.bodyStrong, { color: colors.textPrimary }]}
                      numberOfLines={2}
                    >
                      {l.description || "Kalem"}
                    </Text>
                    <Text
                      style={[
                        type.caption,
                        tabular,
                        { color: colors.textTertiary, marginTop: 2 },
                      ]}
                      numberOfLines={1}
                    >
                      {[
                        l.quantity !== null
                          ? `${l.quantity.toLocaleString("tr-TR")} × ${money(l.unit_price)}`
                          : null,
                        l.vat_rate !== null ? `KDV %${l.vat_rate}` : null,
                        l.discount && l.discount > 0
                          ? `İskonto ${money(l.discount)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Text
                    style={[
                      type.callout,
                      tabular,
                      { color: colors.textPrimary, fontWeight: "700" },
                    ]}
                  >
                    {money(l.total)}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(200).duration(380)}>
          <SectionTitle title="Toplamlar" />
          <Card style={styles.block}>
            {totals.map(([k, v], i) => {
              const last = i === totals.length - 1;
              return (
                <View
                  key={k}
                  style={[
                    styles.totalRow,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                    last && { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <Text
                    style={[
                      last ? type.bodyStrong : type.callout,
                      {
                        color: last ? colors.textPrimary : colors.textSecondary,
                        flex: 1,
                      },
                    ]}
                  >
                    {k}
                  </Text>
                  <Text
                    style={[
                      last ? type.title : type.callout,
                      tabular,
                      {
                        color: colors.textPrimary,
                        fontWeight: last ? "800" : "600",
                      },
                    ]}
                  >
                    {v}
                  </Text>
                </View>
              );
            })}
          </Card>
        </SafeAnimatedView>
        {canManage(user, "billing") ? (
          <View style={styles.lifeWrap}>
            {d.archived ? (
              <Button
                testID="expense-unarchive-btn"
                variant="secondary"
                label="Arşivden çıkar"
                busy={unarchiving}
                onPress={async () => {
                  if (!token || unarchiving) return;
                  setUnarchiving(true);
                  try {
                    await runExpenseLifecycle(token, d.id, "unarchive");
                    toast("Fatura arşivden çıkarıldı.", "success");
                    load();
                  } catch (e: any) {
                    toast(e?.message && !/^Sunucu hatası/.test(e.message) ? e.message : "Fatura arşivden çıkarılamadı.", "error");
                  } finally {
                    setUnarchiving(false);
                  }
                }}
              />
            ) : (
              <Button testID="expense-archive-btn" variant="secondary" label="Faturayı arşivle" onPress={() => setLife("archive")} />
            )}
            <Button testID="expense-delete-btn" variant="destructive" label="Faturayı sil" onPress={() => setLife("delete")} />
          </View>
        ) : null}
      </ScrollView>
      {token ? (
        <DeleteGuardSheet
          token={token}
          id={d.id}
          action={life}
          payableRef={d.payable?.ref}
          onClose={() => setLife(null)}
          onDone={(a) => {
            setLife(null);
            toast(doneText(a), "success");
            if (router.canGoBack()) router.back();
            else router.replace("/expenses");
          }}
          onReason={(t) => {
            setLife(null);
            router.push({ pathname: t.pathname, params: t.pathname === "/expenses/pay" ? { ...t.params, title: [d.supplier.name, d.document_number].filter(Boolean).join(" · ") } : t.params } as any);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ON_HERO.faint,
  },
  skHero: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  payWrap: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  lifeWrap: { marginHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.xs },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
});
