// D1 — Hızlı satış (POS). Web: pages/POSPage.js. Tam ekran, alttan açılır (sekme değil; PM kararı 12 Kas 2026).
// Akış: barkod okut / ara → sepet (adet, genel indirim) → Tahsil et (Nakit / Kart) → POST /pos/sales (işlem anahtarlı) → özet.
// Belirsiz sonuçta (ağ hatası / 5xx) sepet kilitlenir ve AYNI anahtarla AYNI sepet yeniden gönderilir; stok yalnız bir kez düşer.
// Sunucu POS satışını henüz kasaya/cariye yazmıyor: özet yalnız satış ve stok sonucunu söyler; "Açık hesap" gizli.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import { createScanGuard } from "../src/scan-guard";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthProvider";
import { canSell } from "../src/auth/permissions";
import { getParties, newIdempotencyKey } from "../src/api";
import { getUiCapabilities } from "../src/api-gider";
import { cartTotals, cashPostingText, createPosSale, findByBarcode, getPosCardAccounts, posPayload, searchPosProducts, splitCents, toCents, type CartLine, type PaymentType, type PosProduct, type PosSale } from "../src/api-pos";
import type { CashAccount } from "../src/types";
import { nextPosKey, openAccountBlock, posErrorAction } from "../src/pos-money";
import { posSaleErrorText, reservedProductIds, soldOut, stockText } from "../src/pos-catalog";
import type { Party } from "../src/types";
import { markCatalogDirty } from "../src/catalogCache";
import { useDebounce } from "../src/hooks/useDebounce";
import { haptic } from "../src/haptics";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../src/theme/tokens";
import { formatTry } from "../src/utils";
import { AlertIcon, CheckIcon, PackageIcon, PlusIcon, SearchIcon, TrashIcon, WalletIcon } from "../src/components/Icons";
import { EmptyState } from "../src/components/EmptyState";
import { PressableScale } from "../src/components/KPICard";
import { FadeInDown, SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { Button } from "../src/ui/Button";
import { parseAmount, useFeedback } from "../src/ui/Feedback";
import { FormField, OptionChips } from "../src/ui/FormField";
import { StackHeader } from "../src/ui/Header";
import { HeroCard, ON_HERO } from "../src/ui/HeroCard";
import { Card, SectionTitle } from "../src/ui/ListRow";
import { SearchField } from "../src/ui/SearchField";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;
const PAYMENTS: { value: PaymentType; label: string }[] = [
  { value: "nakit", label: "Nakit" },
  { value: "kart", label: "Kart" },
  { value: "karma", label: "Nakit + Kart" },
  { value: "acik_hesap", label: "Açık hesap" },
];

function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // Barkod çerçevede tutuldukça yeniden sayılmaz; çıkarılıp yeniden gösterilince sayılır (src/scan-guard.ts).
  const guard = useRef(createScanGuard());
  if (Platform.OS === "web") return null;
  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={[styles.scanDenied, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]} testID="pos-camera-denied">
        <SearchIcon size={20} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Kamera kapalı</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {permission.canAskAgain ? "Barkod okutmak için izin verin ya da ürünü aşağıdan arayın." : "Cihaz ayarlarından kamerayı açabilirsiniz. Şimdilik ürünü aşağıdan arayın."}
          </Text>
        </View>
        {permission.canAskAgain ? <Button size="sm" label="İzin ver" onPress={requestPermission} /> : null}
      </View>
    );
  }
  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={({ data }) => {
          if (guard.current.accept(String(data || ""), Date.now())) onCode(String(data));
        }}
      />
      <View pointerEvents="none" style={styles.frame} />
      <Text style={styles.camHint}>Barkodu çerçeveye getirin</Text>
    </View>
  );
}

