import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { addLocalInvoicePayment, checkLocalInvoiceEdocStatus, getCashAccounts, getLocalInvoice, officializeLocalInvoice } from "../../src/api";
import { deleteLocalInvoice, isInvoiceEditable, isUncertainWrite } from "../../src/api-finans";
import { invoiceStatus, isInvoiceOverdue, PAYMENT_METHODS, todayIso } from "../../src/finance";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { AlertIcon, ClockIcon, PackageIcon, ReceiptIcon, WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { DetailHero, type HeroStat } from "../../src/ui/DetailHero";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import type { LocalInvoice } from "../../src/types";

// Sunucu kalem tutarını `line_total` adıyla döndürür.
function lineTotal(l: { total?: number; line_total?: number }) {
  return l.line_total ?? l.total;
}

// Müşteri adının baş harfleri (hero'daki avatar için).
function initials(name?: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  const first = parts[0].charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + second).toLocaleUpperCase("tr-TR");
}

// Yüklenirken içerikle aynı biçimde yer tutucu: özet kartı, işlem düğmesi ve tutar satırları.
function DetailSkeleton() {
  const { colors, shadows } = useTheme();
  return (
    <View style={styles.skeleton} accessible accessibilityLabel="Fatura yükleniyor">
      <View style={[styles.skeletonHero, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        <View style={styles.skeletonHead}>
          <Skeleton width={44} height={44} borderRadius={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="45%" height={12} />
          </View>
          <Skeleton width={68} height={24} borderRadius={12} />
        </View>
        <Skeleton width="55%" height={34} borderRadius={10} />
        <View style={styles.skeletonStats}>
          <Skeleton width="28%" height={30} />
          <Skeleton width="28%" height={30} />
          <Skeleton width="28%" height={30} />
        </View>
      </View>
      <Skeleton height={50} borderRadius={radius.md} />
      <View style={[styles.skeletonCard, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton width="35%" height={14} />
            <Skeleton width={84} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function LocalInvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || "");
  const { token, user, parasutConnected } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm, promptEntry } = useFeedback();
  const [inv, setInv] = useState<LocalInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"official" | "payment" | "edoc" | "delete" | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setInv(await getLocalInvoice(token, id));
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
  // Düzenleme ekranından dönüldüğünde fatura yeniden okunur.
  const focusedOnce = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) load();
      focusedOnce.current = true;
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <DetailSkeleton />
      </View>
    );
  }
  if (!inv) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Fatura" />
        <EmptyState
          icon={<ReceiptIcon size={30} color={colors.emerald} />}
          title="Fatura bulunamadı"
          description="Fatura silinmiş olabilir."
        />
      </View>
    );
  }

  const isOverdue = isInvoiceOverdue(inv);
  const st = invoiceStatus(isOverdue ? "gecikti" : inv.display_status || inv.status);
  const cur = inv.currency;
  const remaining = Number(inv.remaining_amount ?? Number(inv.total || 0) - Number(inv.paid_amount || 0));
  const isCancelled = inv.status === "iptal";
  // Resmileştirme Paraşüt üzerinden yapılır. Sunucu, Paraşüt'e gitmemiş her faturayı (taslak, gönderildi, gecikti,
  // tahsilatı tamamlanmış "ödendi") resmileştirir; düğme web paneliyle aynı koşulda görünür.
  const mayWrite = canManage(user, "billing");
  // C4: web SalesInvoiceFormOS editable kuralı; silme de aynı koşulda sunulur (sunucu ayrıca doğrular).
  const canEditInvoice = mayWrite && isInvoiceEditable(inv as any);
  const onDelete = async () => {
    if (!token || !inv || busy) return;
    const ok = await confirm({
      title: `${inv.invoice_number || "Fatura"} silinsin mi?`,
      message: "Taslak fatura kalıcı olarak silinir. Geri alınamaz.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteLocalInvoice(token, inv.id);
      toast("Fatura silindi.", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/local-invoices");
    } catch (e: any) {
      toast(e?.message || "Fatura silinemedi.", "error");
      load();
    } finally {
      setBusy(null);
    }
  };
  const canOfficialize =
    mayWrite && parasutConnected === true && !inv.parasut_invoice_id && inv.status !== "resmilesti" && !isCancelled;
  const canCollect = mayWrite && !isCancelled && remaining > 0.004;

  const onOfficialize = async () => {
    if (!token) return;
    const ok = await confirm({
      title: "Fatura resmileştirilsin mi?",
      message:
        "Fatura Paraşüt üzerinden e-belge olarak gönderilir. Bu işlem geri alınamaz." +
        (Number(inv.paid_amount || 0) > 0 ? " Alınan tahsilatlar ObiHub'da kalır, bu adımda Paraşüt'e gönderilmez." : ""),
      confirmLabel: "Resmileştir",
    });
    if (!ok) return;
    setBusy("official");
    try {
      const r = await officializeLocalInvoice(token, inv.id);
      toast(r?.message || (r?.pending ? "E-belge sıraya alındı" : "Fatura resmileşti"), "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Resmileştirilemedi.", "error");
    } finally {
      setBusy(null);
    }
  };

  const onCollect = async () => {
    if (!token) return;
    // Web gibi tahsilatın yazılacağı kasa/banka hesabı seçilir; yalnız fatura para birimindeki hesaplar listelenir.
    let accounts: Awaited<ReturnType<typeof getCashAccounts>> = [];
    try {
      accounts = await getCashAccounts(token);
    } catch (e: any) {
      toast(e?.message || "Kasa/banka hesapları okunamadı.", "error");
      return;
    }
    const invCur = String(cur || "TRY").toUpperCase();
    const usable = accounts.filter((a) => String(a.currency || "TRY").toUpperCase() === invCur);
    if (accounts.length > 0 && usable.length === 0) {
      toast(`${invCur} para biriminde kasa/banka hesabı yok. Önce Kasa ve Bankalar'dan hesap ekleyin.`, "error");
      return;
    }
    const entry = await promptEntry({
      title: "Tahsilat ekle",
      message: `Kalan ${formatMoney(remaining, cur)}`,
      initial: remaining,
      decimal: true,
      noteLabel: "Not (isteğe bağlı)",
      methods: [...PAYMENT_METHODS],
      accounts: usable.map((a) => ({ value: a.id, label: a.name })),
      accountsLabel: usable.length > 0 ? "Hesap" : undefined,
    });
    if (!entry || entry.amount <= 0) return;
    if (entry.amount > remaining + 0.004) {
      toast("Tutar kalan borçtan büyük olamaz.", "error");
      return;
    }
    const method = entry.method || "nakit";
    setBusy("payment");
    try {
      await addLocalInvoicePayment(token, inv.id, {
        amount: entry.amount,
        date: todayIso(),
        method,
        notes: entry.note || undefined,
        account_id: entry.account || null,
      });
      toast("Tahsilat kaydedildi", "success");
      await load();
    } catch (e: any) {
      // Bağlantı koptuysa ya da sunucu hatasıysa tahsilat işlenmiş olabilir; yeniden göndermeden önce kontrol edilmeli.
      toast(
        isUncertainWrite(e)
          ? "Tahsilatın kaydedilip kaydedilmediği bilinmiyor. Tekrar eklemeden önce faturayı yenileyip kontrol edin."
          : e?.message || "Tahsilat kaydedilemedi.",
        "error"
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  const onCheckEdoc = async () => {
    if (!token) return;
    setBusy("edoc");
    try {
      const r = await checkLocalInvoiceEdocStatus(token, inv.id);
      const state = r?.edoc_state;
      toast(
        r?.message || (state === "done" ? "Fatura resmileşti" : state === "failed" ? "E-belge oluşturulamadı" : "E-belge sonucu henüz gelmedi"),
        state === "failed" ? "error" : "success"
      );
      await load();
    } catch (e: any) {
      toast(e?.message || "Durum sorgulanamadı.", "error");
    } finally {
      setBusy(null);
    }
  };

  const lines = inv.items || [];
  const payments = inv.payments || [];

  const total = Number(inv.total || 0);
  const paid = Number(inv.paid_amount || 0);
  const settled = remaining <= 0.004;
  const paidRatio = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  const showProgress = total > 0 && !isCancelled;
  const amount = (color: string, strong?: boolean) => [strong ? type.bodyStrong : type.callout, tabular, { color }];

  const stats: HeroStat[] = [
    { label: "Ödenen", value: formatMoney(paid, cur), tone: "good" },
    { label: "Kalan", value: formatMoney(Math.max(0, remaining), cur), tone: settled ? "good" : isOverdue ? "bad" : undefined },
  ];
  if (inv.due_date) stats.push({ label: "Vade", value: formatDate(inv.due_date), tone: isOverdue && !settled ? "bad" : undefined });

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-detail">
      <StackHeader title={inv.invoice_number || "Fatura"} subtitle={formatDate(inv.issue_date)} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <DetailHero
          tone="emerald"
          style={styles.hero}
          leading={
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(inv.customer_name)}</Text>
            </View>
          }
          title={inv.customer_name || "Müşteri"}
          subtitle={[inv.invoice_number, formatDate(inv.issue_date)].filter(Boolean).join(" · ")}
          badge={<StatusBadge label={st.label} kind={st.kind} size="sm" />}
          value={formatMoney(inv.total, cur)}
          valueLabel="Fatura toplamı"
          stats={stats}
        >
          {showProgress ? (
            <View
              style={styles.progress}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`Tahsil edilen oran yüzde ${Math.round(paidRatio * 100)}`}
            >
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(paidRatio * 100)}%` }]} />
              </View>
              <Text style={[styles.progressText, tabular]}>%{Math.round(paidRatio * 100)} tahsil edildi</Text>
            </View>
          ) : null}
        </DetailHero>

        {inv.edoc_error ? (
          <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
            <View style={[styles.alert, { backgroundColor: colors.errorBg }]}>
              <AlertIcon size={18} color={colors.error} />
              <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>E-belge hatası: {inv.edoc_error}</Text>
            </View>
          </SafeAnimatedView>
        ) : null}

        {inv.edoc_state === "pending" && !inv.edoc_error ? (
          <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
            <View testID="invoice-edoc-pending" style={[styles.alert, { backgroundColor: colors.infoBg }]}>
              <ClockIcon size={18} color={colors.info} />
              <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>
                E-belge sonucu bekleniyor. Fatura Paraşüt'e gönderildi; sonucu görmek için durumu sorgulayın.
              </Text>
              {inv.parasut_invoice_id ? (
                <Button testID="invoice-edoc-check" label="Durumu sorgula" size="sm" variant="secondary" busy={busy === "edoc"} disabled={Boolean(busy)} onPress={onCheckEdoc} />
              ) : null}
            </View>
          </SafeAnimatedView>
        ) : null}

        {canOfficialize || canCollect ? (
          <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)} style={styles.actions}>
            {canCollect ? <Button testID="invoice-collect" label="Tahsilat ekle" busy={busy === "payment"} disabled={Boolean(busy)} onPress={onCollect} style={{ flex: 1 }} /> : null}
            {canOfficialize ? (
              <Button testID="invoice-officialize" label="Resmileştir" variant="secondary" busy={busy === "official"} disabled={Boolean(busy)} onPress={onOfficialize} style={{ flex: 1 }} />
            ) : null}
          </SafeAnimatedView>
        ) : null}

        {canEditInvoice ? (
          <SafeAnimatedView entering={FadeInDown.delay(95).duration(380)} style={styles.actions}>
            <Button
              testID="invoice-edit"
              label="Düzenle"
              variant="secondary"
              disabled={Boolean(busy)}
              onPress={() => router.push({ pathname: "/local-invoices/new", params: { id: inv.id } })}
              style={{ flex: 1 }}
            />
            <Button testID="invoice-delete" label="Sil" variant="secondary" busy={busy === "delete"} disabled={Boolean(busy)} onPress={onDelete} style={{ flex: 1 }} />
          </SafeAnimatedView>
        ) : null}

        {/* Hero başlığı iki satırda kesilir; tam unvan burada satır sınırı olmadan görünür. */}
        <SafeAnimatedView entering={FadeInDown.delay(110).duration(380)}>
          <SectionTitle title="Müşteri" />
          <Card padded style={styles.block}>
            <Text testID="invoice-customer-name" selectable style={[type.bodyStrong, { color: colors.textPrimary }]}>
              {inv.customer_name || "Müşteri"}
            </Text>
          </Card>
        </SafeAnimatedView>

        <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
          <SectionTitle title="Tutarlar" />
          <Card style={styles.block}>
            <ListRow title="Ara toplam" trailing={<Text style={amount(colors.textPrimary)}>{formatMoney(inv.subtotal, cur)}</Text>} />
            {Number(inv.discount_amount || 0) > 0 ? (
              <ListRow divider title="İndirim" trailing={<Text style={amount(colors.textPrimary)}>-{formatMoney(inv.discount_amount, cur)}</Text>} />
            ) : null}
            <ListRow divider title="KDV" trailing={<Text style={amount(colors.textPrimary)}>{formatMoney(inv.vat_amount, cur)}</Text>} />
            <ListRow divider title="Ödenen" trailing={<Text style={amount(colors.success)}>{formatMoney(inv.paid_amount || 0, cur)}</Text>} />
            <ListRow
              divider
              title="Kalan"
              trailing={<Text style={amount(settled ? colors.success : isOverdue ? colors.error : colors.textPrimary, true)}>{formatMoney(Math.max(0, remaining), cur)}</Text>}
            />
          </Card>
        </SafeAnimatedView>

        {lines.length > 0 ? (
          <SafeAnimatedView entering={FadeInDown.delay(200).duration(380)}>
            <SectionTitle title="Kalemler" action={<Text style={[type.footnote, tabular, { color: colors.textSecondary }]}>{lines.length} kalem</Text>} />
            <Card style={styles.block}>
              {lines.map((l, i) => (
                <ListRow
                  key={i}
                  divider={i > 0}
                  leading={
                    <IconTile tint={colors.primarySoft}>
                      <PackageIcon size={18} color={colors.primary} />
                    </IconTile>
                  }
                  title={l.name || l.product_name || l.description || "Kalem"}
                  subtitle={`${Number(l.quantity || 0)} × ${formatMoney(l.unit_price, cur)}${l.vat_rate != null ? ` · KDV %${l.vat_rate}` : ""}`}
                  trailing={lineTotal(l) != null ? <Text style={amount(colors.textPrimary)}>{formatMoney(lineTotal(l), cur)}</Text> : undefined}
                />
              ))}
            </Card>
          </SafeAnimatedView>
        ) : null}

        {payments.length > 0 ? (
          <SafeAnimatedView entering={FadeInDown.delay(260).duration(380)}>
            <SectionTitle title="Tahsilatlar" action={<Text style={[type.footnote, tabular, { color: colors.textSecondary }]}>{payments.length} kayıt</Text>} />
            <Card style={styles.block}>
              {payments.map((p, i) => (
                <ListRow
                  key={p.id || i}
                  divider={i > 0}
                  leading={
                    <IconTile tint={colors.emeraldSoft}>
                      <WalletIcon size={18} color={colors.emerald} />
                    </IconTile>
                  }
                  title={PAYMENT_METHODS.find((m) => m.value === p.method)?.label || p.method || "Ödeme"}
                  subtitle={formatDate(p.date)}
                  trailing={<Text style={amount(colors.success)}>{formatMoney(p.amount, cur)}</Text>}
                />
              ))}
            </Card>
          </SafeAnimatedView>
        ) : null}

        {inv.notes ? (
          <SafeAnimatedView entering={FadeInDown.delay(320).duration(380)}>
            <SectionTitle title="Not" />
            <Card padded style={styles.block}>
              <Text style={[type.body, { color: colors.textSecondary }]}>{inv.notes}</Text>
            </Card>
          </SafeAnimatedView>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hero: { marginTop: spacing.sm },
  block: { marginHorizontal: spacing.lg },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  avatarText: { color: ON_HERO.text, fontSize: 16, fontWeight: "700" },
  progress: { marginTop: spacing.md, gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: ON_HERO.faint, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: ON_HERO.live },
  progressText: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  alert: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  skeleton: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  skeletonHero: { borderRadius: radius.xxl, borderWidth: 1, padding: spacing.lg, gap: spacing.lg },
  skeletonHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skeletonStats: { flexDirection: "row", justifyContent: "space-between" },
  skeletonCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md },
  skeletonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52 },
});
