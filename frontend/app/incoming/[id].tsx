// Dalga 3 / C1 — gelen e-fatura "İçeri Al". Web: components/QuickImportWorkspace.jsx (tek ekran, tek soru + dolu form).
// Akış: (durum-önce kapısı) → önizleme (gider olarak) → kullanıcı kararları (tedarikçi, satır türü/ürün, stok + depo, vade,
// kategori) → her kararda yeni önizleme → Kaydet (son başarılı önizlemenin özetleriyle) → sonuç. PDF de bu ekrandan açılır.
// Parametreler: id (liste satırı kimliği), provider (parasut | turkcell-efatura), status (import_status), reimportable, title.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getIncomingInvoicePdf } from "../../src/api";
import { getUiCapabilities, respondInbox } from "../../src/api-gider";
import { getCashAccounts } from "../../src/api";
import { respondDoneText } from "../../src/inbox-ui";
import { RespondSheet } from "../../src/components/RespondSheet";
import {
  answerArgs,
  canCreateSupplier,
  collectIssues,
  kurusNotice,
  newCardCount,
  acceptGate,
  paymentMissing,
  paymentResultText,
  paymentStates,
  discountText,
  vatIncludedNote,
  quickExpenseNotice,
  plannedNotice,
  REMEMBER_TEXT,
  rememberErrorAction,
  rememberProducts,
  stockUnavailableText,
  type RememberedLine,
  confirmErrorOutcome,
  confirmOutcome,
  confirmQuickImport,
  EMPTY_CHOICE,
  getQuickImportCapability,
  LEGACY_DUPLICATE,
  getQuickImportCategories,
  getQuickImportStatus,
  INITIAL_ARGS,
  isStatusOnly,
  previewQuickImport,
  rejectionOf,
  rejectionText,
  RESULT_TEXT,
  resultTextKey,
  statusOutcome,
  type ImportArgs,
  type ImportOutcome,
  type LineChoice,
} from "../../src/api-iceri-al";
import { openBase64Pdf } from "../../src/pdf";
import { haptic } from "../../src/haptics";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { todayIso } from "../../src/finance";
import { AlertIcon, CheckIcon, ClockIcon, DownloadIcon, InboxIcon, PackageIcon, ReceiptIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { PressableScale } from "../../src/components/KPICard";
import { FadeInDown, SafeAnimatedView } from "../../src/components/SafeAnimatedView";
import { Skeleton } from "../../src/components/Skeleton";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { DetailHero, type HeroStat } from "../../src/ui/DetailHero";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { ON_HERO } from "../../src/ui/HeroCard";
import { Card, SectionTitle } from "../../src/ui/ListRow";

const POLL_MS = 5000;
const POLL_LIMIT_MS = 120000;
const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const shortDate = (iso: string) => {
  const t = Date.parse(iso.slice(0, 10) + "T12:00:00Z");
  return Number.isNaN(t) ? iso : new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(t));
};

// Satırın seçili değeri ve seçenekleri (web Workspace lineValue / lineOptions).
function lineValue(l: any): string {
  if (!l.kind) return "";
  if (l.kind === "service") return "service";
  const p = l.product || {};
  if (p.selected_id) return `p:${p.selected_id}`;
  if (p.remember_selected) return "new";
  if ((p.candidates || []).length) return "";
  if (p.state === "matched") return "matched";
  return "product";
}
function lineOptions(l: any): { value: string; label: string }[] {
  const p = l.product || {};
  const cands: any[] = p.candidates || [];
  const out: { value: string; label: string }[] = [];
  if (cands.length) for (const c of cands) out.push({ value: `p:${c.id}`, label: `${c.label || "Adsız ürün"}${c.sku ? ` · ${c.sku}` : ""}` });
  else if (l.kind === "product" && p.state === "matched") out.push({ value: "matched", label: "Kayıtlı ürün" });
  else {
    out.push({ value: "product", label: "Ürün (eşleşme yok)" });
    out.push({ value: "new", label: "Yeni ürün olarak ekle" });
  }
  out.push({ value: "service", label: "Hizmet / gider" });
  return out;
}

function PreviewSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }} accessibilityLabel="Önizleme hazırlanıyor">
      <View style={[styles.skHero, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
        <Skeleton width="45%" height={30} style={{ marginTop: spacing.sm }} />
      </View>
      <Skeleton height={44} borderRadius={radius.md} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={64} borderRadius={radius.md} />
      ))}
    </View>
  );
}

