// Dalga 3 / C3 — elle gider / alış faturası. Web: components/expenses/ManualExpenseForm.jsx.
// Toplamı SUNUCU hesaplar (POST /accounting/manual-purchases/preview, gecikmeli); ekrandaki satır tutarı yalnız gösterimdir.
// Kaydet = önizleme özetiyle onay (işlem anahtarlı). Stok sahibi ObiHub ise satır "Ürün (stoğa girer)" olabilir: katalogdan ürün,
// tam sayı adet; birden çok depoda depo seçilir. Muhasebe sahipli firmada ürün seçeneği yerine yönlendirme notu gösterilir.
// Mobilde tevkifat ve KDV dışı vergi girişi yok; o faturalar web'den girilir (not gösterilir).
import { FormSkeleton } from "../../src/components/Skeleton";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { newIdempotencyKey } from "../../src/api";
import {
  buildManualPayload,
  confirmManualPurchase,
  decimalText,
  getExpenseCategories,
  getExpenseModuleEnabled,
  getSupplierParties,
  getUiCapabilities,
  istanbulToday,
  manualErrorText,
  NO_CAPS,
  previewManualPurchase,
  searchProducts,
  type ManualForm,
  type ManualLineInput,
  type ManualPreview,
} from "../../src/api-gider";
import { useDebounce } from "../../src/hooks/useDebounce";
import { haptic } from "../../src/haptics";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatMoney } from "../../src/utils";
import { AlertIcon, CheckIcon, PackageIcon, PlusIcon, ReceiptIcon, TrashIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import type { UiCapabilities } from "../../src/types";

const VAT = ["0", "1", "10", "20"].map((v) => ({ value: v, label: `%${v}` }));
const KINDS = [
  { value: "service" as const, label: "Hizmet / gider" },
  { value: "product" as const, label: "Ürün (stoğa girer)" },
];
const PARASUT_WARNING =
  "Paraşüt muhasebeniz aktif. Burada girdiğiniz kayıt Paraşüt'e aktarılmaz; aynı gider Paraşüt'te de varsa çift kayıt olur.";
const REASON_TEXT: Record<string, string> = {
  EXPENSE_MODULE_DISABLED: "ObiHub ön muhasebesi kapalı; elle gider girişi yapılamaz.",
  ACCOUNTING_CONFIGURATION_MISSING: "Muhasebe ayarları tamamlanmadığı için elle gider girişi şu an kapalı.",
  OWNERSHIP_NOT_OBIHUB: "Giderleriniz muhasebe programınızda tutuluyor; elle gider girişi orada yapılır.",
  SYSTEM_UNAVAILABLE: "Elle gider girişi şu an kullanılamıyor. Biraz sonra yeniden deneyin.",
};

const emptyLine = (): ManualLineInput => ({ kind: "service", productId: "", productName: "", description: "", quantity: "1", unitPrice: "", vatRate: "20", discount: "" });
const trDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
// "GG.AA.YYYY" ya da "YYYY-AA-GG" → "YYYY-AA-GG"; boş "", geçersiz "x".
const isoOf = (text: string) => {
  const t = text.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "x";
};
const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
// Gösterim için satır tutarı (kuruş tamsayı): miktar × birim fiyat − iskonto. Sunucu önizlemesi esastır.
function lineTotal(l: ManualLineInput): number | null {
  const q = decimalText(l.quantity, 4);
  const p = decimalText(l.unitPrice, 2);
  if (!q || p === null) return null;
  const d = l.discount.trim() ? decimalText(l.discount, 2) : "0";
  if (d === null) return null;
  const cents = Math.round(Number(q) * Number(p) * 100) - Math.round(Number(d) * 100);
  return cents < 0 ? null : cents / 100;
}

function ProductPicker({ token, index, value, onPick }: { token: string; index: number; value: { id: string; name: string } | null; onPick: (p: { id: string; name: string } | null) => void }) {
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const term = useDebounce(q.trim(), 300);
  const [items, setItems] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    if (term.length < 2) {
      setItems([]);
      setState("idle");
      return;
    }
    let live = true;
    setState("loading");
    searchProducts(token, term)
      .then((r) => live && (setItems(r), setState("ready")))
      .catch(() => live && (setItems([]), setState("error")));
    return () => {
      live = false;
    };
  }, [token, term]);
  if (value?.id) {
    return (
      <View style={[styles.picked, { backgroundColor: colors.primarySoft }]} testID={`line-${index}-product`}>
        <PackageIcon size={16} color={colors.primary} />
        <Text style={[type.callout, { color: colors.textPrimary, flex: 1, fontWeight: "600" }]} numberOfLines={1}>
          {value.name}
        </Text>
        <Button size="sm" variant="ghost" label="Değiştir" onPress={() => onPick(null)} />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <FormField testID={`line-${index}-product-search`} label="Ürün" value={q} onChangeText={setQ} placeholder="Ürün adı, SKU ya da barkod (en az 2 harf)" autoCapitalize="none" autoCorrect={false} />
      {state === "loading" ? <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start" }} /> : null}
      {state === "error" ? <Text style={[type.caption, { color: colors.error }]}>Ürünler şu an aranamıyor.</Text> : null}
      {state === "ready" && !items.length ? <Text style={[type.caption, { color: colors.textTertiary }]}>Ürün bulunamadı.</Text> : null}
      {items.length ? (
        <View style={[styles.results, { borderColor: colors.border }]}>
          {items.map((p, i) => (
            <PressableScale
              key={p.id}
              testID={`line-${index}-product-${p.id}`}
              onPress={() => {
                haptic.select();
                onPick({ id: p.id, name: p.name });
                setQ("");
              }}
              style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            >
              <Text style={[type.callout, { color: colors.textPrimary }]} numberOfLines={1}>
                {p.name}
                {p.sku ? <Text style={{ color: colors.textTertiary }}>{`  ·  ${p.sku}`}</Text> : null}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ManualExpenseScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const mayWrite = canManage(user, "billing");
  const today = istanbulToday();

  const [caps, setCaps] = useState<UiCapabilities>(NO_CAPS);
  const [moduleOn, setModuleOn] = useState(true);
  const [metaReady, setMetaReady] = useState(false);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[] | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");

  const [f, setF] = useState<ManualForm>({
    supplierMode: "new",
    partyId: "",
    name: "",
    taxId: "",
    documentNumber: "",
    issueDate: today,
    dueDate: "",
    categoryId: "",
    lines: [emptyLine()],
    warehouseId: "",
  });
  const [issueText, setIssueText] = useState(trDate(today));
  const [dueText, setDueText] = useState("");
  const set = (patch: Partial<ManualForm>) => setF((p) => ({ ...p, ...patch }));
  const setLine = (i: number, patch: Partial<ManualLineInput>) => setF((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const [tried, setTried] = useState(false);
  const [pv, setPv] = useState<{ status: "idle" | "loading" | "ready" | "error"; data: ManualPreview | null; message: string; key: string }>({ status: "idle", data: null, message: "", key: "" });
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "info" | "warn" | "bad"; text: string; final?: boolean } | null>(null);
  const draftRef = useRef<string | null>(null);
  const keyRef = useRef(newIdempotencyKey("mpur"));
  const seq = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    Promise.all([getUiCapabilities(token), getExpenseModuleEnabled(token), getSupplierParties(token), getExpenseCategories(token).catch(() => null)])
      .then(([c, m, s, cats]) => {
        if (!live) return;
        setCaps(c);
        setModuleOn(m);
        setSuppliers(s);
        setCategories(cats);
        if (s.length) set({ supplierMode: "existing" });
      })
      .finally(() => live && setMetaReady(true));
    return () => {
      live = false;
    };
  }, [token]);

  // Tarih metinleri forma ISO olarak yansır.
  useEffect(() => set({ issueDate: isoOf(issueText) }), [issueText]);
  useEffect(() => set({ dueDate: isoOf(dueText) }), [dueText]);

  const stockOwner = caps.inventoryOwner?.owner || null;
  const built = useMemo(() => buildManualPayload(f), [f]);
  const bodyKey = built.body ? JSON.stringify(built.body) : "";
  const debouncedKey = useDebounce(bodyKey, 500);
  // DRAFT_CHANGED sonrası aynı gövdeyle önizleme yeniden istenir (gövde değişmediği için anahtar tek başına tetiklemez).
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!token || !built.body || debouncedKey !== bodyKey) {
      if (!built.body) {
        seq.current += 1;
        setPv({ status: "idle", data: null, message: "", key: "" });
      }
      return;
    }
    const my = ++seq.current;
    setPv((p) => ({ ...p, status: "loading", key: bodyKey }));
    previewManualPurchase(token, built.body, draftRef.current)
      .then((data) => {
        if (my !== seq.current) return;
        if (data.draftId) draftRef.current = data.draftId;
        setPv({ status: "ready", data, message: "", key: bodyKey });
      })
      .catch((e) => {
        if (my !== seq.current) return;
        if (e?.code === "DRAFT_NOT_FOUND" || e?.code === "DRAFT_ALREADY_CONFIRMED") {
          draftRef.current = null;
          keyRef.current = newIdempotencyKey("mpur");
        }
        setPv({ status: "error", data: null, message: manualErrorText(e, "Toplam şu anda hesaplanamadı. Biraz sonra yeniden deneyin."), key: bodyKey });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, token, refreshNonce]);

  const fresh = pv.status === "ready" && pv.key === bodyKey;
  const canConfirm = fresh && pv.data?.canConfirm === true && !saving && !outcome?.final;
  const stock = fresh ? pv.data?.stock || null : null;
  const hasProductLine = f.lines.some((l) => l.kind === "product");
  const displayTotal = f.lines.reduce((s, l) => s + (lineTotal(l) || 0), 0);

  const save = async (pay: boolean) => {
    setTried(true);
    if (!token || busy.current || !canConfirm || !pv.data) return;
    busy.current = true;
    setSaving(true);
    setOutcome(null);
    try {
      const res = await confirmManualPurchase(token, pv.data.draftId, pv.data.decisionDigest, keyRef.current);
      const st = String(res?.status || "");
      if (st === "APPLIED") {
        toast("Gider faturası kaydedildi.", "success");
        const ref = res?.result?.payable_ref || null;
        if (pay && ref) router.replace({ pathname: "/expenses/pay", params: { ref, title: f.documentNumber.trim() } });
        else router.back();
        return;
      }
      if (st === "IN_PROGRESS") setOutcome({ tone: "info", text: "Kayıt işleniyor. Birkaç saniye sonra Gider faturaları listesinden kontrol edin; aynı faturayı yeniden göndermeyin.", final: true });
      else if (st === "NEEDS_REVIEW") setOutcome({ tone: "warn", text: "Kayıt tamamlanamadı ve inceleme gerekiyor. Aynı faturayı yeniden girmeden önce destek ekibine bildirin.", final: true });
      else setOutcome({ tone: "bad", text: res?.detail || "Kayıt yapılamadı." });
    } catch (e: any) {
      const status = Number(e?.status || 0);
      if (status >= 400 && status < 500 && status !== 429) {
        keyRef.current = newIdempotencyKey("mpur");
        setOutcome({ tone: "bad", text: manualErrorText(e, "Kayıt yapılamadı.") });
        if (e?.code === "DRAFT_CHANGED") setRefreshNonce((n) => n + 1);
      } else if (status === 429) setOutcome({ tone: "bad", text: manualErrorText(e) });
      else setOutcome({ tone: "warn", text: "Kaydın sonucu belirsiz. Aynı faturayı yeniden girmeden önce Gider faturaları listesini kontrol edin.", final: true });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const err = (k: string, text: string) => (tried && built.problems.includes(k) ? text : undefined);
  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLocaleLowerCase("tr-TR");
    return (q ? suppliers.filter((s) => s.name.toLocaleLowerCase("tr-TR").includes(q)) : suppliers).slice(0, 6);
  }, [suppliers, supplierQuery]);
  const chosenSupplier = suppliers.find((s) => s.id === f.partyId) || null;

  if (!mayWrite) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Yeni gider faturası" />
        <EmptyState icon={<ReceiptIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Gider faturası girmek için fatura yönetimi yetkisi gerekir." />
      </View>
    );
  }
  if (!metaReady) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Yeni gider faturası" />
        <FormSkeleton fields={5} label="Form hazırlanıyor" />
      </View>
    );
  }
  if (!moduleOn || !caps.manualEntry) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="Yeni gider faturası" />
        <EmptyState
          icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
          title="Elle giriş kapalı"
          description={(!moduleOn ? REASON_TEXT.EXPENSE_MODULE_DISABLED : caps.manualEntryReason && REASON_TEXT[caps.manualEntryReason]) || "Bu hesapta elle gider girişi şu an kullanılamıyor."}
        />
      </View>
    );
  }

  const totals = fresh ? pv.data?.totals : null;
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="manual-expense-screen">
      <StackHeader title="Yeni gider faturası" subtitle="Alış ya da gider belgesi" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="violet">
            <Text style={styles.heroLabel}>{totals ? "Ödenecek toplam" : "Tahmini tutar (KDV hariç)"}</Text>
            <Text testID="manual-total" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {totals ? formatMoney(totals.payable, "TRY") : formatMoney(displayTotal, "TRY")}
            </Text>
            <Text style={styles.heroHint}>
              {pv.status === "loading" ? "Sunucu toplamı hesaplıyor…" : totals ? `Matrah ${formatMoney(totals.taxable, "TRY")} · KDV ${formatMoney(totals.vat, "TRY")}` : "Bilgiler tamamlanınca toplamı sunucu hesaplar."}
            </Text>
          </HeroCard>

          {caps.parasutConnected ? (
            <View style={[styles.notice, { backgroundColor: colors.warningBg }]} testID="parasut-warning">
              <AlertIcon size={16} color={colors.amber} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{PARASUT_WARNING}</Text>
            </View>
          ) : null}

          <SectionTitle title="Tedarikçi" />
          <View style={styles.form}>
            {suppliers.length ? (
              <OptionChips
                testIDPrefix="supplier-mode"
                options={[
                  { value: "existing" as const, label: "Kayıtlı tedarikçi" },
                  { value: "new" as const, label: "Yeni tedarikçi" },
                ]}
                value={f.supplierMode}
                onChange={(v) => set({ supplierMode: v })}
              />
            ) : null}
            {f.supplierMode === "existing" && suppliers.length ? (
              chosenSupplier ? (
                <View style={[styles.picked, { backgroundColor: colors.primarySoft }]} testID="supplier-picked">
                  <CheckIcon size={16} color={colors.primary} />
                  <Text style={[type.callout, { color: colors.textPrimary, flex: 1, fontWeight: "600" }]} numberOfLines={1}>
                    {chosenSupplier.name}
                  </Text>
                  <Button size="sm" variant="ghost" label="Değiştir" onPress={() => set({ partyId: "" })} />
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  <FormField testID="supplier-search" label="Tedarikçi ara" value={supplierQuery} onChangeText={setSupplierQuery} placeholder="Tedarikçi adı" error={err("supplier", "Bir tedarikçi seçin.")} />
                  <View style={[styles.results, { borderColor: colors.border }]}>
                    {filteredSuppliers.map((s, i) => (
                      <PressableScale
                        key={s.id}
                        testID={`supplier-${s.id}`}
                        onPress={() => {
                          haptic.select();
                          set({ partyId: s.id });
                        }}
                        style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                      >
                        <Text style={[type.callout, { color: colors.textPrimary }]} numberOfLines={1}>
                          {s.name}
                        </Text>
                      </PressableScale>
                    ))}
                    {!filteredSuppliers.length ? <Text style={[type.caption, styles.result, { color: colors.textTertiary }]}>Eşleşen tedarikçi yok.</Text> : null}
                  </View>
                </View>
              )
            ) : (
              <>
                <FormField
                  testID="supplier-name"
                  label="Tedarikçi adı"
                  value={f.name}
                  onChangeText={(v) => set({ name: v })}
                  maxLength={200}
                  error={err("supplier", "Tedarikçi adını girin; vergi no girerseniz 10 ya da 11 hane olmalı.")}
                />
                <FormField testID="supplier-tax" label="VKN/TCKN (isteğe bağlı)" value={f.taxId} onChangeText={(v) => set({ taxId: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={11} hint="Girerseniz 10 ya da 11 hane" />
              </>
            )}
          </View>

          <SectionTitle title="Belge" />
          <View style={styles.form}>
            <FormField testID="doc-number" label="Belge no" value={f.documentNumber} onChangeText={(v) => set({ documentNumber: v })} maxLength={32} autoCapitalize="characters" error={err("documentNumber", "Belge numarasını girin.")} />
            <FormField testID="issue-date" label="Fatura tarihi" value={issueText} onChangeText={setIssueText} placeholder="GG.AA.YYYY" error={err("issueDate", "Geçerli bir tarih girin (GG.AA.YYYY).")} />
            <View style={{ gap: spacing.xs }}>
              <FormField testID="due-date" label="Vade tarihi (isteğe bağlı)" value={dueText} onChangeText={setDueText} placeholder="GG.AA.YYYY" error={err("dueDate", "Vade, fatura tarihinden önce olamaz.")} />
              {/^\d{4}-\d{2}-\d{2}$/.test(f.issueDate) ? (
                <View style={{ marginHorizontal: -spacing.lg }}>
                  <ChipRow>
                    <Chip testID="due-none" label="Vadesiz" selected={!dueText} onPress={() => setDueText("")} />
                    {[15, 30, 60].map((d) => (
                      <Chip key={d} testID={`due-${d}`} label={`${d} gün`} selected={f.dueDate === addDays(f.issueDate, d)} onPress={() => setDueText(trDate(addDays(f.issueDate, d)))} />
                    ))}
                  </ChipRow>
                </View>
              ) : null}
            </View>
          </View>

          <SectionTitle title="Gider kategorisi" />
          {categories === null ? (
            <Text style={[type.caption, styles.pad, { color: colors.textTertiary }]}>Kategoriler yüklenemedi; kategorisiz kaydedebilirsiniz.</Text>
          ) : (
            <ChipRow>
              <Chip testID="cat-none" label="Kategorisiz" selected={!f.categoryId} onPress={() => set({ categoryId: "" })} />
              {categories.map((c) => (
                <Chip key={c.id} testID={`cat-${c.id}`} label={c.name} selected={f.categoryId === c.id} onPress={() => set({ categoryId: c.id })} />
              ))}
            </ChipRow>
          )}

          <SectionTitle title="Kalemler" action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${f.lines.length} satır`}</Text>} />
          {stockOwner === "accounting" ? (
            <View style={[styles.notice, { backgroundColor: colors.surfaceMuted }]} testID="inventory-owned-notice">
              <PackageIcon size={16} color={colors.textSecondary} />
              <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>
                Stok sahibi muhasebe programınız; mal girişini orada yapın. Bu faturadaki ürünler gider olarak kaydedilir, stok değişmez.
              </Text>
            </View>
          ) : null}
          {tried && built.problems.includes("lines") ? <Text style={[type.caption, styles.pad, { color: colors.error }]}>Her satırda açıklama, miktar ve birim fiyat olmalı; fiyat ve iskonto en çok 2 ondalık, ör. 1.234,56.</Text> : null}
          {tried && built.problems.includes("product") ? <Text style={[type.caption, styles.pad, { color: colors.error }]}>Ürün satırı için katalogdan bir ürün seçin.</Text> : null}
          {built.problems.includes("productQuantity") ? (
            <Text style={[type.caption, styles.pad, { color: colors.error }]}>Stoğa girecek satırın miktarı tam sayı olmalı.</Text>
          ) : null}
          {f.lines.map((l, i) => {
            const total = lineTotal(l);
            return (
              <SafeAnimatedView key={i} entering={FadeInDown.duration(300)}>
                <Card style={styles.lineCard}>
                  <View style={styles.lineHead}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>{`Satır ${i + 1}`}</Text>
                    <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "700" }]}>{total !== null ? formatMoney(total, "TRY") : "—"}</Text>
                    {f.lines.length > 1 ? (
                      <PressableScale
                        testID={`line-${i}-delete`}
                        accessibilityRole="button"
                        accessibilityLabel={`Satır ${i + 1} sil`}
                        onPress={() => set({ lines: f.lines.filter((_, j) => j !== i) })}
                        hitSlop={8}
                        style={styles.del}
                      >
                        <TrashIcon size={16} color={colors.error} />
                      </PressableScale>
                    ) : null}
                  </View>
                  {stockOwner === "obihub" ? (
                    <OptionChips
                      testIDPrefix={`line-${i}-kind`}
                      options={KINDS}
                      value={l.kind}
                      onChange={(v) => setLine(i, { kind: v, ...(v === "service" ? { productId: "", productName: "" } : {}) })}
                    />
                  ) : null}
                  {stockOwner === "obihub" && l.kind === "product" && token ? (
                    <ProductPicker
                      token={token}
                      index={i}
                      value={l.productId ? { id: l.productId, name: l.productName } : null}
                      onPick={(p) => setLine(i, p ? { productId: p.id, productName: p.name, ...(l.description.trim() ? {} : { description: p.name }) } : { productId: "", productName: "" })}
                    />
                  ) : null}
                  <FormField testID={`line-${i}-desc`} label="Açıklama" value={l.description} onChangeText={(v) => setLine(i, { description: v })} maxLength={200} />
                  <View style={styles.row2}>
                    <FormField testID={`line-${i}-qty`} label="Miktar" value={l.quantity} onChangeText={(v) => setLine(i, { quantity: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
                    <FormField testID={`line-${i}-price`} label="Birim fiyat" value={l.unitPrice} onChangeText={(v) => setLine(i, { unitPrice: v })} keyboardType="decimal-pad" placeholder="0,00" suffix="₺" style={{ flex: 1.4 }} />
                  </View>
                  <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>KDV</Text>
                  <OptionChips testIDPrefix={`line-${i}-vat`} options={VAT} value={l.vatRate} onChange={(v) => setLine(i, { vatRate: v })} />
                  <FormField testID={`line-${i}-discount`} label="İskonto (isteğe bağlı)" value={l.discount} onChangeText={(v) => setLine(i, { discount: v })} keyboardType="decimal-pad" placeholder="0,00" suffix="₺" />
                </Card>
              </SafeAnimatedView>
            );
          })}
          <View style={styles.pad}>
            <Button testID="line-add" variant="secondary" label="Satır ekle" icon={<PlusIcon size={16} color={colors.textPrimary} />} onPress={() => set({ lines: [...f.lines, emptyLine()] })} />
          </View>

          {stockOwner === "obihub" && hasProductLine && stock?.entry ? (
            stock.warehouses.length > 1 ? (
              <>
                <SectionTitle title="Depo" />
                <ChipRow>
                  {stock.warehouses.map((w) => (
                    <Chip key={w.id} testID={`wh-${w.id}`} label={w.name} selected={(f.warehouseId || stock.warehouseId) === w.id} onPress={() => set({ warehouseId: w.id })} />
                  ))}
                </ChipRow>
              </>
            ) : stock.warehouses.length === 1 ? (
              <Text style={[type.caption, styles.pad, { color: colors.textSecondary }]} testID="warehouse-note">{`Ürün satırları ${stock.warehouses[0].name} deposuna girer.`}</Text>
            ) : null
          ) : null}

          <Text style={[type.caption, styles.pad, { color: colors.textTertiary, marginTop: spacing.md }]}>
            KDV tevkifatı ya da KDV dışı vergi (ÖTV, konaklama vergisi) içeren faturaları web panelinden girin.
          </Text>

          {fresh && (pv.data?.blockers.length || pv.data?.reviews.length) ? (
            <View style={styles.pad}>
              {[...(pv.data?.blockers || []).map((t) => ({ t, bad: true })), ...(pv.data?.reviews || []).map((t) => ({ t, bad: false }))].map((x, i) => (
                <View key={i} style={[styles.notice, { marginHorizontal: 0, backgroundColor: x.bad ? colors.errorBg : colors.warningBg }]}>
                  <AlertIcon size={16} color={x.bad ? colors.error : colors.amber} />
                  <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{x.t}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {pv.status === "error" ? (
            <View style={[styles.notice, { backgroundColor: colors.errorBg }]}>
              <AlertIcon size={16} color={colors.error} />
              <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{pv.message}</Text>
            </View>
          ) : null}
          {outcome ? (
            <View
              testID="manual-outcome"
              accessibilityRole="alert"
              style={[styles.notice, { backgroundColor: outcome.tone === "bad" ? colors.errorBg : outcome.tone === "warn" ? colors.warningBg : colors.infoBg }]}
            >
              <AlertIcon size={16} color={outcome.tone === "bad" ? colors.error : outcome.tone === "warn" ? colors.amber : colors.info} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{outcome.text}</Text>
            </View>
          ) : null}

          <View style={[styles.form, { marginTop: spacing.lg }]}>
            <Button
              testID="manual-save"
              label={saving ? "Kaydediliyor…" : "Kaydet"}
              icon={<CheckIcon size={18} color="#FFFFFF" />}
              busy={saving}
              disabled={!canConfirm && !!built.body}
              onPress={() => save(false)}
            />
            {caps.payablePayment ? (
              <Button testID="manual-save-pay" variant="secondary" label="Kaydet ve ödeme ekle" disabled={!canConfirm} onPress={() => save(true)} />
            ) : null}
            {built.body && !fresh && pv.status === "loading" ? (
              <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>Toplam hesaplanınca kaydedebilirsiniz.</Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, fontWeight: "800", letterSpacing: -0.6, marginTop: 2 },
  heroHint: { color: ON_HERO.soft, fontSize: 12, marginTop: spacing.xs },
  notice: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md },
  pad: { paddingHorizontal: spacing.lg },
  picked: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.sm, borderRadius: radius.md, minHeight: 44 },
  results: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  result: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, justifyContent: "center" },
  lineCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, gap: spacing.sm },
  lineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  del: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  row2: { flexDirection: "row", gap: spacing.sm },
});