export default function PosScreen() {
  const { token, user } = useAuth();
  const { colors, shadows } = useTheme();
  const { toast, confirm } = useFeedback();
  const insets = useSafeAreaInsets();
  const allowed = canSell(user);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const term = useDebounce(search.trim(), 300);
  const [results, setResults] = useState<PosProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [discountText, setDiscountText] = useState("");
  const [stage, setStage] = useState<"cart" | "pay" | "done">("cart");
  const [payment, setPayment] = useState<PaymentType>("nakit");
  const [paidText, setPaidText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  // POS_STOCK_RESERVED: web sepetlerinde rezerve olduğu için satılamayan sepet satırları (vurgulanır).
  const [reservedIds, setReservedIds] = useState<string[]>([]);
  const [sale, setSale] = useState<PosSale | null>(null);
  const [ownerAccounting, setOwnerAccounting] = useState(false);
  // Karma ödemede nakit kısmı; kart = toplam − nakit (kuruşta).
  const [splitCashText, setSplitCashText] = useState("");
  // POS (Kart) hesapları: birden çoksa kart içeren ödemede seçim zorunlu.
  const [cardAccounts, setCardAccounts] = useState<CashAccount[]>([]);
  const [cardAccountId, setCardAccountId] = useState("");
  const cardPicked = useRef(false);
  // Açık hesap: yalnız kayıtlı müşteri kartı (siparişten türetilen kişi ve tedarikçi kartı seçtirilmez).
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const custTerm = useDebounce(custSearch.trim(), 300);
  const [custResults, setCustResults] = useState<Party[]>([]);
  const [custHidden, setCustHidden] = useState(0);
  const [custLoading, setCustLoading] = useState(false);
  const keyRef = useRef(newIdempotencyKey("pos"));
  const sending = useRef(false);
  const lookupBusy = useRef(false);

  useEffect(() => {
    if (!token) return;
    getUiCapabilities(token).then((c) => setOwnerAccounting(c.inventoryOwner?.owner === "accounting"));
  }, [token]);

  const loadCardAccounts = useCallback(() => {
    if (!token) return;
    getPosCardAccounts(token)
      .then((list) => {
        setCardAccounts(list);
        // Tek hesap kendiliğinden seçilir; birden çoksa yalnız kullanıcının seçtiği korunur (sessiz seçim yok).
        setCardAccountId((cur) => (list.length === 1 ? list[0].id : cardPicked.current && list.some((a) => a.id === cur) ? cur : ""));
      })
      .catch(() => setCardAccounts([]));
  }, [token]);
  useEffect(() => {
    loadCardAccounts();
  }, [loadCardAccounts]);

  useEffect(() => {
    if (!token || term.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    setSearching(true);
    searchPosProducts(token, term)
      .then((r) => live && setResults(r))
      .catch(() => live && setResults([]))
      .finally(() => live && setSearching(false));
    return () => {
      live = false;
    };
  }, [token, term]);

  useEffect(() => {
    if (!token || payment !== "acik_hesap" || customer) return;
    let live = true;
    setCustLoading(true);
    getParties(token, { search: custTerm || undefined, role: "customer" })
      .then((r) => {
        if (!live) return;
        const ok = r.items.filter((p) => openAccountBlock(p) === null);
        setCustResults(ok.slice(0, 20));
        setCustHidden(r.items.length - ok.length);
      })
      .catch(() => live && setCustResults([]))
      .finally(() => live && setCustLoading(false));
    return () => {
      live = false;
    };
  }, [token, payment, customer, custTerm]);

  const discount = discountText.trim() ? parseAmount(discountText, true) : 0;
  const totals = useMemo(() => cartTotals(cart, discount || 0), [cart, discount]);
  const locked = uncertain || busy;

  const addProduct = useCallback(
    (p: PosProduct) => {
      if (locked) return;
      haptic.success();
      setCart((prev) => {
        const i = prev.findIndex((l) => l.product.id === p.id);
        if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
        return [{ product: p, quantity: 1 }, ...prev];
      });
    },
    [locked]
  );

  const onCode = useCallback(
    async (code: string) => {
      if (!token || lookupBusy.current || locked) return;
      lookupBusy.current = true;
      try {
        const r = await findByBarcode(token, code);
        if (r.exact) {
          addProduct(r.exact);
          toast(`${r.exact.name} eklendi.`, "success");
        } else if (r.candidates.length) {
          setSearch(code);
          toast("Birden fazla ürün uyuyor; listeden seçin.");
        } else {
          haptic.error();
          toast(`${code} barkodlu ürün bulunamadı.`, "error");
        }
      } catch (e: any) {
        toast(e?.message || "Ürün aranamadı.", "error");
      } finally {
        lookupBusy.current = false;
      }
    },
    [token, addProduct, toast, locked]
  );

  const setQty = (id: string, q: number) => {
    if (locked) return;
    // Rezerve satır düzeltildiyse o retten kalan mesaj kalkar (son rezerve satır düzelince).
    if (reservedIds.includes(id)) {
      const rest = reservedIds.filter((x) => x !== id);
      setReservedIds(rest);
      if (!rest.length) setError("");
    }
    if (q <= 0) setCart((prev) => prev.filter((l) => l.product.id !== id));
    else setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, quantity: q } : l)));
  };

  const paid = payment === "nakit" && paidText.trim() ? parseAmount(paidText, true) : null;
  const change = paid !== null ? Math.max(0, paid - totals.total) : 0;
  const totalCents = toCents(totals.total);
  const splitCash = payment === "karma" && splitCashText.trim() ? parseAmount(splitCashText, true) : null;
  const split = payment === "karma" && splitCash !== null ? splitCents(totalCents, toCents(splitCash)) : null;
  const usesCard = payment === "kart" || (payment === "karma" && (split ? split.card > 0 : true));
  const needCardAccount = usesCard && cardAccounts.length > 1;

  const charge = async () => {
    if (!token || sending.current || !cart.length) return;
    if (discount === null) return setError("İndirim tutarı geçersiz: en çok 2 ondalık, ör. 12,50.");
    if (paidText.trim() && paid === null) return setError("Alınan tutar geçersiz: en çok 2 ondalık, ör. 1.234,56.");
    if (paid !== null && paid < totals.total) return setError("Alınan tutar toplamdan az olamaz.");
    if (payment === "karma") {
      if (!splitCashText.trim() || splitCash === null) return setError("Nakit tutarını girin: en çok 2 ondalık, ör. 100,00.");
      if (toCents(splitCash) > totalCents) return setError("Nakit tutarı fiş toplamını aşamaz.");
      if (toCents(splitCash) <= 0 || toCents(splitCash) >= totalCents) return setError("Karma ödemede nakit ve kart tutarlarının ikisi de sıfırdan büyük olmalı.");
    }
    if (needCardAccount && !cardAccountId) return setError("Kart ödemesinin yazılacağı POS hesabını seçin.");
    if (payment === "acik_hesap" && !customer) return setError("Açık hesap için satışın yazılacağı cariyi seçin.");
    setError("");
    sending.current = true;
    setBusy(true);
    try {
      const body = posPayload(cart, discount || 0, payment, paid ?? totals.total, {
        cashCents: split?.cash,
        cardAccountId: cardAccounts.length > 1 ? cardAccountId : undefined,
        customer: payment === "acik_hesap" ? customer : null,
      });
      const s = await createPosSale(token, body, keyRef.current);
      setSale(s);
      setStage("done");
      setUncertain(false);
      markCatalogDirty();
      haptic.success();
      // Sunucu ilk kart satışında "POS (Kart)" hesabını açmış olabilir.
      if (usesCard && !cardAccounts.length) loadCardAccounts();
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code === "POS_CARD_ACCOUNT_REQUIRED") loadCardAccounts();
      // Kural ../src/pos-money (birim testli): belirsizde aynı anahtar + aynı sepet, kesin retten sonra yeni anahtar.
      const action = posErrorAction(e);
      keyRef.current = nextPosKey(keyRef.current, e, () => newIdempotencyKey("pos"));
      if (action === "conflict") {
        setUncertain(false);
        setError("Bu ödeme farklı bir sepetle başlatılmış; yeni satış olarak yeniden deneyin.");
      } else if (action === "retry-same") {
        // Satış kaydedilmiş olabilir (500: "kaydedildi ancak stok düşülemedi"; 409: stok işlemi başka istekte sürüyor).
        setUncertain(true);
        const status = Number(e?.status || 0);
        setError(e?.message && status !== 0 ? e.message : "Sonuç alınamadı. Satış kaydedilmiş olabilir; aynı ödemeyi yeniden gönderin, ikinci kez işlenmez.");
      } else {
        // Kesin ret (POS_* kodları, 400/422 …): hiçbir şey yazılmadı; sepet açık kalır.
        setUncertain(false);
        const ids = reservedProductIds(e);
        if (code === "POS_STOCK_RESERVED" || code === "POS_SALE_DELETED") {
          setError(posSaleErrorText(e, cart));
          setReservedIds(ids);
          // Rezerve ürün sepetten çıkarılabilsin diye sepete dönülür.
          if (ids.length) setStage("cart");
        } else {
          setError(e?.message || "Satış kaydedilemedi.");
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const newSale = () => {
    setCart([]);
    setDiscountText("");
    setPaidText("");
    setSplitCashText("");
    setCustomer(null);
    setCustSearch("");
    setSale(null);
    setError("");
    setReservedIds([]);
    setUncertain(false);
    setStage("cart");
    keyRef.current = newIdempotencyKey("pos");
  };

  const close = async () => {
    if (cart.length && stage !== "done" && !uncertain) {
      const ok = await confirm({ title: "Sepet silinsin mi?", message: "Sepetteki ürünler kaydedilmeden kapatılır.", confirmLabel: "Kapat", destructive: true });
      if (!ok) return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard");
  };

  if (!allowed) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Hızlı satış" />
        <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Hızlı satış için Satışlar modülünde düzenleme yetkisi gerekir." />
      </View>
    );
  }

  // ---- Özet ----
  if (stage === "done" && sale) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="pos-done">
        <StackHeader title="Satış tamamlandı" />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <SafeAnimatedView entering={FadeInDown.duration(380)}>
            <HeroCard tone="emerald">
              <View style={styles.doneIcon}>
                <CheckIcon size={30} color="#FFFFFF" />
              </View>
              <Text style={styles.doneLabel}>{`Satış ${sale.saleNumber}`}</Text>
              <Text style={[styles.doneValue, tabular]} testID="pos-done-total">
                {formatTry(sale.total)}
              </Text>
              <View style={styles.doneFacts}>
                <Text style={styles.doneFact}>{sale.paymentType === "kart" ? "Kart" : sale.paymentType === "karma" ? "Nakit + Kart" : sale.paymentType === "acik_hesap" ? "Açık hesap" : "Nakit"}</Text>
                <Text style={styles.doneFact}>{`${sale.itemCount || totals.itemCount} kalem`}</Text>
                {payment === "nakit" && paid !== null && change > 0 ? <Text style={styles.doneFact}>{`Para üstü ${formatTry(change)}`}</Text> : null}
              </View>
            </HeroCard>
          </SafeAnimatedView>
          {cashPostingText(sale) ? (
            <View style={[styles.notice, { backgroundColor: sale.cashStatus === "pending" || sale.ledgerStatus === "pending" ? colors.infoBg : colors.successBg }]} testID="pos-cash-note">
              <WalletIcon size={16} color={sale.cashStatus === "pending" || sale.ledgerStatus === "pending" ? colors.info : colors.success} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{cashPostingText(sale)}</Text>
            </View>
          ) : null}
          {sale.cashEntries.length > 1 ? (
            <View testID="pos-cash-legs">
            <Card style={{ marginHorizontal: 0 }}>
              {sale.cashEntries.map((e, i) => (
                <View key={`${e.method}-${i}`} style={[styles.leg, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{`${e.method === "kart" ? "Kart" : "Nakit"} · ${e.accountName || (e.method === "kart" ? "POS (Kart)" : "Kasa")}`}</Text>
                  <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "700" }]}>{formatTry(e.amount)}</Text>
                </View>
              ))}
            </Card>
            </View>
          ) : null}
          {sale.rounded ? (
            <Text style={[type.caption, { color: colors.textTertiary, paddingHorizontal: spacing.xs }]}>Bölme 1 kuruş farkla yuvarlandı; fark kart tutarına yansıtıldı.</Text>
          ) : null}
          <View style={[styles.notice, { backgroundColor: colors.successBg }]}>
            <PackageIcon size={16} color={colors.success} />
            <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{cashPostingText(sale) ? "Ürünler ObiHub stoğundan düşüldü." : "Satış kaydedildi; ürünler ObiHub stoğundan düşüldü."}</Text>
          </View>
          {ownerAccounting ? (
            <View style={[styles.notice, { backgroundColor: colors.infoBg }]} testID="pos-owner-note">
              <AlertIcon size={16} color={colors.info} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>Stok muhasebe programınızdan da düşülmeli.</Text>
            </View>
          ) : null}
          <Button testID="pos-new-sale" label="Yeni satış" icon={<PlusIcon size={18} color="#FFFFFF" />} onPress={newSale} />
          {sale.id ? (
            <Button testID="pos-open-receipt" variant="secondary" label="Satış fişini aç" onPress={() => router.push({ pathname: "/pos-receipts/[id]", params: { id: sale.id } } as any)} />
          ) : null}
          <Button variant="secondary" label="Kapat" onPress={close} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="pos-screen">
      <StackHeader title="Hızlı satış" subtitle={cart.length ? `${totals.itemCount} ürün sepette` : "Barkod okutun ya da ürün arayın"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 160 + insets.bottom }} keyboardShouldPersistTaps="handled">
          {stage === "cart" ? (
            <>
              <Scanner onCode={onCode} />
              <SearchField testID="pos-search" value={search} onChangeText={setSearch} placeholder="Ürün adı, SKU ya da barkod" />
              {term.length >= 2 ? (
                <Card style={styles.block}>
                  {searching ? (
                    <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} />
                  ) : results.length ? (
                    results.map((p, i) => (
                      <PressableScale
                        key={p.id}
                        testID={`pos-result-${p.id}`}
                        onPress={() => {
                          addProduct(p);
                          setSearch("");
                        }}
                        style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                      >
                        <View style={[styles.thumb, { backgroundColor: colors.primarySoft }]}>
                          {p.imageUrl ? <ExpoImage source={{ uri: p.imageUrl }} style={styles.thumbImg} contentFit="cover" /> : <PackageIcon size={18} color={colors.primary} />}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={[type.caption, tabular, { color: soldOut(p) ? colors.error : p.reserved > 0 ? colors.amber : colors.textTertiary }]} numberOfLines={2}>
                            {[p.barcode || p.sku, stockText(p)].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "700" }]}>{formatTry(p.price)}</Text>
                        <PlusIcon size={18} color={colors.primary} />
                      </PressableScale>
                    ))
                  ) : (
                    <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Eşleşen ürün yok.</Text>
                  )}
                </Card>
              ) : null}
            </>
          ) : null}

          <SectionTitle title="Sepet" action={cart.length && !locked && stage === "cart" ? <Button size="sm" variant="ghost" label="Temizle" onPress={() => setCart([])} /> : undefined} />
          {cart.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]} testID="pos-empty">
              <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
                <SearchIcon size={22} color={colors.primary} />
              </View>
              <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>Sepet boş</Text>
              <Text style={[type.caption, { color: colors.textSecondary, textAlign: "center" }]}>Barkodu okutun ya da ürünü arayıp dokunun.</Text>
            </View>
          ) : (
            <Card style={styles.block}>
              {cart.map((l, i) => (
                <View key={l.product.id} testID={`pos-line-${l.product.id}`} style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, reservedIds.includes(l.product.id) && { backgroundColor: colors.warningBg }]}>
                  <View style={styles.lineTop}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                      {l.product.name}
                    </Text>
                    <Text style={[type.callout, tabular, styles.lineTotal, { color: colors.textPrimary }]}>{formatTry(l.product.price * l.quantity)}</Text>
                  </View>
                  <View style={styles.lineTop}>
                    <Text style={[type.caption, tabular, { color: reservedIds.includes(l.product.id) ? colors.amber : colors.textTertiary, flex: 1 }]} testID={reservedIds.includes(l.product.id) ? `pos-reserved-${l.product.id}` : undefined}>
                      {reservedIds.includes(l.product.id) ? `Web sepetinde rezerve · ${stockText(l.product) || "satılamaz"}` : `${formatTry(l.product.price)} · KDV %${l.product.vatRate}`}
                    </Text>
                    <View style={[styles.stepper, { borderColor: colors.border }]}>
                      <PressableScale testID={`pos-minus-${l.product.id}`} disabled={locked || stage !== "cart"} onPress={() => setQty(l.product.id, l.quantity - 1)} style={styles.stepBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel={l.quantity === 1 ? `${l.product.name} sepetten çıkar` : `${l.product.name} adedini azalt`}>
                        {l.quantity === 1 ? <TrashIcon size={16} color={colors.error} /> : <Text style={[styles.stepTxt, { color: colors.textPrimary }]}>−</Text>}
                      </PressableScale>
                      <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary, minWidth: 26, textAlign: "center" }]} testID={`pos-qty-${l.product.id}`} accessibilityLabel={`${l.quantity} adet`} accessibilityLiveRegion="polite">
                        {l.quantity}
                      </Text>
                      <PressableScale testID={`pos-plus-${l.product.id}`} disabled={locked || stage !== "cart"} onPress={() => setQty(l.product.id, l.quantity + 1)} style={styles.stepBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${l.product.name} adedini artır`}>
                        <Text style={[styles.stepTxt, { color: colors.textPrimary }]}>+</Text>
                      </PressableScale>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {cart.length ? (
            <View style={styles.form}>
              <FormField testID="pos-discount" label="Genel indirim (isteğe bağlı)" value={discountText} onChangeText={setDiscountText} editable={!locked} keyboardType="decimal-pad" placeholder="0,00" suffix="₺" />
              {stage === "pay" ? (
                <>
                  <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Ödeme</Text>
                  <OptionChips testIDPrefix="pos-pay" options={PAYMENTS} value={payment} onChange={(v) => !locked && setPayment(v)} />
                  {payment === "nakit" ? (
                    <FormField testID="pos-paid" label="Alınan nakit (isteğe bağlı)" value={paidText} onChangeText={setPaidText} editable={!locked} keyboardType="decimal-pad" placeholder={formatTry(totals.total)} hint={change > 0 ? `Para üstü ${formatTry(change)}` : undefined} />
                  ) : null}
                  {payment === "karma" ? (
                    <FormField
                      testID="pos-split-cash"
                      label="Nakit tutarı"
                      value={splitCashText}
                      onChangeText={setSplitCashText}
                      editable={!locked}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      suffix="₺"
                      hint={split ? `Kart ${formatTry(split.card / 100)} · Toplam ${formatTry(totals.total)}` : `Kalanı kartla alınır. Toplam ${formatTry(totals.total)}`}
                    />
                  ) : null}
                  {payment === "acik_hesap" ? (
                    customer ? (
                      <View style={[styles.custPicked, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="pos-customer-picked">
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.caption, { color: colors.textTertiary }]}>Borç yazılacak cari</Text>
                          <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>{customer.name}</Text>
                        </View>
                        {!locked ? <Button size="sm" variant="ghost" label="Değiştir" testID="pos-customer-change" onPress={() => setCustomer(null)} /> : null}
                      </View>
                    ) : (
                      <>
                        <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Cari</Text>
                        <SearchField testID="pos-customer-search" value={custSearch} onChangeText={setCustSearch} placeholder="Cari adı ara" />
                        <Card style={{ marginHorizontal: 0 }}>
                          {custLoading && !custResults.length ? (
                            <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} />
                          ) : custResults.length ? (
                            custResults.map((p, i) => {
                              const name = p.name || p.company_name || p.full_name || "Cari";
                              return (
                                <PressableScale
                                  key={p.id}
                                  testID={`pos-customer-${p.id}`}
                                  onPress={() => setCustomer({ id: p.id, name })}
                                  style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                                >
                                  <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{name}</Text>
                                  {Math.abs(p.balance) > 0.004 ? (
                                    <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`Bakiye ${formatTry(p.balance)}`}</Text>
                                  ) : null}
                                </PressableScale>
                              );
                            })
                          ) : (
                            <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Kayıtlı müşteri kartı bulunamadı.</Text>
                          )}
                        </Card>
                        <Text style={[type.caption, { color: colors.textTertiary }]}>
                          {custHidden > 0
                            ? "Yalnız kayıtlı müşteri kartları seçilebilir. Siparişten gelen kişileri önce cari olarak kaydedin."
                            : "Yalnız kayıtlı müşteri kartları seçilebilir."}
                        </Text>
                      </>
                    )
                  ) : null}
                  {needCardAccount ? (
                    <>
                      <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Kart hesabı</Text>
                      <OptionChips
                        testIDPrefix="pos-card-account"
                        options={cardAccounts.map((a) => ({ value: a.id, label: a.name }))}
                        value={cardAccountId}
                        onChange={(v) => {
                          if (locked) return;
                          cardPicked.current = true;
                          setCardAccountId(v);
                        }}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
              {uncertain ? (
                <View style={[styles.notice, { backgroundColor: colors.warningBg, marginHorizontal: 0 }]} testID="pos-uncertain">
                  <AlertIcon size={16} color={colors.amber} />
                  <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>Sepet kilitlendi. Aynı ödemeyi yeniden gönderin; satış ikinci kez kaydedilmez, stok bir kez düşer.</Text>
                </View>
              ) : null}
              {error ? (
                <View style={[styles.notice, { backgroundColor: colors.errorBg, marginHorizontal: 0 }]} testID="pos-error" accessibilityRole="alert">
                  <AlertIcon size={16} color={colors.error} />
                  <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{error}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {cart.length ? (
          <View style={[styles.bar, shadows.md, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.barTop}>
              <View>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{totals.discount > 0 ? `Toplam (indirim ${formatTry(totals.discount)})` : "Toplam"}</Text>
                <Text style={[styles.barTotal, tabular, { color: colors.textPrimary }]} testID="pos-total">
                  {formatTry(totals.total)}
                </Text>
              </View>
              <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`KDV ${formatTry(totals.vat)}`}</Text>
            </View>
            {stage === "cart" ? (
              <Button testID="pos-checkout" label="Tahsil et" icon={<WalletIcon size={18} color="#FFFFFF" />} onPress={() => (discount === null ? setError("İndirim tutarı geçersiz: en çok 2 ondalık, ör. 12,50.") : (setError(""), setStage("pay")))} />
            ) : (
              <View style={styles.row2}>
                {!locked ? <Button variant="secondary" label="Geri" onPress={() => setStage("cart")} style={{ flex: 1 }} /> : null}
                <Button
                  testID="pos-charge"
                  label={uncertain ? "Aynı ödemeyi yeniden gönder" : payment === "acik_hesap" ? `Açık hesaba ${formatTry(totals.total)} yaz` : `${payment === "kart" ? "Kartla" : payment === "karma" ? "Nakit + kart" : "Nakit"} ${formatTry(totals.total)} al`}
                  busy={busy}
                  onPress={charge}
                  style={{ flex: 2 }}
                />
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {!cart.length ? (
        <View style={[styles.closeWrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button variant="secondary" label="Kapat" onPress={close} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  row2: { flexDirection: "row", gap: spacing.sm },
  camera: { height: 180, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.xl, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  frame: { width: "78%", height: 90, borderRadius: radius.lg, borderWidth: 2, borderColor: "#FFFFFF" },
  camHint: { position: "absolute", bottom: spacing.sm, color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  scanDenied: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  result: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, minHeight: 56 },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  empty: { marginHorizontal: spacing.lg, alignItems: "center", gap: spacing.xs, padding: spacing.xl, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.xl },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  line: { padding: spacing.md, gap: spacing.xs },
  lineTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.pill },
  stepBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  stepTxt: { fontSize: 20, fontWeight: "700" },
  lineTotal: { fontWeight: "700", minWidth: 76, textAlign: "right" },
  custPicked: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  leg: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44 },
  notice: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", marginHorizontal: spacing.lg, padding: spacing.sm, borderRadius: radius.md },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  barTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  barTotal: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  closeWrap: { paddingHorizontal: spacing.lg },
  doneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  doneLabel: { color: ON_HERO.soft, fontSize: 14, fontWeight: "600", textAlign: "center", marginTop: spacing.sm },
  doneValue: { color: ON_HERO.text, fontSize: 40, fontWeight: "800", textAlign: "center", letterSpacing: -0.8 },
  doneFacts: { flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: spacing.sm },
  doneFact: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
});