export default function IncomingImportScreen() {
  const params = useLocalSearchParams<{ id: string; provider: string; status?: string; reimportable?: string; title?: string; pdf?: string; respond?: string; block?: string; blockDetail?: string }>();
  const id = String(params.id || "");
  const provider = String(params.provider || "");
  const rowStatus = String(params.status || "none");
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm: ask } = useFeedback();
  const mayWrite = canManage(user, "billing");

  const [gate, setGate] = useState<"checking" | "status" | "preview" | "off">("checking");
  const [confirmOn, setConfirmOn] = useState(false);
  const [args, setArgs] = useState<ImportArgs>(INITIAL_ARGS);
  const [decision, setDecision] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState<null | "rate" | "server" | "view">(null);
  const [rejection, setRejection] = useState<{ code: string; detail: string } | null>(null);
  const [categories, setCategories] = useState<{ id: string | null; name: string }[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pollExpired, setPollExpired] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const seq = useRef(0);
  const committed = useRef<ImportArgs | null>(null);
  // Son başarılı isteğin "kullanıcı depo kararı verdi" bilgisi; başarısız denemede bununla birlikte geri alınır.
  const committedTouched = useRef(false);
  const decisionRef = useRef<any>(null);
  const loadingRef = useRef(false);
  const confirmingRef = useRef(false);
  const savingRef = useRef(false);
  const warehouseTouched = useRef(false);
  // Paraşüt akışı (15 Kas 2026): tek soru → (Evet) depo + remember-products → dolu gider formu.
  const [answer, setAnswer] = useState<null | "yes" | "no">(null);
  const [formOpen, setFormOpen] = useState(false);
  const [remembered, setRemembered] = useState<Record<number, RememberedLine>>({});
  const [pickedWh, setPickedWh] = useState<string | null>(null);
  const [rememberBusy, setRememberBusy] = useState(false);
  const [rememberError, setRememberError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ownerAccounting, setOwnerAccounting] = useState(false);
  const navigation = useNavigation();
  // D-17: onay bekleyen ticari faturaya Kabul et / Reddet (GİB'e gider, geri alınamaz; onay penceresiyle).
  const [respondOpen, setRespondOpen] = useState<null | "accept" | "reject">(null);
  const [responded, setResponded] = useState<string | null>(null);
  const canRespond = params.respond === "1" && canManage(user, "billing") && !responded;

  // Önizleme: başarısız denemede seçimler son başarılı isteğe döner (ekrandaki görünümle eşleşsin).
  const load = useCallback(
    async (next: ImportArgs) => {
      if (!token || !id) return;
      const my = ++seq.current;
      setArgs(next);
      setLoading(true);
      loadingRef.current = true;
      try {
        const res = await previewQuickImport(token, id, next, confirmOn);
        if (my !== seq.current) return;
        setRejection(null);
        if (res?.document_view_error || !res?.document_view) {
          if (decisionRef.current && committed.current) {
            setArgs(committed.current);
            warehouseTouched.current = committedTouched.current;
            setStale("view");
          } else setFailed(true);
        } else {
          committed.current = next;
          committedTouched.current = warehouseTouched.current;
          decisionRef.current = res;
          setDecision(res);
          setFailed(false);
          setStale(null);
        }
      } catch (e: any) {
        if (my !== seq.current) return;
        setRejection(rejectionOf(e));
        if (decisionRef.current && committed.current) {
          setArgs(committed.current);
          warehouseTouched.current = committedTouched.current;
          setStale(Number(e?.status) === 429 ? "rate" : "server");
        } else setFailed(true);
      } finally {
        if (my === seq.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [token, id, confirmOn]
  );

  // Kapı: yetenek → (satır durumu kayıtlıysa) önce durum → önizleme.
  useEffect(() => {
    if (!token || !id) return;
    let live = true;
    (async () => {
      const cap = await getQuickImportCapability(token, provider);
      if (!live) return;
      if (!cap) return setGate("off");
      setConfirmOn(cap.confirm);
      if (cap.confirm) getQuickImportCategories(token).then((c) => live && setCategories(c)).catch(() => live && setCategories(null));
      getUiCapabilities(token).then((c) => live && setOwnerAccounting(c.inventoryOwner?.owner === "accounting"));
      const reimportable = params.reimportable === "1";
      if (rowStatus !== "none" && (isStatusOnly(rowStatus, reimportable) || rowStatus === "reversed")) {
        try {
          const st = statusOutcome(await getQuickImportStatus(token, id));
          if (!live) return;
          if (st && st.status !== "NONE" && !(st.status === "REVERSED" && st.reimportable)) {
            setOutcome(st);
            return setGate("status");
          }
        } catch {
          // Durum okunamazsa önizleme açılır; sunucu önizlemede de önceki içeri almayı engeller.
        }
      }
      setGate("preview");
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, provider]);

  useEffect(() => {
    if (gate === "preview" && !decisionRef.current) load(INITIAL_ARGS);
  }, [gate, load]);

  // İşlem sürerken durum 5 sn'de bir, en çok 2 dk sorulur. Bir istek bitmeden sonraki başlamaz (setTimeout zinciri);
  // ekran kapanır ya da sonuç değişirse yanıt yok sayılır.
  useEffect(() => {
    if (outcome?.status !== "IN_PROGRESS" || !token) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    const tick = async () => {
      if (!live) return;
      if (Date.now() - started > POLL_LIMIT_MS) {
        setPollExpired(true);
        return;
      }
      try {
        const st = statusOutcome(await getQuickImportStatus(token, id));
        if (!live) return;
        if (st && st.status !== "IN_PROGRESS" && st.status !== "NONE") {
          setOutcome(st);
          if (st.status === "APPLIED") haptic.success();
          return;
        }
      } catch {
        // bir sonraki turda yeniden sorulur
      }
      if (live) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [outcome?.status, token, id]);

  const view = decision?.document_view || null;
  const issues = useMemo(() => collectIssues(decision, view), [decision, view]);
  const doc = view?.document || {};
  const supplier = view?.supplier || {};
  const decisions = view?.decisions || {};
  const wh = decisions.warehouse || {};
  const stockAction = decisions.stock_action || {};
  const currency = String(doc.currency || decision?.document_summary?.currency || "TRY");
  const stockOn = args.mode === "expense_and_stock";
  const allFixes = issues.filter((i) => i.kind === "fix");
  const fixes = allFixes.filter((f, i) => f.line == null || allFixes.findIndex((g) => g.line === f.line) === i);
  const blocking = issues.filter((i) => i.kind === "document" || i.kind === "state" || i.kind === "system");
  // Olası mükerrer eski kayıt: açık kabul kutusu (kabul edilince önizleme legacy_duplicate_ack ile yenilenir, madde kalkar).
  const showLegacyAck = issues.some((i) => i.kind === "ack") || args.legacyAck;
  const ready = !stale && !loading && decision?.status === "FAST_READY" && decision?.business_ready === true && !issues.some((i) => i.kind !== "notice");
  const canSave =
    formOpen && confirmOn && decision?.confirmation_available === true && decision?.can_confirm === true && ready && !confirming && mayWrite && !paymentMissing(args.form);
  // Kullanıcı tedarikçiyi seçtikten sonra durum "matched" olur; seçim görünür ve değiştirilebilir kalsın.
  // D-18k: VKN ile eşleşen kayıtlı cari varsa "Yeni cari" önerilmez.
  const createOk = canCreateSupplier(view);
  const supplierBlock =
    (supplier.state !== "matched" || Boolean(args.supplierId) || args.createSupplier) && ((supplier.candidates || []).length > 0 || createOk);
  const stockLines = (view?.lines || []).filter((l: any) => l.kind === "product" && l.stock?.eligible);

  // ---- Kararlar (web useQuickImportPreview) ----
  const withChoice = (index: number, patch: Partial<LineChoice>) => {
    const next = [...args.lineChoices];
    while (next.length <= index) next.push({ ...EMPTY_CHOICE });
    next[index] = { ...next[index], ...patch };
    return next;
  };
  const busyNow = () => loadingRef.current || confirmingRef.current;
  const chooseLine = (index: number, value: string) => {
    if (busyNow()) return;
    let patch: Partial<LineChoice>;
    if (value === "service") patch = { kind: "service", product_id: null, new_product_draft: false, stock: null };
    else if (value.startsWith("p:")) patch = { kind: "product", product_id: value.slice(2), new_product_draft: false, stock: stockOn ? true : null };
    else if (value === "new") patch = { kind: "product", product_id: null, new_product_draft: true };
    else patch = { kind: "product", stock: stockOn ? true : null };
    load({ ...args, lineChoices: withChoice(index, patch) });
  };
  const chooseStock = (on: boolean) => {
    if (busyNow() || on === stockOn) return;
    const productIdx = (view?.lines || []).filter((l: any) => l.kind === "product").map((l: any) => l.index as number);
    let next = [...args.lineChoices];
    for (const i of productIdx) {
      while (next.length <= i) next.push({ ...EMPTY_CHOICE });
      next[i] = { ...next[i], kind: "product", stock: on ? true : null };
    }
    if (!on) {
      next = next.map((c) => ({ ...c, stock: c.stock === true ? null : c.stock }));
      warehouseTouched.current = false;
    }
    load({ ...args, mode: on ? "expense_and_stock" : "expense_only", lineChoices: next, warehouseId: on ? args.warehouseId : null });
  };
  const chooseSupplier = (sid: string | null, create: boolean) => {
    if (busyNow()) return;
    load({ ...args, supplierId: sid, createSupplier: sid ? false : create });
  };
  const chooseWarehouse = (wid: string) => {
    if (busyNow()) return;
    warehouseTouched.current = true;
    load({ ...args, warehouseId: wid });
  };
  const chooseDue = (due: string | null) => {
    if (busyNow() || due === args.form.due_date) return;
    load({ ...args, form: { ...args.form, due_date: due } });
  };
  // Ödeme durumu (İçeri Al 2): Ödendi'de hesap + tarih; ödeme alanları önizleme özetine girmez, onay aynısını gönderir.
  const choosePayment = (patch: Partial<typeof args.form>) => {
    if (busyNow()) return;
    load({ ...args, form: { ...args.form, ...patch } });
  };
  const [payAccounts, setPayAccounts] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (!token || args.form.payment_state !== "paid" || payAccounts) return;
    getCashAccounts(token)
      .then((rows: any[]) =>
        setPayAccounts(rows.filter((a) => a?.id && String(a.currency || "TRY").toUpperCase() === "TRY" && a.is_active !== false).map((a) => ({ id: String(a.id), name: String(a.name || "Hesap") })))
      )
      .catch(() => setPayAccounts([]));
  }, [token, args.form.payment_state, payAccounts]);
  const chooseCategory = (cid: string | null) => {
    if (busyNow() || cid === args.form.expense_category_id) return;
    load({ ...args, form: { ...args.form, expense_category_id: cid } });
  };

  // Tek depo otomatik seçimi: stok açık, liste tam, tek aktif depo, kullanıcı karar vermemiş.
  useEffect(() => {
    if (!stockOn || args.warehouseId || warehouseTouched.current || !wh) return;
    const options = wh.options || [];
    if (wh.required !== true || wh.selection_available !== true || wh.options_complete !== true || wh.selected_id) return;
    if (options.length !== 1 || options[0].outside_list || !options[0].id) return;
    load({ ...args, warehouseId: options[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  // ---- Paraşüt akışı ----
  const chooseAnswer = (a: "yes" | "no") => {
    if (busyNow() || !view) return;
    setAnswer(a);
    setRememberError(null);
    setFormOpen(a === "no");
    warehouseTouched.current = false;
    load(answerArgs(committed.current || args, view, a));
  };
  const expenseOnly = (text: string | null) => {
    setAnswer("no");
    setFormOpen(true);
    setNotice(text);
    if (view) load(answerArgs(committed.current || args, view, "no"));
  };
  // Stok sahibi muhasebe programıysa soru sorulmaz (Hayır gibi, bilgi notu).
  useEffect(() => {
    if (ownerAccounting && view && answer === null && !loading) expenseOnly(REMEMBER_TEXT.ownerAccounting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerAccounting, view, answer, loading]);
  const whOptions: any[] = (wh.options || []).filter((o: any) => o?.id);
  const whPicked = pickedWh || args.warehouseId || wh.selected_id || (whOptions.length === 1 ? whOptions[0].id : null);
  const continueWarehouse = async () => {
    if (!token || rememberBusy || loading) return;
    setRememberBusy(true);
    setRememberError(null);
    try {
      setRemembered(await rememberProducts(token, id));
      setFormOpen(true);
      if (whPicked) warehouseTouched.current = true;
      load({ ...(committed.current || args), warehouseId: whPicked || null });
    } catch (e: any) {
      const act = rememberErrorAction(e);
      if ("expenseOnly" in act) expenseOnly(REMEMBER_TEXT.ownerAccounting);
      else setRememberError(act.message);
    } finally {
      setRememberBusy(false);
    }
  };
  // İçeri Al 2 (Kıyas 2): remember-products yalnız plan döndürür; kartlar KAYDET'te açılır (REJECTED'de geri silinir).
  // Kaydetmeden çıkışta katalogda kart kalmaz, çıkış uyarısı gerekmez.
  const plannedCards = newCardCount(remembered);

  const save = async () => {
    const d = decisionRef.current;
    const c = committed.current;
    if (!token || confirmingRef.current || savingRef.current || !d || !c || !canSave) return;
    // Onay sayfası açıkken ikinci dokunuş yeni sayfa açmasın.
    savingRef.current = true;
    const ok = await ask({
      title: "Fatura içeri alınsın mı?",
      message:
        `${supplier.name || "Tedarikçi"} faturası ${formatMoney(doc.legal_payable ?? decision?.document_summary?.payable, currency)} tutarla gider olarak${stockOn ? " ve stoğa" : ""} kaydedilir; tedarikçiye borç yazılır.` +
        (args.form.payment_state === "paid"
          ? ` Borcun tamamı ${(payAccounts || []).find((a) => a.id === args.form.payment_account_id)?.name || "seçilen hesaptan"} ödenmiş olarak yazılır (${args.form.payment_date}).`
          : ""),
      confirmLabel: "İçeri al",
    });
    if (!ok) {
      savingRef.current = false;
      return;
    }
    confirmingRef.current = true;
    setConfirming(true);
    let result: ImportOutcome;
    try {
      result = confirmOutcome(await confirmQuickImport(token, id, d, c, confirmOn));
    } catch (e) {
      result = confirmErrorOutcome(e);
    }
    confirmingRef.current = false;
    savingRef.current = false;
    setConfirming(false);
    setPollExpired(false);
    setOutcome(result);
    if (result.status === "APPLIED") toast("Fatura kaydedildi.", "success");
  };

  const refreshStatus = async () => {
    if (!token) return;
    try {
      const st = statusOutcome(await getQuickImportStatus(token, id));
      if (st && st.status !== "NONE") setOutcome(st);
      else if (st?.status === "NONE") {
        setOutcome(null);
        load(committed.current || INITIAL_ARGS);
      }
    } catch {
      toast("Durum şu an okunamadı.", "error");
    }
  };

  const openPdf = async () => {
    if (!token || pdfBusy) return;
    setPdfBusy(true);
    try {
      const data = await getIncomingInvoicePdf(token, provider as any, String(params.pdf || id));
      if (!data) throw new Error("Fatura görüntüsü alınamadı.");
      await openBase64Pdf(data, `gelen-fatura-${doc.number || id}`);
    } catch (e: any) {
      toast(e?.message || "Fatura açılamadı.", "error");
    } finally {
      setPdfBusy(false);
    }
  };
  const pdfButton =
    provider === "parasut" || provider === "turkcell-efatura" ? (
      <Button testID="import-pdf" size="sm" variant="secondary" label="Faturayı görüntüle" icon={<DownloadIcon size={16} color={colors.textPrimary} />} busy={pdfBusy} onPress={openPdf} />
    ) : null;

  // İçeri Al 2 kabul kapısı: önizleme 409 kodu ya da gelen kutusu satırının import_block'u.
  const gateInfo = acceptGate(rejection?.code || params.block);
  const gateDetail = (rejection && acceptGate(rejection.code) ? rejection.detail : "") || String(params.blockDetail || "") || gateInfo?.fallback || "";
  const submitRespond = async (body: Record<string, unknown>) => {
    if (!token) return;
    const res = await respondInbox(token, provider, id, body);
    const text = respondDoneText(res, String(body.decision));
    toast(text, "success");
    setRespondOpen(null);
    setResponded(text);
    // Kabul tamamlandıysa içeri alma açılır: önizleme yeniden istenir (kuyruktaysa ACCEPT_PENDING gelir).
    if (body.decision === "accept") load(committed.current || INITIAL_ARGS);
  };
  const respondCard = canRespond ? (
    <View testID="import-respond" style={[styles.notice, styles.ackBox, { backgroundColor: colors.warningBg }]}>
      <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "flex-start" }}>
        <AlertIcon size={16} color={colors.amber} />
        <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>Bu ticari fatura yanıtınızı bekliyor. Kabul ya da red GİB üzerinden tedarikçiye gönderilir ve geri alınamaz.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button testID="import-respond-accept" size="sm" label="Kabul et" onPress={() => setRespondOpen("accept")} style={{ flex: 1 }} />
        <Button testID="import-respond-reject" size="sm" variant="secondary" label="Reddet" onPress={() => setRespondOpen("reject")} style={{ flex: 1 }} />
      </View>
    </View>
  ) : responded ? (
    <View testID="import-responded" style={[styles.notice, { backgroundColor: colors.infoBg }]}>
      <CheckIcon size={16} color={colors.info} />
      <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{responded}</Text>
    </View>
  ) : null;
  const respondSheet = <RespondSheet decision={respondOpen} subtitle={params.title ? String(params.title) : undefined} onClose={() => setRespondOpen(null)} onSubmit={submitRespond} />;

  const header = <StackHeader title="İçeri al" subtitle={params.title ? String(params.title) : undefined} />;

  // ---- Durumlar ----
  if (gate === "checking") {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        {header}
        <PreviewSkeleton />
      </View>
    );
  }
  if (gate === "off") {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        {header}
        {respondCard}
        <EmptyState icon={<InboxIcon size={30} color={colors.amber} />} title="İçeri alma kapalı" description="Bu fatura kaynağı için içeri alma şu an kullanılamıyor." />
        <View style={styles.pad}>{pdfButton}</View>
        {respondSheet}
      </View>
    );
  }
  if (outcome) {
    const key = resultTextKey(outcome, pollExpired);
    const [title, body] = RESULT_TEXT[key];
    const tone = outcome.status === "APPLIED" ? "good" : outcome.status === "IN_PROGRESS" ? "info" : outcome.status === "REVERSED" ? "neutral" : "bad";
    const tint = tone === "good" ? colors.successBg : tone === "info" ? colors.infoBg : tone === "neutral" ? colors.surfaceMuted : colors.warningBg;
    const fg = tone === "good" ? colors.success : tone === "info" ? colors.info : tone === "neutral" ? colors.textSecondary : colors.amber;
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="import-outcome">
        {header}
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <SafeAnimatedView entering={FadeInDown.duration(380)}>
            <View style={[styles.outcome, { backgroundColor: tint }]}>
              <View style={[styles.outcomeIcon, { backgroundColor: colors.surface }]}>
                {tone === "good" ? <CheckIcon size={26} color={fg} /> : tone === "info" ? <ClockIcon size={26} color={fg} /> : <AlertIcon size={26} color={fg} />}
              </View>
              <Text style={[type.title, { color: colors.textPrimary, textAlign: "center" }]} testID="import-outcome-title">
                {title}
              </Text>
              <Text style={[type.callout, { color: colors.textSecondary, textAlign: "center" }]}>{body}</Text>
              {outcome.detail ? <Text style={[type.footnote, { color: colors.textPrimary, textAlign: "center" }]}>{outcome.detail}</Text> : null}
              {outcome.status === "APPLIED" && outcome.payment ? (
                <Text testID="import-payment-result" style={[type.footnote, { color: outcome.payment.status === "failed" ? colors.amber : colors.textPrimary, textAlign: "center", fontWeight: "600" }]}>
                  {paymentResultText(outcome.payment)}
                </Text>
              ) : null}
              {outcome.status === "IN_PROGRESS" && !pollExpired ? <ActivityIndicator color={fg} /> : null}
            </View>
          </SafeAnimatedView>
          {outcome.status === "APPLIED" ? (
            <Button testID="import-go-expenses" label="Gider faturalarına git" icon={<ReceiptIcon size={18} color="#FFFFFF" />} onPress={() => router.replace("/expenses")} />
          ) : null}
          {outcome.status === "UNKNOWN" || (outcome.status === "IN_PROGRESS" && pollExpired) ? <Button testID="import-refresh-status" label="Durumu yenile" onPress={refreshStatus} /> : null}
          {outcome.status === "REJECTED" ? (
            <Button
              testID="import-retry-preview"
              label="Önizlemeyi yenile"
              onPress={() => {
                setOutcome(null);
                if (gate !== "preview") setGate("preview");
                load(committed.current || INITIAL_ARGS);
              }}
            />
          ) : null}
          <Button variant="secondary" label="Listeye dön" onPress={() => router.back()} />
          {pdfButton}
        </ScrollView>
      </View>
    );
  }
  if (!decision) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        {header}
        {failed && gateInfo ? (
          <View testID="import-accept-gate" style={[styles.notice, styles.ackBox, { backgroundColor: gateInfo.kind === "rejected" ? colors.errorBg : colors.warningBg }]}>
            <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{gateInfo.title}</Text>
            <Text style={[type.footnote, { color: colors.textPrimary }]}>{gateDetail}</Text>
            {gateInfo.kind === "accept" && !canRespond && !responded ? (
              <Text style={[type.caption, { color: colors.textSecondary }]}>Kabul ya da red için bu belgenin yanıt süresi uygun değil; Paraşüt'te kontrol edin.</Text>
            ) : null}
            {gateInfo.kind === "pending" || responded ? <Button testID="import-gate-refresh" size="sm" variant="secondary" label="Yenile" onPress={() => load(args)} /> : null}
          </View>
        ) : failed ? (
          <EmptyState
            icon={<AlertIcon size={30} color={colors.error} />}
            title="Önizleme hazırlanamadı"
            description={rejectionText(rejection) || "Fatura şu an okunamadı. Biraz sonra yeniden deneyin."}
            actionLabel="Tekrar dene"
            onAction={() => load(args)}
          />
        ) : (
          <PreviewSkeleton />
        )}
        {failed && (!gateInfo || gateInfo.kind === "accept") ? respondCard : null}
        {failed ? <View style={styles.pad}>{pdfButton}</View> : null}
        {respondSheet}
      </View>
    );
  }

  const payable = doc.legal_payable ?? decision?.document_summary?.payable;
  const kurus = kurusNotice(doc);
  const whPhase: "loading" | "ready" | "unavailable" = loading ? "loading" : stockAction.available === false ? "unavailable" : "ready";
  const stepCard =
    answer === null ? (
      <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
        <View testID="import-question">
          <Card style={[styles.block, styles.step]}>
            <Text style={[type.title, { color: colors.textPrimary }]}>{REMEMBER_TEXT.question}</Text>
            <Text style={[type.callout, { color: colors.textSecondary }]}>{REMEMBER_TEXT.yes}</Text>
            <Text style={[type.footnote, { color: colors.textTertiary }]}>{REMEMBER_TEXT.no}</Text>
            <View style={styles.stepButtons}>
              <Button testID="import-answer-no" variant="secondary" label="Hayır" disabled={loading || !confirmOn} onPress={() => chooseAnswer("no")} style={{ flex: 1 }} />
              <Button testID="import-answer-yes" label="Evet" disabled={loading || !confirmOn} onPress={() => chooseAnswer("yes")} style={{ flex: 1 }} />
            </View>
            <Text style={[type.caption, { color: colors.textTertiary }]}>{REMEMBER_TEXT.fromInvoice}</Text>
          </Card>
        </View>
      </SafeAnimatedView>
    ) : (
      <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
        <View testID="import-warehouse">
          <Card style={[styles.block, styles.step]}>
            <Text style={[type.title, { color: colors.textPrimary }]}>Depo seçimi</Text>
            <Text style={[type.callout, { color: colors.textSecondary }]}>{REMEMBER_TEXT.warehouse}</Text>
            {whPhase === "loading" ? <ActivityIndicator color={colors.primary} /> : null}
            {whPhase === "unavailable" ? (
              <Text testID="import-warehouse-unavailable" style={[type.footnote, { color: colors.textPrimary }]}>
                {stockUnavailableText(stockAction) || "Bu faturada stok girişi yapılamıyor; fatura gider olarak işlenir."}
              </Text>
            ) : null}
            {whPhase === "ready" && !whOptions.length ? <Text style={[type.footnote, { color: colors.textSecondary }]}>{REMEMBER_TEXT.noWarehouse}</Text> : null}
            {whPhase === "ready"
              ? whOptions.map((o: any) => {
                  const sel = whPicked === o.id;
                  return (
                    <PressableScale key={o.id} testID={`import-pick-wh-${o.id}`} accessibilityRole="radio" accessibilityState={{ checked: sel }} onPress={() => setPickedWh(o.id)} style={styles.option}>
                      <View style={[styles.radio, { borderColor: sel ? colors.primary : colors.textTertiary }]}>{sel ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}</View>
                      <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]}>{o.name || "Depo"}</Text>
                    </PressableScale>
                  );
                })
              : null}
            {rememberError ? (
              <Text testID="import-remember-error" style={[type.footnote, { color: colors.error }]}>
                {rememberError}
              </Text>
            ) : null}
            <View style={styles.stepButtons}>
              {whPhase === "unavailable" ? (
                <Button testID="import-expense-only" label="Gider olarak devam et" onPress={() => expenseOnly(stockUnavailableText(stockAction))} style={{ flex: 1 }} />
              ) : (
                <>
                  <Button variant="secondary" label="Vazgeç" disabled={rememberBusy} onPress={() => setAnswer(null)} style={{ flex: 1 }} />
                  <Button
                    testID="import-warehouse-continue"
                    label={rememberBusy ? "Ürünler hazırlanıyor…" : "Devam"}
                    busy={rememberBusy}
                    disabled={rememberBusy || whPhase !== "ready" || (whOptions.length > 0 && !whPicked)}
                    onPress={continueWarehouse}
                    style={{ flex: 1 }}
                  />
                </>
              )}
            </View>
          </Card>
        </View>
      </SafeAnimatedView>
    );
  const lines: any[] = view?.lines || [];
  const stats: HeroStat[] = [
    { label: "Tarih", value: doc.issue_date ? shortDate(String(doc.issue_date)) : "—" },
    { label: "Kalem", value: String(lines.length) },
    { label: "KDV", value: decision?.document_summary?.vat_total != null ? formatMoney(decision.document_summary.vat_total, currency) : "—" },
  ];
  // Soru/depo adımında karar sayısı gösterilmez (kararlar formda verilir).
  const statusLine: [string, string] | null = !formOpen && !stale && !blocking.length ? null : stale
    ? ["warn", stale === "rate" ? "Çok hızlı değişiklik yapıldı; önceki önizleme gösteriliyor." : stale === "view" ? "Satırlar bu seçimle gösterilemedi; önceki önizleme gösteriliyor." : "Sunucu yanıt vermedi; önceki önizleme gösteriliyor."]
    : loading
      ? ["ok", "Önizleme güncelleniyor…"]
      : blocking.length
        ? ["bad", blocking[0].text]
        : fixes.length
          ? ["warn", `${fixes.length} karar bekleniyor`]
          : ready
            ? ["good", "Kayda hazır"]
            : null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="import-screen">
      {header}
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.huge }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(committed.current || args)} tintColor={colors.primary} />}
      >
        <DetailHero
          tone="violet"
          leading={
            <View style={styles.heroIcon}>
              <InboxIcon size={20} color={ON_HERO.text} />
            </View>
          }
          eyebrow="Tedarikçi"
          title={supplier.name || "Tedarikçi"}
          subtitle={[doc.number, supplier.tax_number ? `VKN ${supplier.tax_number}` : null].filter(Boolean).join(" · ") || undefined}
          value={formatMoney(payable, currency)}
          valueLabel="Ödenecek"
          stats={stats}
        />

        {statusLine ? (
          <View
            testID="import-status-line"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { backgroundColor: statusLine[0] === "good" ? colors.successBg : statusLine[0] === "bad" ? colors.errorBg : statusLine[0] === "warn" ? colors.warningBg : colors.infoBg }]}
          >
            {statusLine[0] === "good" ? <CheckIcon size={16} color={colors.success} /> : loading ? <ActivityIndicator size="small" color={colors.info} /> : <AlertIcon size={16} color={statusLine[0] === "bad" ? colors.error : colors.amber} />}
            <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{statusLine[1]}</Text>
          </View>
        ) : null}
        {rejection && stale ? (
          <View style={[styles.notice, { backgroundColor: colors.errorBg }]}>
            <AlertIcon size={16} color={colors.error} />
            <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{rejectionText(rejection)}</Text>
          </View>
        ) : null}
        {respondCard}
        {decision?.reimport?.allowed === true ? (
          <View style={[styles.notice, { backgroundColor: colors.infoBg }]}>
            <AlertIcon size={16} color={colors.info} />
            <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>Bu faturanın önceki kaydı geri alınmıştı; yeniden içeri alıyorsunuz.</Text>
          </View>
        ) : null}

        {formOpen ? (
          <>
        {[notice, answer === "no" ? quickExpenseNotice(doc) : null, answer === "yes" ? plannedNotice(plannedCards) : null].filter(Boolean).length ? (
          <View testID="import-notice" style={[styles.notice, { backgroundColor: colors.infoBg }]}>
            <AlertIcon size={16} color={colors.info} />
            <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
              {[notice, answer === "no" ? quickExpenseNotice(doc) : null, answer === "yes" ? plannedNotice(plannedCards) : null].filter(Boolean).join(" ")}
            </Text>
          </View>
        ) : null}
        {kurus ? (
          <View testID="import-kurus" style={[styles.notice, { backgroundColor: colors.warningBg }]}>
            <AlertIcon size={16} color={colors.amber} />
            <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{kurus}</Text>
          </View>
        ) : null}
        <SafeAnimatedView entering={FadeInDown.delay(60).duration(380)}>
          <SectionTitle title="Stok takibi" />
          {answer === "yes" && stockAction.available === true ? (
            <ChipRow>
              <Chip testID="import-stock-on" label="Yapılsın" selected={stockOn} onPress={() => chooseStock(true)} />
              <Chip testID="import-stock-off" label="Yapılmasın" selected={!stockOn} onPress={() => chooseStock(false)} />
            </ChipRow>
          ) : (
            <Text testID="import-stock-none" style={[type.caption, styles.pad, { color: colors.textTertiary }]}>
              {answer === "yes" ? stockUnavailableText(stockAction) || "Stok girişi yapılamıyor; fatura gider olarak işlenir." : REMEMBER_TEXT.notRemembered}
            </Text>
          )}
        </SafeAnimatedView>

        {supplierBlock ? (
          <SafeAnimatedView entering={FadeInDown.delay(90).duration(380)}>
            <SectionTitle title="Tedarikçi" />
            <Card style={styles.block}>
              {(supplier.candidates || []).map((c: any, i: number) => {
                const sel = args.supplierId === c.id;
                return (
                  <PressableScale
                    key={c.id}
                    testID={`import-supplier-${c.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sel }}
                    onPress={() => chooseSupplier(c.id, false)}
                    style={[styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={[styles.radio, { borderColor: sel ? colors.primary : colors.textTertiary }]}>{sel ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}</View>
                    <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                      {c.label || "Kayıtlı tedarikçi"}
                    </Text>
                  </PressableScale>
                );
              })}
              {createOk ? (
                <PressableScale
                  testID="import-supplier-create"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: args.createSupplier && !args.supplierId }}
                  onPress={() => chooseSupplier(null, true)}
                  style={[styles.option, (supplier.candidates || []).length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <View style={[styles.radio, { borderColor: args.createSupplier && !args.supplierId ? colors.primary : colors.textTertiary }]}>
                    {args.createSupplier && !args.supplierId ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                  </View>
                  <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                    {`Yeni tedarikçi oluştur: ${supplier.name || "faturadaki tedarikçi"}`}
                  </Text>
                </PressableScale>
              ) : null}
            </Card>
          </SafeAnimatedView>
        ) : null}

        <SafeAnimatedView entering={FadeInDown.delay(120).duration(380)}>
          <SectionTitle title="Kalemler" action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${lines.length} kalem`}</Text>} />
          <Card style={styles.block}>
            {lines.map((l: any, i: number) => {
              const value = lineValue(l);
              const lineFix = fixes.find((f) => f.line === l.index);
              const needs = !l.kind || Boolean(lineFix);
              const amount = l.line_extension_provider ?? l.net_computed;
              return (
                <View key={l.index} testID={`import-line-${l.index}`} style={[styles.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={styles.lineTop}>
                    <View style={[styles.lineIcon, { backgroundColor: l.kind === "service" ? colors.surfaceMuted : colors.primarySoft }]}>
                      {l.kind === "service" ? <ReceiptIcon size={16} color={colors.textSecondary} /> : <PackageIcon size={16} color={colors.primary} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                        {l.description || `Kalem ${l.index + 1}`}
                      </Text>
                      <Text style={[type.caption, tabular, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                        {[l.quantity != null ? `${Number(l.quantity).toLocaleString("tr-TR")} ${l.unit?.label || l.unit?.code || ""}`.trim() : null, l.vat_rate != null ? `KDV %${l.vat_rate}` : null, stockOn && l.stock?.selected ? "Stoğa girer" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "700" }]}>{formatMoney(amount, currency)}</Text>
                  </View>
                  {discountText(l) || vatIncludedNote(l) ? (
                    <Text testID={`import-line-${l.index}-discount`} style={[type.caption, tabular, { color: colors.textSecondary }]}>
                      {[discountText(l) ? `İskonto ${discountText(l)}` : null, vatIncludedNote(l)].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  {lineFix ? <Text style={[type.caption, { color: colors.amber }]}>{lineFix.text}</Text> : null}
                  {answer === "yes" && remembered[l.index]?.isNew ? (
                    <View testID={`import-line-${l.index}-new`} style={[styles.newBadge, { backgroundColor: colors.successBg }]}>
                      <Text style={[type.caption, { color: colors.success, fontWeight: "800" }]}>YENİ</Text>
                    </View>
                  ) : null}
                  {answer === "yes" && remembered[l.index]?.status === "ambiguous" && remembered[l.index]?.suggestedName && !l.product?.selected_id ? (
                    <Text style={[type.caption, { color: colors.textSecondary }]}>{`Önerilen ürün: ${remembered[l.index].suggestedName}`}</Text>
                  ) : null}
                  {answer === "no" ? (
                    <Text style={[type.caption, { color: colors.textTertiary }]}>Gider kalemi</Text>
                  ) : needs || l.kind === "product" ? (
                    <View style={{ marginHorizontal: -spacing.lg }}>
                      <ChipRow>
                        {lineOptions(l).map((o) => (
                          <Chip key={o.value} testID={`import-line-${l.index}-${o.value}`} label={o.label} selected={value === o.value} onPress={() => chooseLine(l.index, o.value)} />
                        ))}
                      </ChipRow>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        </SafeAnimatedView>

        {stockOn && stockLines.length > 0 && wh.required ? (
          <SafeAnimatedView entering={FadeInDown.delay(140).duration(380)}>
            <SectionTitle title="Depo" />
            <ChipRow>
              {(wh.options || []).map((o: any) => (
                <Chip key={o.id} testID={`import-wh-${o.id}`} label={o.name || "Depo"} selected={(args.warehouseId || wh.selected_id) === o.id} onPress={() => chooseWarehouse(o.id)} />
              ))}
            </ChipRow>
          </SafeAnimatedView>
        ) : null}

        {confirmOn ? (
          <SafeAnimatedView entering={FadeInDown.delay(160).duration(380)}>
            <SectionTitle title="Ödeme ve vade" />
            <ChipRow>
              {paymentStates(decision).map((st) => (
                <Chip
                  key={st.id}
                  testID={`import-pay-${st.id}`}
                  label={st.label}
                  selected={args.form.payment_state === st.id}
                  onPress={() =>
                    st.available && st.id !== args.form.payment_state
                      ? choosePayment(st.id === "paid" ? { payment_state: "paid", payment_date: args.form.payment_date || todayIso() } : { payment_state: st.id, payment_account_id: null, payment_date: null })
                      : !st.available && st.reason
                        ? toast(st.reason, "info")
                        : undefined
                  }
                />
              ))}
            </ChipRow>
            {paymentStates(decision)
              .filter((st) => !st.available && st.reason)
              .map((st) => (
                <Text key={st.id} style={[type.caption, styles.pad, { color: colors.textTertiary }]}>
                  {st.reason}
                </Text>
              ))}
            {args.form.payment_state === "paid" ? (
              <View testID="import-paid-fields" style={{ marginTop: spacing.xs }}>
                <Text style={[type.caption, styles.pad, { color: colors.textSecondary }]}>Ödemenin yapıldığı hesap</Text>
                {payAccounts === null ? (
                  <ActivityIndicator color={colors.primary} />
                ) : payAccounts.length ? (
                  <ChipRow>
                    {payAccounts.map((a) => (
                      <Chip key={a.id} testID={`import-pay-acc-${a.id}`} label={a.name} selected={args.form.payment_account_id === a.id} onPress={() => choosePayment({ payment_account_id: a.id })} />
                    ))}
                  </ChipRow>
                ) : (
                  <Text style={[type.caption, styles.pad, { color: colors.error }]}>Uygun TL kasa ya da banka hesabı yok. Önce Kasa ve Banka'dan hesap ekleyin.</Text>
                )}
                <Text style={[type.caption, styles.pad, { color: colors.textSecondary, marginTop: spacing.xs }]}>Ödeme tarihi</Text>
                <ChipRow>
                  {[
                    { label: "Bugün", value: todayIso() },
                    { label: "Dün", value: addDays(todayIso(), -1) },
                    ...(/^\d{4}-\d{2}-\d{2}$/.test(String(doc.issue_date || "")) && String(doc.issue_date) <= todayIso() ? [{ label: `Fatura tarihi (${shortDate(String(doc.issue_date))})`, value: String(doc.issue_date) }] : []),
                  ]
                    .filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i)
                    .map((o) => (
                      <Chip key={o.value} testID={`import-pay-date-${o.label === "Bugün" ? "today" : o.label === "Dün" ? "yesterday" : "issue"}`} label={o.label} selected={args.form.payment_date === o.value} onPress={() => choosePayment({ payment_date: o.value })} />
                    ))}
                </ChipRow>
                {paymentMissing(args.form) ? <Text style={[type.caption, styles.pad, { color: colors.amber }]}>Ödendi için ödemenin yapıldığı hesabı seçin.</Text> : null}
              </View>
            ) : null}
            <Text style={[type.caption, styles.pad, { color: colors.textSecondary, marginTop: spacing.sm }]}>Vade</Text>
            <ChipRow>
              <Chip testID="import-due-none" label="Vadesiz" selected={!args.form.due_date} onPress={() => chooseDue(null)} />
              {/^\d{4}-\d{2}-\d{2}$/.test(String(doc.issue_date || ""))
                ? [15, 30, 60].map((d) => {
                    const due = addDays(String(doc.issue_date), d);
                    return <Chip key={d} testID={`import-due-${d}`} label={`${d} gün`} selected={args.form.due_date === due} onPress={() => chooseDue(due)} />;
                  })
                : null}
            </ChipRow>
            {categories && categories.length ? (
              <>
                <SectionTitle title="Gider kategorisi" />
                <ChipRow>
                  {categories.map((c) => (
                    <Chip key={c.id || "system"} testID={`import-cat-${c.id || "system"}`} label={c.name} selected={(args.form.expense_category_id || null) === c.id} onPress={() => chooseCategory(c.id)} />
                  ))}
                </ChipRow>
              </>
            ) : null}
          </SafeAnimatedView>
        ) : null}

        {showLegacyAck ? (
          <View testID="legacy-duplicate-ack" style={[styles.notice, styles.ackBox, { backgroundColor: colors.warningBg }]}>
            <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "flex-start" }}>
              <AlertIcon size={16} color={colors.amber} />
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{LEGACY_DUPLICATE.text}</Text>
            </View>
            <PressableScale
              testID="legacy-duplicate-ack-input"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: args.legacyAck, disabled: loading || confirming }}
              accessibilityLabel={LEGACY_DUPLICATE.ackLabel}
              onPress={loading || confirming ? undefined : () => load({ ...args, legacyAck: !args.legacyAck })}
              style={styles.ackRow}
            >
              <View style={[styles.ackBoxMark, { borderColor: args.legacyAck ? colors.primary : colors.border, backgroundColor: args.legacyAck ? colors.primary : colors.surface }]}>
                {args.legacyAck ? <CheckIcon size={14} color="#FFFFFF" /> : null}
              </View>
              <Text style={[type.callout, { color: colors.textPrimary, fontWeight: "600", flex: 1 }]}>{LEGACY_DUPLICATE.ackLabel}</Text>
            </PressableScale>
          </View>
        ) : null}

        {issues.filter((x) => x.kind !== "fix" && x.kind !== "ack" && !(blocking[0] && x === blocking[0])).length ? (
          <View style={{ marginTop: spacing.sm }}>
            {issues
              .filter((x) => x.kind !== "fix" && x.kind !== "ack" && !(blocking[0] && x === blocking[0]))
              .map((x, i) => (
                <View key={i} style={[styles.notice, { backgroundColor: x.kind === "notice" ? colors.infoBg : x.kind === "warning" ? colors.warningBg : colors.errorBg }]}>
                  <AlertIcon size={16} color={x.kind === "notice" ? colors.info : x.kind === "warning" ? colors.amber : colors.error} />
                  <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{x.line != null ? `Kalem ${x.line + 1}: ${x.text}` : x.text}</Text>
                </View>
              ))}
          </View>
        ) : null}

          </>
        ) : (
          stepCard
        )}

        <View style={[styles.pad, { marginTop: spacing.lg, gap: spacing.sm }]}>
          {!formOpen ? null : confirmOn ? (
            <Button testID="import-save" label={confirming ? "Kaydediliyor…" : "İçeri al"} icon={<CheckIcon size={18} color="#FFFFFF" />} busy={confirming} disabled={!canSave} onPress={save} />
          ) : (
            <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>Bu hesapta şimdilik yalnız önizleme yapılır; fatura kaydedilmez.</Text>
          )}
          {!mayWrite ? <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>İçeri almak için fatura yönetme yetkisi gerekir.</Text> : null}
          {pdfButton}
        </View>
      </ScrollView>
      {respondSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  ackBox: { flexDirection: "column", alignItems: "stretch", gap: spacing.sm },
  ackRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  ackBoxMark: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  wrap: { flex: 1 },
  pad: { paddingHorizontal: spacing.lg },
  block: { marginHorizontal: spacing.lg },
  skHero: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.xs },
  heroIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  notice: { flexDirection: "row", gap: spacing.xs, alignItems: "center", marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, minHeight: 52 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  line: { padding: spacing.md, gap: spacing.xs },
  lineTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  step: { padding: spacing.lg, gap: spacing.sm },
  stepButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  newBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  outcome: { alignItems: "center", gap: spacing.sm, padding: spacing.xl, borderRadius: radius.xl },
  outcomeIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
