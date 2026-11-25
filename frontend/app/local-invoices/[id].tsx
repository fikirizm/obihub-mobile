import React, { useCallback, useEffect, useRef, useState } from "react";
import { ClassChips } from "../../src/components/ClassChips";
import { useClassNames } from "../../src/classification-store";
import { hasClass } from "../../src/classification";
import { isReadOnly, mirrorBadge } from "../../src/mirror";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FadeInDown } from "react-native-reanimated";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { request, addLocalInvoicePayment, checkLocalInvoiceEdocStatus, getPickableAccounts, getLocalInvoice, newIdempotencyKey } from "../../src/api";
import { accountOptionLabel, accountsForCurrency, collectErrorText, unmatchAllocation, deleteLocalInvoice, getParasutAccounts, getParasutPaymentCaps, isInvoiceEditable, isUncertainWrite, postParasutPaymentAction, sendKeyedMoney } from "../../src/api-finans";
import { canOfferParasutSync, collectResultText, parasutActionFailText, parasutActionRequest, parasutActionResult, parasutCollectFields, parasutPayView, PARASUT_ACTION_LABELS, type ParasutAction } from "../../src/parasut-pay";
import { isInvoiceOverdue, PAYMENT_METHODS, todayIso } from "../../src/finance";
import { amountRows, collectAmount, invoiceStatusView, edocCancelled } from "../../src/invoice-status";
import { canRetryEdoc, canSendInvoice } from "../../src/document-lifecycle";
import { invoicePaymentActions, invoicePaymentCollection, OFFSET_RELEASE_TEXT, offsetErrorText, offsetReleasePath } from "../../src/collection-actions";
import { deleteConfirmText, lifecycleActions, lifecycleErrorText } from "../../src/document-lifecycle";
import { copyInvoice, getFxRates, getInvoicePdf, setInvoiceArchived } from "../../src/api-finans";
import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { printOrShare } from "../../src/pdf";
import { canOfficializeReturn } from "../../src/officialize";
import { cashMethods } from "../../src/cheques";
import { parseTr, suggestedTry } from "../../src/fx";
import { CollectionFollowupCard } from "../../src/components/CollectionFollowupCard";
import { autoSettlementText, canUnmatch, UNMATCH_CONFIRM, unmatchDoneText, unmatchErrorText } from "../../src/cari-ui";
import { runVoidCollection } from "../../src/collection-flow";
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
import { POS_PREPAID_NOTE, posPrepaid } from "../../src/pos-invoice";
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
  const { toast, confirm, promptEntry, promptNumber, choose } = useFeedback();
  const [inv, setInv] = useState<LocalInvoice | null>(null);
  // A: satış faturası kategori/etiketi (salt okuma).
  const invClassOn = Boolean(inv && hasClass(inv));
  const invCls = useClassNames(token, "sales", invClassOn ? [inv] : [], invClassOn);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"official" | "payment" | "edoc" | "delete" | "void" | "copy" | "archive" | "pdf" | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  // C4 eki: firmada tahsilatı Paraşüt'e yazma açık mı (okunamazsa kapalı).
  const [caps, setCaps] = useState<{ payment_sync: boolean }>({ payment_sync: false });
  const [psBusy, setPsBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let on = true;
    getParasutPaymentCaps(token).then((c) => on && setCaps(c));
    return () => {
      on = false;
    };
  }, [token]);

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

  // Hesap okunurken / form açıkken ikinci dokunuş ikinci bir tahsilat akışı (ayrı anahtar) başlatmasın.
  const collectingRef = useRef(false);

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
  // İki eksen (web invoiceStatus.js): belge + Resmileşmedi (Paraşüt bağlıysa) + tahsilat.
  const st = invoiceStatusView(inv, { parasutConnected: parasutConnected === true });
  const cur = inv.currency;
  const remaining = Number(inv.remaining_amount ?? collectAmount(inv) - Number(inv.paid_amount || 0));
  const isCancelled = inv.status === "iptal";
  // Resmileştirme Paraşüt üzerinden yapılır. Sunucu, Paraşüt'e gitmemiş her faturayı (taslak, gönderildi, gecikti,
  // tahsilatı tamamlanmış "ödendi") resmileştirir; düğme web paneliyle aynı koşulda görünür.
  const mayWrite = canManage(user, "billing");
  // C4: web SalesInvoiceFormOS editable kuralı; silme de aynı koşulda sunulur (sunucu ayrıca doğrular).
  // G4-30: Paraşüt aynalı fatura salt okunur (düzenle/sil/tahsilat/resmileştir yok; yazım uçları 409 MIRROR_READ_ONLY).
  const readOnly = isReadOnly(inv);
  const canEditInvoice = mayWrite && !readOnly && isInvoiceEditable(inv as any);
  const lc = lifecycleActions(inv as any);
  const canDelete = mayWrite && !readOnly && lc.delete;
  const onCopy = async () => {
    if (!token || busy) return;
    const ok = await confirm({ title: "Fatura kopyalansın mı?", message: "Aynı kalemlerle bugün tarihli yeni bir taslak oluşturulur; tahsilat ve e-belge bilgileri taşınmaz.", confirmLabel: "Kopyala" });
    if (!ok) return;
    setBusy("copy");
    const key = newIdempotencyKey("copy");
    const out = await sendKeyedMoney(
      () => copyInvoice(token, inv.id, key),
      () => confirm({ title: "Sonuç alınamadı", message: "Kopya oluşmuş olabilir. Yeniden gönderebilirsiniz; ikinci kez oluşmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(null);
    if (out.ok && out.result?.id) {
      toast("Fatura kopyalandı; yeni taslak açıldı.", "success");
      router.push({ pathname: "/local-invoices/new", params: { id: String(out.result.id) } });
    } else if (!out.ok) toast(lifecycleErrorText(out.error, "Fatura kopyalanamadı."), "error");
  };
  const onArchive = async () => {
    if (!token || busy) return;
    setBusy("archive");
    try {
      await setInvoiceArchived(token, inv.id, !inv.archived);
      toast(inv.archived ? "Fatura arşivden çıkarıldı." : "Fatura arşivlendi; bakiye ve raporlar değişmez.", "success");
      load();
    } catch (e: any) {
      toast(lifecycleErrorText(e, "Arşiv işlemi yapılamadı."), "error");
    } finally {
      setBusy(null);
    }
  };
  const onPdf = async () => {
    if (!token || busy) return;
    setBusy("pdf");
    try {
      const r = await getInvoicePdf(token, inv.id);
      if (r.redirect) await Linking.openURL(r.redirect);
      else if (r.base64 && Platform.OS !== "web") {
        const path = `${FileSystem.cacheDirectory}${String(inv.invoice_number || "fatura").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        await FileSystem.writeAsStringAsync(path, r.base64, { encoding: FileSystem.EncodingType.Base64 });
        await printOrShare(path);
      } else if (r.base64) toast("PDF hazır (web önizlemesinde açılmaz).", "info");
    } catch (e: any) {
      toast(lifecycleErrorText(e, "Fatura PDF'i alınamadı."), "error");
    } finally {
      setBusy(null);
    }
  };
  const onDelete = async () => {
    if (!token || !inv || busy) return;
    const ok = await confirm({
      title: `${inv.invoice_number || "Fatura"} silinsin mi?`,
      message: deleteConfirmText(inv as any),
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
      toast(lifecycleErrorText(e, "Fatura silinemedi."), "error");
      load();
    } finally {
      setBusy(null);
    }
  };
  // Dalga 1: e-belgesi iptal edilmiş fatura yeniden resmileştirilmez; sıradaki adım yerel iptaldir.
  // 24 Kas mükerrer e-belge koruması (web canSendInvoice): Paraşüt kimliği, işlem kilidi ya da herhangi bir e-belge izi varsa yeniden gönderilmez.
  const officializeCandidate = mayWrite && !readOnly && parasutConnected === true && canSendInvoice(inv as any) && !isCancelled && !edocCancelled(inv);
  // E-belgesi düşmüş (Paraşüt'te faturası olan) fatura: yalnız e-belge yeniden denenir, yeni fatura açılmaz.
  const canRetry = mayWrite && !readOnly && canRetryEdoc(inv as any);
  // G2 §6: tevkifat / ÖTV-ÖİV / konaklama / stopaj Paraşüt'e taşınamaz; düğme yerine açıklama (sunucu yine reddeder).
  // Dalga 2: tevkifat / ÖTV-ÖİV / konaklama / stopajlı fatura da resmileşir (sunucu tutar korumasıyla); iade faturası da (asıl faturaya bağlı).
  const canOfficialize = (officializeCandidate && inv.invoice_type !== "iade") || (mayWrite && parasutConnected === true && canOfficializeReturn(inv));
  // Aşama 4 P6: e-belge tutarı Paraşüt'le uyuşmadığında (blocked_mismatch) sunucu tahsilatı 409 ile reddeder; düğme gizlenir.
  // İade faturasına tahsilat alınmaz (sunucu 409 INVOICE_IS_REFUND).
  const canCollect = mayWrite && !readOnly && !isCancelled && inv?.money_state !== "refund" && remaining > 0.004 && inv?.edoc_state !== "blocked_mismatch" && !posPrepaid(inv);

  // Dalga 2: resmileştirme ayrı onay sayfasında (internet satışı, iade e-belgesi).
  const onOfficialize = () =>
    router.push({
      pathname: "/local-invoices/officialize",
      params: { id: inv.id, title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(" · "), paid: String(inv.paid_amount || 0), kind: inv.invoice_type === "iade" ? "iade" : "satis" },
    } as any);

  const onCollect = async () => {
    if (!token || collectingRef.current) return;
    collectingRef.current = true;
    try {
      await collectFlow();
    } finally {
      collectingRef.current = false;
    }
  };

  const collectFlow = async () => {
    if (!token) return;
    // Web gibi tahsilatın yazılacağı kasa/banka hesabı seçilir; yalnız fatura para birimindeki hesaplar listelenir.
    let accounts: Awaited<ReturnType<typeof getPickableAccounts>> = [];
    try {
      accounts = await getPickableAccounts(token);
    } catch (e: any) {
      toast(e?.message || "Kasa/banka hesapları okunamadı.", "error");
      return;
    }
    const invCur = String(cur || "TRY").toUpperCase();
    const usable = accountsForCurrency(accounts, invCur);
    // Dalga 3 (P3.2): dövizli fatura TL hesaba da tahsil edilir ("Alınan TL" = cash_amount; kur farkı ayrı satır, Paraşüt'e işlenmez).
    const tryAccounts = invCur !== "TRY" ? accountsForCurrency(accounts, "TRY") : [];
    // Aşama 4 P2: o para biriminde hesap yoksa sunucu ACCOUNT_NONE_FOR_CURRENCY döner (firmanın hiç hesabı yoksa TRY'de Nakit Kasa açılır).
    if (accounts.length > 0 && usable.length === 0 && tryAccounts.length === 0) {
      toast(`${invCur} para biriminde kasa/banka hesabı yok. Önce Kasa ve Bankalar'dan hesap ekleyin.`, "error");
      return;
    }
    const entry = await promptEntry({
      title: "Tahsilat ekle",
      message: `Kalan ${formatMoney(remaining, cur)}`,
      initial: remaining,
      decimal: true,
      noteLabel: "Not (isteğe bağlı)",
      // Dalga 3: çek kasa tahsilatı değil (422 CHEQUE_USE_CHEQUES) — "Çekle tahsil et" ayrı akış.
      methods: cashMethods(PAYMENT_METHODS),
      accounts: [
        ...usable.map((a) => ({ value: a.id, label: accountOptionLabel(a, usable.length > 1) })),
        ...tryAccounts.map((a) => ({ value: a.id, label: `${a.name} (TL)` })),
      ],
      accountsLabel: usable.length + tryAccounts.length > 0 ? "Hesap" : undefined,
    });
    if (!entry || entry.amount <= 0) return;
    if (entry.amount > remaining + 0.004) {
      toast("Tutar kalan borçtan büyük olamaz.", "error");
      return;
    }
    // Dövizli faturayı TL hesaba tahsil: alınan TL tutarı sorulur (TCMB alış kuruyla önerilir).
    let cashAmount: string | null = null;
    if (tryAccounts.some((a) => a.id === entry.account)) {
      let rates: any = null;
      try {
        rates = (await getFxRates(token))?.rates || null;
      } catch {
        rates = null;
      }
      const suggestion = parseTr(suggestedTry(entry.amount, invCur, rates)) || 0;
      const tl = await promptNumber({
        title: "Alınan TL",
        message: `${formatMoney(entry.amount, invCur)} karşılığı hesaba giren TL tutarı. Kur farkı ayrı satır olarak yazılır; bu tahsilat Paraşüt'e işlenmez.`,
        initial: suggestion,
        decimal: true,
        suffix: "TRY",
        confirmLabel: "Devam",
      });
      if (!tl || tl <= 0) return;
      cashAmount = tl.toFixed(2);
    }
    // Web "Paraşüt'e de işle": Paraşüt'teki faturada tahsilat isteğe bağlı olarak Paraşüt hesabına da yazılır.
    let psAccount: string | null = null;
    if (!cashAmount && canOfferParasutSync(inv, caps)) {
      let psAccounts: { id: string; name: string }[] = [];
      try {
        psAccounts = await getParasutAccounts(token);
      } catch {
        toast("Paraşüt hesapları yüklenemedi; tahsilat yalnız ObiHub'a kaydedilebilir.", "info");
      }
      const pick = await choose<string>({
        title: "Paraşüt'e de işlensin mi?",
        message: "Bu fatura Paraşüt'te. Tahsilatı Paraşüt'teki bir kasa/banka hesabına da yazabilirsiniz.",
        options: [{ value: "__none", label: "Yalnız ObiHub'a kaydet" }, ...psAccounts.map((a) => ({ value: a.id, label: `Paraşüt: ${a.name}` }))],
      });
      if (pick === null) return;
      psAccount = pick === "__none" ? null : pick;
    }
    setBusy("payment");
    // İşlem başına bir anahtar; belirsiz sonuçta aynı anahtar ve gövdeyle yeniden gönderilir (ikinci tahsilat açılmaz).
    const key = newIdempotencyKey("inv-pay");
    const body = { amount: entry.amount, date: todayIso(), method: entry.method || "nakit", notes: entry.note || undefined, account_id: entry.account || null, ...(cashAmount ? { cash_amount: cashAmount } : {}), ...parasutCollectFields(psAccount) };
    try {
      const out = await sendKeyedMoney(
        () => addLocalInvoicePayment(token, inv.id, body, key),
        () =>
          confirm({
            title: "Sonuç alınamadı",
            message: `${formatMoney(entry.amount, cur)} tahsilat kaydedilmiş olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez kaydedilmez.`,
            confirmLabel: "Yeniden gönder",
          })
      );
      if (out.ok) {
        const r = collectResultText(out.result);
        toast(r.text, r.kind);
      }
      else toast(collectErrorText(out.error, out.uncertain), "error");
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
      const settled = autoSettlementText((r as any)?.auto_settlement);
      // Dalga 1: e-belgesi iptal edilmiş faturada sorgu {ok:false, edoc_state:"cancelled"} döner; başarı tonu yok.
      const main = state === "cancelled" ? "e-Belge iptal edilmiş; fatura resmi değil." : r?.message || (state === "done" ? "Fatura resmileşti" : state === "failed" ? "E-belge oluşturulamadı" : "E-belge sonucu henüz gelmedi");
      toast(settled ? `${main} ${settled}` : main, state === "failed" ? "error" : state === "cancelled" || r?.ok === false ? "info" : "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Durum sorgulanamadı.", "error");
    } finally {
      setBusy(null);
    }
  };

  // Aşama 4 / P11: tahsilatı düzenle / sil (web SalesInvoiceFormOS.payRowActions).
  type Pay = NonNullable<LocalInvoice["payments"]>[number];
  const onEditPayment = (p: Pay) => {
    const c = invoicePaymentCollection(inv, p);
    router.push({ pathname: "/collections/edit", params: { c: JSON.stringify(c), currency: String(cur || "TRY"), title: inv.invoice_number || "Fatura" } });
  };
  // M4 (K8): cari tahsilatından gelen eşleşmeyi faturadan çöz; tutar carinin alacak bakiyesine döner (kasa/cari bakiyesi değişmez).
  const onUnmatch = async (p: Pay) => {
    if (!token || busy || !p.id) return;
    const ok = await confirm({
      title: "Eşleşme kaldırılsın mı?",
      message: `${formatMoney(p.amount, cur)} · ${formatDate(p.date)}\n\n${UNMATCH_CONFIRM}`,
      confirmLabel: "Eşleşmeyi kaldır",
      destructive: true,
    });
    if (!ok) return;
    setBusy("void");
    setVoidingId(p.id);
    const key = newIdempotencyKey("unmatch");
    try {
      const out = await sendKeyedMoney(
        () => unmatchAllocation(token, inv.id, String(p.id), key),
        () => confirm({ title: "Sonuç alınamadı", message: "Eşleşme kaldırılmış olabilir. Aynı işlemi yeniden gönderebilirsiniz; ikinci kez işlenmez.", confirmLabel: "Yeniden gönder" })
      );
      if (out.ok) toast(unmatchDoneText({ ...out.result, currency: out.result?.currency || cur }), "success");
      else toast(unmatchErrorText(out.error), "error");
      await load();
    } finally {
      setBusy(null);
      setVoidingId(null);
    }
  };

  // Dalga 2 (P2.3): mahsubu geri al — DELETE /local-invoices/{id}/offsets/{offset_id} (409 OPERATION_PENDING → birazdan).
  const onReleaseOffset = async (p: Pay) => {
    const offsetId = String((p as any).offset_id || "");
    if (!token || busy || !offsetId) return;
    const ok = await confirm({ title: "Mahsup geri alınsın mı?", message: `${formatMoney(p.amount, cur)} · ${formatDate(p.date)}\n\n${OFFSET_RELEASE_TEXT}`, confirmLabel: "Geri al" });
    if (!ok) return;
    setVoidingId(String(p.id));
    try {
      await request<any>(offsetReleasePath(inv.id, offsetId), { method: "DELETE" }, token);
      toast("Mahsup geri alındı.", "success");
    } catch (e: any) {
      toast(offsetErrorText(e), "error");
    } finally {
      setVoidingId(null);
      load();
    }
  };

  const onVoidPayment = async (p: Pay) => {
    if (!token || busy) return;
    const c = invoicePaymentCollection(inv, p);
    setBusy("void");
    setVoidingId(c.id);
    try {
      if (await runVoidCollection({ token, c, currency: String(cur || "TRY"), confirm, toast })) await load();
    } finally {
      setBusy(null);
      setVoidingId(null);
    }
  };

  // C4 eki: tahsilatın Paraşüt eylemi.  "Gönder" Paraşüt hesabı seçtirir; belirsizde yalnız işaretleme.
  const onParasutAction = async (p: Pay, action: ParasutAction) => {
    if (!token || !p.id || psBusy) return;
    let account: string | undefined;
    if (action === "send") {
      let accounts: { id: string; name: string }[] = [];
      try {
        accounts = await getParasutAccounts(token);
      } catch {
        toast("Paraşüt hesapları yüklenemedi; bağlantıyı kontrol edip yeniden deneyin.", "error");
        return;
      }
      if (!accounts.length) {
        toast("Paraşüt'te kasa/banka hesabı bulunamadı.", "error");
        return;
      }
      const pick = await choose<string>({ title: "Paraşüt kasa / banka hesabı", message: "Tahsilat bu hesaba bir kez yazılır.", options: accounts.map((a) => ({ value: a.id, label: a.name })) });
      if (!pick) return;
      account = pick;
    }
    const req = parasutActionRequest(inv.id, p.id, action, account);
    setPsBusy(p.id);
    try {
      const r = parasutActionResult(action, await postParasutPaymentAction(token, req.path, req.body));
      toast(r.text, r.ok ? "success" : "error");
    } catch (e: any) {
      toast(e?.message || parasutActionFailText(action), "error");
    } finally {
      setPsBusy(null);
      load();
    }
  };

  const lines = inv.items || [];
  const payments = inv.payments || [];

  // İlerleme tahsil edilecek tutara göre (tevkifat/stopaj düşülmüş).
  const total = collectAmount(inv);
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
          subtitle={[String(inv.document_name || "").trim() || null, inv.invoice_number, formatDate(inv.issue_date)].filter(Boolean).join(" · ")}
          badgeBelow
          badge={
            <View style={styles.badges} testID="invoice-status-badges">
              <StatusBadge label={st.document.label} kind={st.document.kind} size="sm" />
              {st.notOfficial ? <StatusBadge label={st.notOfficial.label} kind={st.notOfficial.kind} size="sm" /> : null}
              {st.payment ? <StatusBadge label={st.payment.label} kind={st.payment.kind} size="sm" /> : null}
              {mirrorBadge(inv) ? <StatusBadge label="Paraşüt" kind="neutral" size="sm" /> : null}
            </View>
          }
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
        {invClassOn ? <ClassChips row={inv} names={invCls.names} hidden={invCls.hidden} max={6} style={styles.classRow} testID="invoice-class-chips" /> : null}

        {inv.edoc_error ? (
          <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
            <View style={[styles.alert, { backgroundColor: colors.errorBg }]}>
              <AlertIcon size={18} color={colors.error} />
              <View style={{ flex: 1, gap: spacing.sm }}>
                <Text style={[type.footnote, { color: colors.error }]}>E-belge hatası: {inv.edoc_error}</Text>
                {canRetry ? (
                  <Button
                    testID="invoice-edoc-retry"
                    label="E-belgeyi yeniden dene"
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onPress={() => router.push({ pathname: "/local-invoices/edoc-retry", params: { id: inv.id, title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(" · "), reason: String(inv.edoc_error || "") } } as any)}
                    style={{ alignSelf: "flex-start" }}
                  />
                ) : null}
              </View>
            </View>
          </SafeAnimatedView>
        ) : null}

        {inv.edoc_state === "blocked_mismatch" ? (
          <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
            <View testID="invoice-edoc-mismatch" style={[styles.alert, { backgroundColor: colors.warningBg }]}>
              <AlertIcon size={18} color={colors.amber} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                {inv.edoc_error || "Fatura tutarı Paraşüt'teki tutarla uyuşmuyor. Uyuşmazlık giderilene kadar tahsilat eklenemez; web panelinden kontrol edin."}
              </Text>
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

        {posPrepaid(inv) && remaining > 0.004 ? (
          <Text testID="invoice-pos-prepaid" style={[type.caption, { color: colors.textTertiary, marginHorizontal: spacing.lg }]}>{POS_PREPAID_NOTE}</Text>
        ) : null}
        {canOfficialize || canCollect ? (
          <SafeAnimatedView entering={FadeInDown.delay(80).duration(380)} style={styles.actions}>
            {canCollect ? <Button testID="invoice-collect" label="Tahsilat ekle" busy={busy === "payment"} disabled={Boolean(busy)} onPress={onCollect} style={{ flex: 1 }} /> : null}
            {canCollect && cur === "TRY" ? (
              <Button
                testID="invoice-cheque"
                label="Çek al"
                variant="secondary"
                disabled={Boolean(busy)}
                onPress={() => router.push({ pathname: "/cheques/receive", params: { invoiceId: inv.id, amount: String(remaining.toFixed(2)), title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(" · "), drawer: inv.customer_name || "" } } as any)}
                style={{ flex: 1 }}
              />
            ) : null}
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
          </SafeAnimatedView>
        ) : null}

        {/* D-12 yaşam döngüsü: düğmeler sunucunun actions'ına göre (iptal, iade, kopya, arşiv, geçmiş, PDF). */}
        {mayWrite || lc.preview ? (
          <SafeAnimatedView entering={FadeInDown.delay(100).duration(380)}>
            <SectionTitle title="Belge işlemleri" action={inv.archived ? <StatusBadge label="Arşivde" kind="neutral" size="sm" /> : undefined} />
            <View style={styles.lcGrid}>
              {lc.preview ? <Button testID="invoice-pdf" size="sm" variant="secondary" label={lc.official_pdf ? "Resmi PDF" : "PDF / Yazdır"} busy={busy === "pdf"} disabled={Boolean(busy)} onPress={onPdf} /> : null}
              {mayWrite && lc.edit_meta && !canEditInvoice ? (
                <Button
                  testID="invoice-meta"
                  size="sm"
                  variant="secondary"
                  label="Fatura ismi ve bilgiler"
                  disabled={Boolean(busy)}
                  onPress={() => router.push({ pathname: "/local-invoices/meta", params: { id: inv.id, title: inv.invoice_number || "" } })}
                />
              ) : null}
              {mayWrite && lc.share ? (
                <Button
                  testID="invoice-share"
                  size="sm"
                  variant="secondary"
                  label="E-posta ile paylaş"
                  disabled={Boolean(busy)}
                  onPress={() => router.push({ pathname: "/quotes/share", params: { id: inv.id, kind: "invoice", title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(" · ") } })}
                />
              ) : null}
              {mayWrite && lc.copy ? <Button testID="invoice-copy" size="sm" variant="secondary" label="Kopyasını oluştur" busy={busy === "copy"} disabled={Boolean(busy)} onPress={onCopy} /> : null}
              {mayWrite && lc.return ? (
                <Button
                  testID="invoice-return"
                  size="sm"
                  variant="secondary"
                  label="İade oluştur"
                  disabled={Boolean(busy)}
                  onPress={() => router.push({ pathname: "/local-invoices/returns", params: { id: inv.id, title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(" · ") } })}
                />
              ) : null}
              {mayWrite && lc.cancel ? (
                <Button
                  testID="invoice-cancel"
                  size="sm"
                  variant="destructive"
                  label="İptal et"
                  disabled={Boolean(busy)}
                  onPress={() =>
                    router.push({
                      pathname: "/local-invoices/cancel",
                      params: { id: inv.id, title: [inv.invoice_number, inv.customer_name, formatMoney(inv.total, cur)].filter(Boolean).join(" · "), ...(lc.cancel_edoc ? { edoc: "1" } : {}) },
                    })
                  }
                />
              ) : null}
              {mayWrite && lc.archive ? (
                <Button testID="invoice-archive" size="sm" variant="secondary" label={inv.archived ? "Arşivden çıkar" : "Faturayı arşivle"} busy={busy === "archive"} disabled={Boolean(busy)} onPress={onArchive} />
              ) : null}
              {/* Dalga 5a: faturadan irsaliye (yalnız stok çıkışı faturayla yapılmamışsa; aksi 409 INVOICE_MOVES_STOCK). */}
              {canManage(user, "inventory") && inv.invoice_type !== "iade" && inv.invoice_type !== "teklif" && !isCancelled && inv.status !== "taslak" && (inv as any).stock_mode !== "with_document" ? (
                <Button
                  testID="invoice-dispatch"
                  size="sm"
                  variant="secondary"
                  label="İrsaliye oluştur"
                  disabled={Boolean(busy)}
                  onPress={() => router.push({ pathname: "/dispatch/new", params: { invoiceId: inv.id, title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(" · ") } } as any)}
                />
              ) : null}
              {canDelete ? <Button testID="invoice-delete" size="sm" variant="destructive" label="Faturayı sil" busy={busy === "delete"} disabled={Boolean(busy)} onPress={onDelete} /> : null}
              <Button
                testID="invoice-events"
                size="sm"
                variant="ghost"
                label="Geçmiş"
                onPress={() => router.push({ pathname: "/local-invoices/events", params: { id: inv.id, title: inv.invoice_number || "" } })}
              />
            </View>
            {inv.cancel_reason ? <Text style={[type.caption, styles.note, { color: colors.textSecondary }]}>{`İptal gerekçesi: ${inv.cancel_reason}`}</Text> : null}
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
            {amountRows(inv).map((r, i) => (
              <ListRow
                key={r.key}
                testID={`invoice-amount-${r.key}`}
                divider={i > 0}
                title={r.label}
                trailing={<Text style={amount(colors.textPrimary, r.strong)}>{r.amount < 0 ? `-${formatMoney(-r.amount, cur)}` : formatMoney(r.amount, cur)}</Text>}
              />
            ))}
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

        {/* Dalga 2: tahsilat takibi (vade, gecikme, hatırlatma); satış faturası, kesilmiş, aynalı değil. */}
        {token && !readOnly && !isCancelled && inv.invoice_type !== "iade" && inv.invoice_type !== "teklif" && inv.status !== "taslak" ? (
          <CollectionFollowupCard token={token} invoiceId={inv.id} title={inv.invoice_number || "Fatura"} mayWrite={mayWrite} reloadKey={inv} />
        ) : null}

        {payments.length > 0 ? (
          <SafeAnimatedView entering={FadeInDown.delay(260).duration(380)}>
            <SectionTitle title="Tahsilatlar" action={<Text style={[type.footnote, tabular, { color: colors.textSecondary }]}>{payments.length} kayıt</Text>} />
            <Card style={styles.block}>
              {payments.map((p, i) => {
                const acts = mayWrite ? invoicePaymentActions(inv, p) : null;
                const ps = parasutPayView(p, { linked: Boolean(inv.parasut_invoice_id), locked: !mayWrite || Boolean(inv.officialize_lock), canSend: caps.payment_sync });
                const psColor = ps ? { good: colors.success, muted: colors.textTertiary, warn: colors.amber, bad: colors.error }[ps.tone] : undefined;
                return (
                <View key={p.id || i}>
                <ListRow
                  divider={i > 0}
                  leading={
                    <IconTile tint={colors.emeraldSoft}>
                      <WalletIcon size={18} color={colors.emerald} />
                    </IconTile>
                  }
                  title={(p as any).source === "cheque" ? "Çek" : (p as any).source === "offset" ? "Mahsup" : PAYMENT_METHODS.find((m) => m.value === p.method)?.label || p.method || "Ödeme"}
                  subtitle={formatDate(p.date)}
                  meta={(p as any).source === "cheque" ? "Portföyde · Çekler ekranından yönetilir" : (p as any).source === "offset" ? ((p as any).offset_status === "releasing" ? "Geri alınıyor…" : "Alış belgesiyle karşılıklı kapatıldı") : acts?.customerPayment ? ((p as any).auto ? "Cari alacaktan mahsup" : "Cari tahsilatından eşleşme") : p.notes || undefined}
                  trailing={<Text style={amount(colors.success)}>{formatMoney(p.amount, cur)}</Text>}
                />
                {ps ? (
                  <View testID={`invoice-pay-parasut-${p.id}`} style={styles.psRow}>
                    <Text style={[type.caption, { color: psColor, flexShrink: 1 }]}>
                      {[ps.label, ps.note, ps.detail].filter(Boolean).join(" · ")}
                    </Text>
                    {ps.actions.map((a) => (
                      <Button key={a} testID={`invoice-pay-parasut-${a}-${p.id}`} size="sm" variant="secondary" label={PARASUT_ACTION_LABELS[a]} busy={psBusy === p.id} disabled={Boolean(psBusy) || Boolean(busy)} onPress={() => onParasutAction(p, a)} />
                    ))}
                  </View>
                ) : null}
                {mayWrite && canUnmatch(p) ? (
                  <View style={styles.rowActs}>
                    <Button testID={`invoice-pay-unmatch-${p.id}`} size="sm" variant="secondary" label="Eşleşmeyi kaldır" busy={voidingId === p.id} disabled={Boolean(busy)} onPress={() => onUnmatch(p)} />
                  </View>
                ) : null}
                {acts?.release ? (
                  <View style={styles.rowActs}>
                    <Button testID={`invoice-offset-release-${p.id}`} size="sm" variant="secondary" label="Mahsubu geri al" busy={voidingId === p.id} disabled={Boolean(busy)} onPress={() => onReleaseOffset(p)} />
                  </View>
                ) : null}
                {acts && (acts.edit || acts.void) ? (
                  <View style={styles.rowActs}>
                    {acts.edit ? (
                      <Button testID={`invoice-pay-edit-${p.id}`} size="sm" variant="secondary" label="Düzenle" disabled={Boolean(busy)} onPress={() => onEditPayment(p)} />
                    ) : null}
                    <Button testID={`invoice-pay-void-${p.id}`} size="sm" variant="secondary" label="Sil" busy={voidingId === p.id} disabled={Boolean(busy)} onPress={() => onVoidPayment(p)} />
                  </View>
                ) : null}
                </View>
                );
              })}
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
  classRow: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  lcGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginHorizontal: spacing.lg },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  note: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
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
  psRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, marginTop: -spacing.xs },
  rowActs: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, marginTop: -spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  skeleton: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  skeletonHero: { borderRadius: radius.xxl, borderWidth: 1, padding: spacing.lg, gap: spacing.lg },
  skeletonHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skeletonStats: { flexDirection: "row", justifyContent: "space-between" },
  skeletonCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md },
  skeletonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52 },
});
