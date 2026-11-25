import React, { useCallback, useEffect, useRef, useState } from "react";
import { InlineEmpty } from "../../src/components/InlineEmpty";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { FadeInDown } from "react-native-reanimated";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getLegacyPartyCurrency, getPartyLedgerCompat, legacyIdOf } from "../../src/api-gider";
import { deleteCustomerTransfer, deleteParty, setPartyArchived, getAllocationState, getParty, getPartyOrders, sendKeyedMoney, type AllocationState, type PartyOrder } from "../../src/api-finans";
import { newIdempotencyKey } from "../../src/api";
import { PartyTimeline } from "../../src/components/PartyTimeline";
import { balanceHint, matchLinkView, partyDeleteOutcome, transferErrorText, transferRowActions } from "../../src/cari-ui";
import { ledgerCollection, ledgerRowActions } from "../../src/collection-actions";
import { runVoidCollection } from "../../src/collection-flow";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { DetailHero } from "../../src/ui/DetailHero";
import { ClassChips } from "../../src/components/ClassChips";
import { useClassNames } from "../../src/classification-store";
import { hasClass } from "../../src/classification";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { AlertIcon, ArrowRightIcon, DownloadIcon, InboxIcon, ReceiptIcon, RefreshIcon, WalletIcon } from "../../src/components/Icons";
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
    edit?: string;
    del?: string;
    orders?: string;
    ro?: string;
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
  const { toast, confirm } = useFeedback();
  // C5: düzenle / sil / siparişler (liste satırının actions bayrakları; müşteri yönetme yetkisi).
  const mayManage = canManage(user, "customers");
  const canEditParty = mayManage && params.edit === "1" && params.ro !== "1";
  const canDeleteParty = mayManage && params.del === "1" && params.ro !== "1";
  const showOrders = params.orders === "1";
  const [orders, setOrders] = useState<PartyOrder[] | null>(null);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [deleting, setDeleting] = useState(false);
  // Düzenleme ekranından dönüşte güncel ad sunucudan okunur.
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const focusedOnce = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      // Tahsilat düzenleme ekranından dönüşte ekstre yeniden okunur.
      if (focusedOnce.current && token) loadRef.current?.();
      if (focusedOnce.current && canEditParty && token) {
        getParty(token, legacyIdOf(id))
          .then((c: any) => c?.name && setNameOverride(String(c.name)))
          .catch(() => undefined);
      }
      focusedOnce.current = true;
    }, [canEditParty, token, id])
  );
  const [rows, setRows] = useState<PartyLedgerRow[]>([]);
  // Aşama 4 P3: ekstre sayfalı gelir (100'er satır, en yeni önce).
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const loadSeq = useRef(0);
  const [otherBalances, setOtherBalances] = useState<{ currency: string; balance: number }[]>([]);
  const [balance, setBalance] = useState(Number(params.balance || 0));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = false;
  // Tahsilat yalnızca kayıtlı carilerde yapılabilir; siparişlerden türetilen carilerde uç 404 döner.
  const registered = params.registered === "1";
  // A: kategori/etiket (salt okuma). Web gibi yalnız kayıtlı (eski kart) caride; kart bir kez okunur, 403/hata sessiz.
  const [classRow, setClassRow] = useState<any>(null);
  useEffect(() => {
    if (!token || !registered || params.source === "obihub" || params.source === "orders") return;
    let live = true;
    getParty(token, legacyIdOf(id))
      .then((c: any) => live && setClassRow({ category_id: c?.category_id || null, tag_ids: Array.isArray(c?.tag_ids) ? c.tag_ids : [] }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token, registered, id, params.source]);
  const classOn = Boolean(classRow && hasClass(classRow));
  const cls = useClassNames(token, "party", classRow ? [classRow] : [], classOn);
  // Web (CustomersPage.js): kaynağı ObiHub defteri olan caride tahsilat bu ekrandan alınmaz.
  // G4-30: Paraşüt aynalı cari (ro=1) ObiHub'da tahsil edilmez/düzenlenmez; Paraşüt'te yönetilir.
  const readOnlyParty = params.ro === "1";
  const mayCollect = (canManage(user, "customers") || canManage(user, "billing")) && source !== "obihub" && !readOnlyParty;
  const mayVoidAny = canManage(user, "customers") || canManage(user, "billing");
  // Sunucu (88a086a17) `account_id`'yi para birimiyle denetler; web gibi dövizli caride de tahsilat alınır,
  // yalnız carinin para birimindeki hesaplar listelenir.
  const foreign = false;
  const curLabel = cur || "TRY";

  useEffect(() => {
    if (!token || !showOrders || !id) return;
    let live = true;
    getPartyOrders(token, legacyIdOf(id))
      .then((r) => {
        if (!live) return;
        setOrders(r.items);
        setOrdersTotal(r.total);
      })
      .catch(() => live && setOrders([]));
    return () => {
      live = false;
    };
  }, [token, id, showOrders]);

  const onDelete = async () => {
    if (!token || deleting) return;
    const ok = await confirm({
      title: `${nameOverride || String(params.name || "Cari")} silinsin mi?`,
      message: "Cari listeden kaldırılır; geçmiş faturalar ve hareketler korunur.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteParty(token, legacyIdOf(id));
      toast("Cari silindi", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/customers");
    } catch (e: any) {
      const out = partyDeleteOutcome(e);
      if (!out.offerArchive) {
        toast(out.text, "error");
        return;
      }
      // Hareketli cari silinmez; Paraşüt gibi arşiv önerilir.
      const arch = await confirm({ title: "Cari silinemez", message: out.text, confirmLabel: "Arşivle" });
      if (!arch) return;
      try {
        await setPartyArchived(token, legacyIdOf(id), true);
        toast("Cari arşivlendi; hareketleri korunur.", "success");
        if (router.canGoBack()) router.back();
        else router.replace("/customers");
      } catch (e2: any) {
        toast(e2?.message || "Cari arşivlenemedi.", "error");
      }
    } finally {
      setDeleting(false);
    }
  };

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
      const seq = ++loadSeq.current;
      const res = await getPartyLedgerCompat(token, { id, origin, source }, 1);
      if (seq !== loadSeq.current) return;
      pageRef.current = 1;
      setRows(res.rows);
      setLedgerTotal(res.total);
      if (res.balance !== null) setBalance(res.balance);
      const own = res.currency ? res.currency.toUpperCase().replace("TRL", "TRY") : null;
      if (own) setCur(own);
      setOtherBalances((res.balances || []).filter((b) => b.currency !== (own || cur || "TRY")));
      setError(null);
      // K8/K10: eşleşmemiş alacak ve "Faturalarla eşleştir" bağlantısı (okunamazsa bağlantı gösterilmez).
      if (registered && mayCollect) getAllocationState(token, legacyIdOf(id)).then(setAllocState).catch(() => setAllocState(null));
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
  const [allocState, setAllocState] = useState<AllocationState | null>(null);
  const matchView = matchLinkView(allocState);
  const loadRef = useRef<(() => Promise<void>) | null>(null);
  loadRef.current = load;

  // Aşama 4 / P11: tahsilat satırında Düzenle / Sil (yalnız sunucunun actions'ına göre).
  const [voiding, setVoiding] = useState<string | null>(null);
  const onEditCollection = (r: PartyLedgerRow, rowCur: string) => {
    if (!r.collection) return;
    const c = ledgerCollection(r, legacyIdOf(id));
    router.push({ pathname: "/collections/edit", params: { c: JSON.stringify(c), currency: c.currency || rowCur, title: nameOverride || String(params.name || "") } });
  };
  const onVoidCollection = async (r: PartyLedgerRow, rowCur: string) => {
    if (!token || !r.collection || voiding) return;
    const c = ledgerCollection(r, legacyIdOf(id));
    setVoiding(r.id || c.id);
    try {
      if (await runVoidCollection({ token, c, currency: c.currency || rowCur, confirm, toast })) await load();
    } finally {
      setVoiding(null);
    }
  };

  // K9: virman (cari → cari). Düzenle aynı ekranda; sil onaylı, işlem anahtarlı (belirsizde aynı anahtarla yeniden).
  const openTransfer = (r?: PartyLedgerRow) =>
    router.push({
      pathname: "/customers/transfer",
      params: { id: legacyIdOf(id), name: nameOverride || String(params.name || ""), currency: cur || "TRY", ...(r?.transfer ? { t: JSON.stringify(r.transfer) } : {}) },
    });
  const onVoidTransfer = async (r: PartyLedgerRow, rowCur: string) => {
    const t = r.transfer;
    if (!token || !t || voiding) return;
    const ok = await confirm({
      title: "Virman silinsin mi?",
      message: `${r.description || "Virman"} · ${formatMoney(Number(t.amount || 0), rowCur)}\n\nVirman ters kayıtla geri alınır; iki carinin bakiyesi de eski hâline döner.`,
      confirmLabel: "Virmanı sil",
      destructive: true,
    });
    if (!ok) return;
    setVoiding(r.id || t.id);
    const key = newIdempotencyKey("trf-void");
    try {
      const out = await sendKeyedMoney(
        () => deleteCustomerTransfer(token, legacyIdOf(id), t.id, key),
        () => confirm({ title: "Sonuç alınamadı", message: "Virman silinmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez işlenmez.", confirmLabel: "Yeniden gönder" })
      );
      if (out.ok) toast(out.result?.replayed ? "Bu işlem zaten kaydedilmişti; ikinci kez işlenmedi." : "Virman silindi; iki carinin bakiyesi güncellendi.", "success");
      else toast(transferErrorText(out.error), "error");
      await load();
    } finally {
      setVoiding(null);
    }
  };

  const hasMore = rows.length < ledgerTotal;
  const loadMore = async () => {
    if (!token || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const seq = loadSeq.current;
    try {
      const next = pageRef.current + 1;
      const res = await getPartyLedgerCompat(token, { id, origin, source }, next);
      if (seq !== loadSeq.current) return;
      pageRef.current = next;
      setLedgerTotal(res.total);
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id).filter(Boolean));
        return [...prev, ...res.rows.filter((r) => !r.id || !seen.has(r.id))];
      });
    } catch (e: any) {
      toast(e?.message || "Hareketler yüklenemedi.", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  // Hesap okunurken / form açıkken ikinci dokunuş ikinci bir tahsilat akışı (ayrı anahtar) başlatmasın.
  const collectingRef = useRef(false);
  const onCollect = async () => {
    if (!token || foreign || !cur || collectingRef.current) return;
    collectingRef.current = true;
    try {
      await collectFlow();
    } finally {
      collectingRef.current = false;
    }
  };

  const collectFlow = async () => {
    if (!token || !cur) return;
    // Sunucu tahsilatı carinin KENDİ para birimiyle yazar; okuma modeli listesi bakiye birimini (TRY önce) taşıyabilir.
    // Kayıtlı caride birim tahsilattan hemen önce /customers/{id}'den doğrulanır (okunamazsa eldeki değer).
    const own = registered ? await getLegacyPartyCurrency(token, id) : null;
    const payCur = (own || cur).replace("TRL", "TRY");
    if (payCur !== cur) setCur(payCur);
    // Aşama 4 / P8: tahsilat ve faturalara dağıtım ayrı ekranda (web CollectionDialogOS); dönüşte ekstre yenilenir.
    router.push({ pathname: "/customers/collect", params: { id: legacyIdOf(id), name: nameOverride || String(params.name || ""), currency: payCur, balance: String(balance) } });
  };

  const name = nameOverride || String(params.name || "Cari");
  // K10: eksi bakiye = carinin alacak bakiyesi (biz cariye borçluyuz).
  const balanceLabel = balanceHint(balance);

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
            {otherBalances.map((b) => (
              <Text key={b.currency} testID={`customer-balance-${b.currency}`} style={[styles.otherBalance, tabular]} numberOfLines={1}>
                {`${b.balance >= 0 ? "Alacak" : "Borç"} ${formatMoney(Math.abs(b.balance), b.currency)}`}
              </Text>
            ))}
            {/* M1 (K8): eşleşmemiş tahsilat varsa ve açık fatura varsa küçük bağlantı; ayrı ana düğme yok. */}
            {registered && mayCollect && matchView.show ? (
              <Pressable
                testID="customer-match-link"
                accessibilityRole="link"
                onPress={() => router.push({ pathname: "/customers/allocate", params: { id: legacyIdOf(id), name, currency: cur || "TRY" } })}
                style={styles.matchLink}
              >
                <Text style={styles.matchText} numberOfLines={2}>
                  {matchView.text}
                </Text>
                <ArrowRightIcon size={14} color={ON_HERO.text} />
              </Pressable>
            ) : null}
            {registered && mayCollect && !matchView.show && matchView.note ? (
              <Text testID="customer-match-note" style={styles.matchNote}>
                {matchView.note}
              </Text>
            ) : null}
          </View>
        </DetailHero>
        {classOn ? <ClassChips row={classRow} names={cls.names} hidden={cls.hidden} max={6} style={styles.classRow} testID="customer-class-chips" /> : null}

        {registered && mayCollect && cur && !foreign ? (
          <SafeAnimatedView entering={FadeInDown.delay(70).duration(380)} style={styles.action}>
            <Button
              testID="customer-collect"
              label="Tahsilat al"
              icon={<WalletIcon size={18} color="#FFFFFF" />}
              busy={busy}
              onPress={onCollect}
            />
            {/* K9: cari → cari virman (kasa/banka yok). "Avansı faturaya dağıt" kalktı (M1); eşleştirme bakiye kartındaki bağlantıda. */}
            <Button
              testID="customer-transfer"
              variant="secondary"
              label="Virman"
              icon={<RefreshIcon size={16} color={colors.textPrimary} />}
              style={{ marginTop: spacing.sm }}
              onPress={() => openTransfer()}
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

        {readOnlyParty ? (
          <View testID="customer-mirror-notice" style={[styles.notice, { backgroundColor: colors.infoBg }]}>
            <AlertIcon size={18} color={colors.info} />
            <Text style={[type.footnote, styles.noticeText, { color: colors.textSecondary }]}>
              Bu cari Paraşüt'ten geliyor. Tahsilat, virman ve düzenleme Paraşüt'te yapılır; burada yalnız görüntülenir.
            </Text>
          </View>
        ) : null}
        {canEditParty || canDeleteParty ? (
          <SafeAnimatedView entering={FadeInDown.delay(90).duration(380)} style={styles.manageRow}>
            {canEditParty ? (
              <Button testID="customer-edit" variant="secondary" label="Düzenle" onPress={() => router.push({ pathname: "/customers/new", params: { id } })} style={{ flex: 1 }} />
            ) : null}
            {canDeleteParty ? <Button testID="customer-delete" variant="secondary" label="Sil" busy={deleting} onPress={onDelete} style={{ flex: 1 }} /> : null}
          </SafeAnimatedView>
        ) : null}

        {showOrders && orders && orders.length ? (
          <SafeAnimatedView entering={FadeInDown.delay(120).duration(380)}>
            <SectionTitle title="Siparişler" action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${ordersTotal} sipariş`}</Text>} />
            <Card style={styles.block}>
              {orders.slice(0, 10).map((o, i) => (
                <ListRow
                  key={o.id}
                  testID={`customer-order-${o.id}`}
                  divider={i > 0}
                  leading={
                    <IconTile tint={colors.primarySoft}>
                      <InboxIcon size={18} color={colors.primary} />
                    </IconTile>
                  }
                  title={`#${o.channel_order_id || o.id}`}
                  subtitle={[o.channel, o.order_date ? formatDate(o.order_date) : null].filter(Boolean).join(" · ")}
                  meta={o.invoice_label ? `Fatura ${o.invoice_label}` : "Faturalanmadı"}
                  trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "600" }]}>{formatMoney(o.total_amount, o.currency)}</Text>}
                  onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id } })}
                />
              ))}
            </Card>
          </SafeAnimatedView>
        ) : null}

        <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
          <SectionTitle
            title="Hareketler"
            action={ledgerTotal > rows.length && rows.length > 0 ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${rows.length} / ${ledgerTotal}`}</Text> : undefined}
          />
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
            <Card style={styles.block}>
              <InlineEmpty
                icon={<InboxIcon size={22} color={colors.primary} />}
                title="Henüz hareket yok"
                description="Fatura, tahsilat ve ödemeler bu cariye işlendikçe burada listelenir."
              />
            </Card>
          ) : (
            <Card style={styles.block}>
              {rows.map((r, i) => {
                const debit = Number(r.debit || 0);
                const credit = Number(r.credit || 0);
                const isCredit = credit > 0;
                const rowCur = (r.currency || curLabel).toUpperCase().replace("TRL", "TRY");
                // 15 Kas 2026 ödeme silme: borç ödemesi satırı okuma modeli ekstresinde de gelir; düğme yalnız sunucunun actions'ına göre.
                const acts = mayCollect || mayVoidAny ? ledgerRowActions(r) : null;
                const tActs = mayCollect && !acts ? transferRowActions(r) : null;
                return (
                  <View key={r.id || i}>
                  <ListRow
                    divider={i > 0}
                    leading={
                      <IconTile tint={isCredit ? colors.successBg : colors.surfaceMuted}>
                        {isCredit ? <DownloadIcon size={18} color={colors.success} /> : <ReceiptIcon size={18} color={colors.textSecondary} />}
                      </IconTile>
                    }
                    title={r.description || r.reference || "Hareket"}
                    subtitle={r.reversed ? `${formatDate(r.date)} · iptal edildi` : formatDate(r.date)}
                    meta={r.balance != null ? `Bakiye ${formatMoney(r.balance, rowCur)}` : undefined}
                    trailing={
                      <Text style={[type.bodyStrong, tabular, { color: isCredit ? colors.success : colors.textPrimary }]}>
                        {isCredit ? `-${formatMoney(credit, rowCur)}` : `+${formatMoney(debit, rowCur)}`}
                      </Text>
                    }
                  />
                  {acts ? (
                    <View style={styles.rowActs}>
                      {acts.edit ? (
                        <Button testID={`ledger-edit-${r.id}`} size="sm" variant="secondary" label="Düzenle" disabled={Boolean(voiding)} onPress={() => onEditCollection(r, rowCur)} />
                      ) : null}
                      {acts.void ? (
                        <Button testID={`ledger-void-${r.id}`} size="sm" variant="secondary" label="Sil" busy={voiding === (r.id || r.collection?.id)} disabled={Boolean(voiding)} onPress={() => onVoidCollection(r, rowCur)} />
                      ) : null}
                    </View>
                  ) : null}
                  {tActs ? (
                    <View style={styles.rowActs}>
                      {tActs.edit ? (
                        <Button testID={`ledger-transfer-edit-${r.id}`} size="sm" variant="secondary" label="Düzenle" disabled={Boolean(voiding)} onPress={() => openTransfer(r)} />
                      ) : null}
                      {tActs.void ? (
                        <Button testID={`ledger-transfer-void-${r.id}`} size="sm" variant="secondary" label="Sil" busy={voiding === (r.id || r.transfer?.id)} disabled={Boolean(voiding)} onPress={() => onVoidTransfer(r, rowCur)} />
                      ) : null}
                    </View>
                  ) : null}
                  </View>
                );
              })}
            </Card>
          )}
          {!loading && !error && hasMore ? (
            <View style={styles.action}>
              <Button
                testID="customer-ledger-more"
                variant="secondary"
                label={`Daha eski hareketler (${ledgerTotal - rows.length})`}
                busy={loadingMore}
                onPress={loadMore}
              />
            </View>
          ) : null}
        </SafeAnimatedView>
        {/* Dalga 2 (C-15): notlar ve mesajlar; yalnız kayıtlı cari kartında. */}
        {token && registered ? <PartyTimeline token={token} customerId={legacyIdOf(id)} mayWrite={mayManage} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  classRow: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  rowActs: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, marginTop: -spacing.xs },
  manageRow: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  action: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint, paddingHorizontal: 6 },
  avatarText: { color: ON_HERO.text, fontSize: 17, fontWeight: "700" },
  valueBlock: { marginTop: spacing.md },
  valueLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  matchLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: ON_HERO.faint },
  matchText: { color: ON_HERO.text, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  matchNote: { color: ON_HERO.soft, fontSize: 12, marginTop: spacing.sm },
  otherBalance: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600", marginTop: 2 },
  value: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  noticeText: { flex: 1, minWidth: 0 },
  state: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stateText: { flex: 1, minWidth: 0 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  skeletonText: { flex: 1, gap: 8 },
});
