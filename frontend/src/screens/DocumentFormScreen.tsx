// Satış faturası ve teklif formu (ortak; app/local-invoices/new.tsx, app/quotes/*) — G2 sözleşmesi (docs/pm/tasarim/g2-satis-faturasi-sozlesmesi.md; web SalesInvoiceFormOS + DocumentForm).
// Fatura ismi; satır "+" menüsü (indirim, ÖTV, ÖİV, konaklama, tevkifat); ara toplam "+" menüsü (ara toplam indirimi, konaklama, stopaj,
// tümüne tevkifat); stok çıkışı yapılsın / yapılmasın. Tutarlar POST /documents/preview'dan (sunucu = kayıt). ?id= ile düzenleme (PUT).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FormSkeleton } from "../components/Skeleton";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { canManage } from "../auth/permissions";
import { getCashAccounts, getCatalog, getLocalInvoice, request } from "../api";
import {
  getDocumentMeta,
  isInvoiceEditable,
  isUncertainWrite,
  previewDocument,
  saveSalesDocument,
  searchInvoiceCustomers,
  type DocumentMeta,
  type InvoiceCustomer,
} from "../api-finans";
import {
  ACCOMMODATION_RATES,
  blankForm,
  blankLine,
  buildBody,
  documentErrorText,
  fromInvoice,
  newCreateKey,
  previewBody,
  STOPAJ_RATES,
  TAX_LABEL,
  toTr,
  totalsRows,
  validateForm,
  WITHHOLDING_RATES,
  type DocForm,
  type DocLine,
  type DocType, listPrice, DEFAULT_EXEMPTIONS, exemptionChoices, isExportCode, LOCKED_VAT_TEXT, setExemption, vatPatch } from "../document-form";
import { convertText, quoteActions, quoteOutcomeView } from "../quote-status";
import { lifecycleActions, amountsLockNote } from "../document-lifecycle";
import { canChangeCustomer, isPosLocked, posLockedBody, posLockNote } from "../pos-invoice";
import { StatusBadge } from "../components/StatusBadge";
import { todayIso } from "../finance";
import { useDebounce } from "../hooks/useDebounce";
import { useFormDraft } from "../hooks/useFormDraft";
import { DraftBanner } from "../ui/DraftBanner";
import { QuickLookSheet } from "../components/QuickLookSheet";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { formatDate, formatTry } from "../utils";
import { EmptyState } from "../components/EmptyState";
import { PackageIcon, PlusIcon, ReceiptIcon, TrashIcon, UserIcon } from "../components/Icons";
import { PressableScale } from "../components/KPICard";
import { Button } from "../ui/Button";
import { Chip, ChipRow } from "../ui/Chip";
import { useFeedback } from "../ui/Feedback";
import { FormField, OptionChips, SummaryLine } from "../ui/FormField";
import { StackHeader } from "../ui/Header";
import { HeroCard, ON_HERO } from "../ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../ui/ListRow";
import { SearchField } from "../ui/SearchField";
import type { CatalogProduct } from "../types";

const VAT_OPTIONS = [
  { value: 0, label: "%0" },
  { value: 1, label: "%1" },
  { value: 10, label: "%10" },
  { value: 20, label: "%20" },
] as const;

const DUE_OPTIONS = [
  { value: 0, label: "Aynı gün" },
  { value: 7, label: "7 gün" },
  { value: 15, label: "15 gün" },
  { value: 30, label: "30 gün" },
  { value: 60, label: "60 gün" },
] as const;

const VALID_OPTIONS = [
  { value: 7, label: "7 gün" },
  { value: 15, label: "15 gün" },
  { value: 30, label: "30 gün" },
  { value: 60, label: "60 gün" },
] as const;

const DISCOUNT_TYPES = [
  { value: "percentage", label: "%" },
  { value: "amount", label: "₺" },
] as const;

const STOCK_TEXT = {
  with_document: { title: "Stok çıkışı yapılsın", hint: "Stok çıkışı bu fatura ile yapılır. Sonradan bu fatura için irsaliye oluşturulamaz." },
  none: { title: "Stok çıkışı yapılmasın", hint: "Stok gerektirmeyen ürünler ya da stoğu başka yerde tutulanlar için. Faturayla ilişkili irsaliye oluşturulabilir." },
} as const;

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const money = (v: unknown) => (v == null || v === "" ? "—" : formatTry(Number(v)));

// Önizleme: girişten kısa süre sonra sorulur; yanıt yalnız aynı gövde için geçerlidir (bayat yanıt gösterilmez).
// Fişe bağlı taslağın önizlemesi kayıttaki kalemler ve belge indirimiyle (form net fiyatla yeniden kurar; fiş brüt fiyat taşır).
function lockedPreview(record: any) {
  const b = posLockedBody({}, record);
  return { lines: b.items, ...(b.invoice_discount_type ? { doc_discount: { type: b.invoice_discount_type, value: b.invoice_discount_value } } : {}) };
}

function usePreview(token: string | null, body: unknown, enabled: boolean) {
  const key = useMemo(() => (enabled && body ? JSON.stringify(body) : ""), [body, enabled]);
  const [state, setState] = useState<{ key: string; data: any; error: string }>({ key: "", data: null, error: "" });
  useEffect(() => {
    if (!key || !token) return;
    let live = true;
    const t = setTimeout(() => {
      previewDocument(token, JSON.parse(key))
        .then((r) => live && setState({ key, data: r && typeof r === "object" && r.totals ? r : null, error: "" }))
        .catch((e) => live && setState({ key, data: null, error: Number(e?.status) === 422 ? documentErrorText(e) : "" }));
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, token]);
  const fresh = key !== "" && state.key === key;
  return { data: fresh ? state.data : null, error: fresh ? state.error : "", pending: key !== "" && !fresh };
}

function Removable({ label, onRemove, testID, children }: { label: string; onRemove: () => void; testID?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.extra, { backgroundColor: colors.surfaceMuted }]}>
      <View style={styles.extraHead}>
        <Text style={[type.callout, { color: colors.textPrimary, fontWeight: "600", flex: 1 }]}>{label}</Text>
        <PressableScale onPress={onRemove} accessibilityRole="button" accessibilityLabel={`${label} kaldır`} style={styles.extraX} testID={testID ? `${testID}-remove` : undefined}>
          <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "700" }]}>✕</Text>
        </PressableScale>
      </View>
      {children}
    </View>
  );
}

export function DocumentFormScreen({ docType, id }: { docType: DocType; id?: string }) {
  const quote = docType === "quote";
  const editId = id ? String(id) : "";
  const noun = quote ? "teklif" : "fatura";
  const { token, user, parasutConnected } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "billing");

  const [form, setForm] = useState<DocForm>(() => blankForm(todayIso()));
  const patch = (p: Partial<DocForm>) => setForm((f) => ({ ...f, ...p }));
  const patchLine = (key: string, p: Partial<DocLine>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.line_key === key ? { ...l, ...p } : l)) }));
  // KABUK-2 taslak: yalnız YENİ satış faturası (teklif ve düzenleme değil). Tarihler dışında boş formdan farkı varsa yazılır;
  // tutarlar girilen metin olarak (ham) saklanır, işlem anahtarı (createKey) taslağa girmez.
  const draftDirty = useMemo(() => {
    const { issue_date, due_date, ...rest } = form;
    const { issue_date: _a, due_date: _b, ...blank } = blankForm(todayIso());
    return JSON.stringify(rest) !== JSON.stringify(blank);
  }, [form]);
  const draft = useFormDraft({ kind: "sales", form, dirty: draftDirty, enabled: !quote && !editId && mayWrite });
  // KABUK-2 hızlı bakış: seçili cari ya da ürün kalemi için alttan açılan, yalnız okuma özet (form durumu değişmez).
  const [quick, setQuick] = useState<{ kind: "cari" | "urun"; id: string; name: string; sub?: string } | null>(null);
  const restoreDraft = () => {
    const f = draft.restore();
    if (f) setForm({ ...blankForm(todayIso()), ...(f as Partial<DocForm>), lines: Array.isArray((f as any).lines) ? (f as any).lines : [] });
  };
  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [lineMenu, setLineMenu] = useState<string | null>(null);
  const [docMenu, setDocMenu] = useState<null | "root" | "stopaj" | "withholding">(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const customerSearch = useDebounce(customerQuery.trim(), 300);
  const [customerRows, setCustomerRows] = useState<InvoiceCustomer[]>([]);
  const [customerBusy, setCustomerBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const productSearch = useDebounce(productQuery.trim(), 300);
  const [productRows, setProductRows] = useState<CatalogProduct[]>([]);
  const [productBusy, setProductBusy] = useState(false);

  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  // Yeni belge: aynı create_key ile yeniden gönderim tek kayıt açar (belirsiz sonuçta güvenli tekrar).
  const createKey = useRef(newCreateKey());
  const [editState, setEditState] = useState<"none" | "loading" | "ready" | "locked" | "error">(editId ? "loading" : "none");
  const [editNumber, setEditNumber] = useState("");
  const [editStatus, setEditStatus] = useState("");
  // Teklif: kayıtlı belge (durum, çevrilme) ve eylemler (faturaya çevir, kabul/red, sil).
  const [record, setRecord] = useState<any>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [actBusy, setActBusy] = useState("");
  const [banks, setBanks] = useState<{ iban: string; name: string }[]>([]);
  // Faz A M3b: satış fişinden oluşturulan taslak. Kalem, fiyat, vergi, indirim ve stok fişten korunur; yalnız cari/adres, tarih, not düzenlenir.
  const posLocked = !quote && isPosLocked(record);

  useEffect(() => {
    if (token) getDocumentMeta(token).then(setMeta);
  }, [token]);

  useEffect(() => {
    if (!token || !editId) return;
    let live = true;
    getLocalInvoice(token, editId)
      .then((inv: any) => {
        if (!live) return;
        setRecord(inv);
        if (quote ? !quoteActions(inv).edit : !isInvoiceEditable(inv)) return setEditState("locked");
        setEditNumber(String(inv.invoice_number || ""));
        setEditStatus(String(inv.status || ""));
        setForm(fromInvoice(inv, todayIso()));
        setEditState("ready");
      })
      .catch(() => live && setEditState("error"));
    return () => {
      live = false;
    };
  }, [token, editId, reloadSeq]);

  // IBAN önerileri firmanın banka hesaplarından (web ile aynı: GET /finance/accounts, iban'ı olanlar).
  useEffect(() => {
    if (!token || !form.include_iban || banks.length) return;
    let on = true;
    getCashAccounts(token)
      .then((rows) => on && setBanks(rows.filter((a: any) => a?.iban).map((a: any) => ({ iban: String(a.iban), name: String(a.name || "Banka hesabı") }))))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [token, form.include_iban, banks.length]);

  const customerSeq = useRef(0);
  useEffect(() => {
    if (!token || !customerSearch || form.customer_name) {
      customerSeq.current++;
      setCustomerRows([]);
      setCustomerBusy(false);
      return;
    }
    const my = ++customerSeq.current;
    setCustomerBusy(true);
    searchInvoiceCustomers(token, customerSearch)
      .then((rows) => my === customerSeq.current && setCustomerRows(rows))
      .catch(() => my === customerSeq.current && setCustomerRows([]))
      .finally(() => my === customerSeq.current && setCustomerBusy(false));
  }, [token, customerSearch, form.customer_name]);

  const productSeq = useRef(0);
  useEffect(() => {
    if (!token || !productSearch) {
      productSeq.current++;
      setProductRows([]);
      setProductBusy(false);
      return;
    }
    const my = ++productSeq.current;
    setProductBusy(true);
    getCatalog(token, { search: productSearch, perPage: 8 })
      .then((res) => my === productSeq.current && setProductRows(res.products))
      .catch(() => my === productSeq.current && setProductRows([]))
      .finally(() => my === productSeq.current && setProductBusy(false));
  }, [token, productSearch]);

  const pickCustomer = (c: { id: string | null; name: string; tax_no?: string; tax_office?: string; address?: string }) => {
    patch({ customer_id: c.id, customer_name: c.name, customer_tax_no: c.tax_no || "", customer_tax_office: c.tax_office || "", customer_address: c.address || "" });
    setCustomerQuery("");
    setCustomerRows([]);
  };
  const clearCustomer = () => patch({ customer_id: null, customer_name: "", customer_tax_no: "", customer_tax_office: "", customer_address: "" });

  const addLine = (p: CatalogProduct | null, name: string) => {
    const l = blankLine();
    const line: DocLine = p
      ? { ...l, kind: "product", product_id: p.id, product_name: p.name, price: toTr(Number(p.price || 0).toFixed(2)), tracks_stock: null }
      : { ...l, description: name };
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setProductQuery("");
    setProductRows([]);
    // Dalga 5a: müşterinin fiyat listesi varsa ürün fiyatı listeden gelir (POST /price-lists/resolve; liste yoksa kart fiyatı kalır).
    if (p && token && form.customer_id) {
      request<any>("/price-lists/resolve", { method: "POST", body: JSON.stringify({ customer_id: form.customer_id, product_ids: [p.id], date: form.issue_date, currency: "TRY" }) }, token)
        .then((r) => {
          const lp = listPrice(r, p.id);
          if (!lp) return;
          setForm((f) => ({ ...f, lines: f.lines.map((x) => (x.line_key === line.line_key ? { ...x, price: lp.price } : x)) }));
          toast(`Fiyat "${lp.listName}" listesinden alındı.`, "info");
        })
        .catch(() => undefined);
    }
  };
  // E-46: %0 KDV'li satırda istisna kodu (kesmede zorunlu). İhraç kayıtlı kod (701-704) tüm satırlara uygulanır.
  const exemptions = meta?.exemptions?.length ? meta.exemptions : DEFAULT_EXEMPTIONS;
  const exemptionPicker = (l: DocLine, i: number, label = "KDV istisna kodu") => {
    const choices = exemptionChoices(exemptions, form.lines, posLocked);
    const exportBlocked = choices.length < exemptions.length;
    return (
    <View testID={`invoice-line-exemption-${i}`}>
      <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>{label}</Text>
      <OptionChips
        testIDPrefix={`invoice-line-exemption-${i}`}
        options={choices.map((x) => ({ value: x.code, label: x.code }))}
        value={l.vat_exemption_code}
        onChange={(code) => setForm((f) => ({ ...f, lines: setExemption(f.lines, l.line_key, code) }))}
      />
      {l.vat_exemption_code ? (
        <Text testID={`invoice-line-exemption-${i}-label`} style={[type.footnote, { color: colors.textPrimary, marginTop: 4 }]}>
          {`${l.vat_exemption_code} · ${exemptions.find((x) => x.code === l.vat_exemption_code)?.label || "Kayıtlı kod"}`}
        </Text>
      ) : null}
      {issueErrors[`exemption${i}`] && tried ? (
        <Text style={[type.caption, { color: colors.error, marginTop: 4 }]}>{issueErrors[`exemption${i}`]}</Text>
      ) : isExportCode(l.vat_exemption_code) ? (
        <Text style={[type.caption, { color: colors.textTertiary, marginTop: 4 }]}>İhraç kayıtlı kod tüm satırlara uygulanır; KDV %0 olur.</Text>
      ) : !l.vat_exemption_code ? (
        <Text style={[type.caption, { color: colors.textTertiary, marginTop: 4 }]}>Fatura keserken %0 KDV'li satırda istisna kodu gerekir.</Text>
      ) : null}
      {exportBlocked ? (
        <Text testID={`invoice-line-exemption-${i}-locked`} style={[type.caption, { color: colors.textTertiary, marginTop: 4 }]}>{`İhraç kayıtlı kodlar (701–704) seçilemez. ${LOCKED_VAT_TEXT}`}</Text>
      ) : null}
    </View>
    );
  };
  const removeLine = (key: string) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.line_key !== key) }));

  const stockMode = quote ? null : form.stock_mode || meta?.stock.default_mode || null;
  const errors = validateForm(form, { stockMode, docType });
  // Kesme (ya da kesilmiş faturayı güncelleme) için ek kural: %0 KDV'li satırda istisna kodu.
  const issueErrors = validateForm(form, { stockMode, docType, action: "issue" });
  const linesOk = form.lines.length > 0 && !Object.keys(errors).some((k) => k !== "customer");
  const preview = usePreview(
    token,
    form.lines.length ? (posLocked ? { ...previewBody(form, "none", docType), ...lockedPreview(record) } : previewBody(form, stockMode, docType)) : null,
    linesOk
  );
  const totals = preview.data?.totals || null;
  const lineTotal = (key: string) => (preview.data?.lines || []).find((x: any) => x.line_key === key)?.line_total;
  const rows = totalsRows(totals, form);
  const dueDays = form.due_date && form.issue_date ? Math.max(0, dayDiff(form.issue_date, form.due_date)) : 0;
  const shown = (k: string) => (tried ? errors[k] : undefined);

  const isIssued = editStatus === "gonderildi" || editStatus === "gecikti";
  const submit = async (action: "save_draft" | "issue" = "save_draft") => {
    setTried(true);
    if (!token || sending.current) return;
    if (!form.customer_name.trim()) return toast("Önce müşteriyi seçin.", "error");
    if (form.lines.length === 0) return toast(quote ? "Teklife en az bir kalem ekleyin." : "Faturaya en az bir kalem ekleyin.", "error");
    const firstErr = Object.entries(errors).find(([k]) => k !== "customer");
    if (firstErr) {
      const m = /^[a-z_]+(\d+)$/.exec(firstErr[0]);
      return toast(m ? `${Number(m[1]) + 1}. satır: ${firstErr[1]}` : firstErr[1], "error");
    }
    const issue = action === "issue";
    if (!quote && (issue || isIssued)) {
      const ex = Object.entries(issueErrors).find(([k]) => k.startsWith("exemption"));
      if (ex) return toast(`${Number(ex[0].slice(9)) + 1}. satır: ${ex[1]}`, "error");
    }
    const ok = quote
      ? await confirm({
          title: uncertain ? "Teklif yeniden gönderilsin mi?" : editId ? "Değişiklikler kaydedilsin mi?" : "Teklif kaydedilsin mi?",
          message:
            (uncertain ? "Önceki gönderimin sonucu alınamadı. Aynı teklif ikinci kez açılmaz.\n" : "") +
            `${form.customer_name} · ${form.lines.length} kalem\n` +
            (totals ? `Toplam: ${money(totals.total)}\n` : "") +
            (form.valid_until ? `Geçerlilik: ${formatDate(form.valid_until)}.` : "Geçerlilik tarihi yok."),
          confirmLabel: uncertain ? "Yeniden gönder" : "Kaydet",
        })
      : await confirm({
      title: uncertain ? "Fatura yeniden gönderilsin mi?" : issue ? "Fatura kaydedilip kesilsin mi?" : editId ? "Değişiklikler kaydedilsin mi?" : "Fatura taslağı kaydedilsin mi?",
      message:
        (uncertain ? "Önceki gönderimin sonucu alınamadı. Aynı taslak ikinci kez açılmaz; sunucu önceki kaydı döndürür.\n" : "") +
        `${form.customer_name} · ${form.lines.length} kalem\n` +
        (totals ? `Genel toplam: ${money(totals.total)}${totals.payable !== totals.total ? ` · Tahsil edilecek ${money(totals.payable)}` : ""}\n` : "") +
        `Vade: ${formatDate(form.due_date || form.issue_date)}. ` +
        (issue
          ? "Fatura kesilir: numara verilir, cariye borç yazılır" + (stockMode === "with_document" ? " ve stok çıkışı yapılır" : "") + ". Resmileştirme ayrıca yapılır."
          : isIssued
            ? "Kesilmiş fatura güncellenir."
            : "Fatura taslak olarak kaydedilir."),
      confirmLabel: uncertain ? "Yeniden gönder" : issue ? "Kaydet ve kes" : editId ? "Kaydet" : "Taslak olarak kaydet",
    });
    if (!ok || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const built = buildBody(form, { action, stockMode, docType, createKey: editId ? undefined : createKey.current });
      const body = posLocked ? posLockedBody(built, record) : built;
      const inv = await saveSalesDocument(token, body, editId || undefined);
      if (quote) {
        toast("Teklif kaydedildi", "success");
        if (editId) setReloadSeq((n) => n + 1);
        else if (inv?.id) router.replace({ pathname: "/quotes/[id]", params: { id: inv.id } });
        else router.back();
        return;
      }
      if (editId) {
        toast(issue ? "Fatura kaydedildi ve kesildi." : "Fatura güncellendi.", "success");
        router.back();
        return;
      }
      draft.clear();
      toast(issue ? (inv?.invoice_number ? `Fatura kesildi: ${inv.invoice_number}` : "Fatura kaydedildi ve kesildi") : inv?.invoice_number ? `Taslak kaydedildi: ${inv.invoice_number}` : "Taslak kaydedildi", "success");
      if (inv?.id) router.replace({ pathname: "/local-invoices/[id]", params: { id: inv.id } });
      else router.back();
    } catch (e: any) {
      if (isUncertainWrite(e)) {
        setUncertain(true);
        // Fatura oluşmuş olabilir: yeniden deneme bu ekranda aynı işlem anahtarıyla yapılır; taslaktan yeni anahtarla gönderim çift açabilir.
        draft.clear();
        toast("Sonuç alınamadı. Yeniden gönderebilirsiniz; aynı taslak iki kez açılmaz.", "error");
      } else toast(documentErrorText(e), "error");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const today = todayIso();
  const acts = quoteActions(record);
  const runAct = async (name: string, fn: () => Promise<void>) => {
    if (actBusy || sending.current || !token) return;
    setActBusy(name);
    try {
      await fn();
    } finally {
      setActBusy("");
    }
  };
  // Web QuoteFormOS: faturaya çevirmeden önce form kaydedilir (PUT), sonra tek istek (sunucuda tekrar güvenli).
  const convertQuote = () =>
    runAct("convert", async () => {
      if (Object.keys(errors).length) return toast("Önce formdaki hataları düzeltin.", "error");
      const ok = await confirm({ title: "Teklif faturaya çevrilsin mi?", message: "Bu tekliften satış faturası taslağı oluşturulur. Çevrilen teklif artık değiştirilemez.", confirmLabel: "Faturaya çevir" });
      if (!ok) return;
      try {
        await saveSalesDocument(token!, buildBody(form, { action: "save_draft", docType }), editId);
        const inv = await request<any>(`/local-invoices/${encodeURIComponent(editId)}/convert`, { method: "POST", body: JSON.stringify({ idempotency_key: newCreateKey() }) }, token!);
        toast(convertText(inv), "success");
        if (inv?.id) router.replace({ pathname: "/local-invoices/[id]", params: { id: inv.id } });
      } catch (e: any) {
        toast(documentErrorText(e), "error");
        setReloadSeq((n) => n + 1);
      }
    });
  const markQuote = (outcome: "accepted" | "rejected") =>
    runAct("mark", async () => {
      try {
        await request<any>(`/local-invoices/${encodeURIComponent(editId)}/quote-outcome`, { method: "PATCH", body: JSON.stringify({ outcome }) }, token!);
        toast(outcome === "accepted" ? "Teklif kabul edildi olarak işaretlendi" : "Teklif reddedildi olarak işaretlendi", "success");
        setRecord((r: any) => ({ ...r, quote_outcome: outcome }));
      } catch (e: any) {
        toast(documentErrorText(e), "error");
      }
    });
  const removeQuote = () =>
    runAct("remove", async () => {
      const ok = await confirm({
        title: "Teklif silinsin mi?",
        message: `${record?.invoice_number || "Teklif"} · ${record?.customer_name || "—"}\nBu işlem geri alınamaz.`,
        confirmLabel: "Evet, sil",
        destructive: true,
      });
      if (!ok) return;
      try {
        await request<any>(`/local-invoices/${encodeURIComponent(editId)}`, { method: "DELETE" }, token!);
        toast("Teklif silindi", "success");
        router.back();
      } catch (e: any) {
        toast(documentErrorText(e), "error");
      }
    });
  const quoteView = quote && record ? quoteOutcomeView(record, today) : null;

  if (!mayWrite) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-new-screen">
        <StackHeader title={quote ? "Teklif" : "Yeni fatura"} />
        <EmptyState icon={<ReceiptIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description={`${quote ? "Teklif" : "Fatura"} oluşturmak için fatura yönetimi yetkisi gerekir.`} />
      </View>
    );
  }
  if (quote && editState === "locked" && record) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="quote-locked">
        <StackHeader title={record.invoice_number || "Teklif"} subtitle={record.customer_name || undefined} />
        <EmptyState
          icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
          title={acts.openInvoice ? "Teklif faturaya çevrildi" : "Bu teklif düzenlenemez"}
          description={acts.openInvoice ? "Tutar ve satırlar artık satış faturasında yönetilir." : record.status === "iptal" ? "İptal edilmiş teklif düzenlenemez." : "Bu durumdaki teklif düzenlenemez."}
        />
        <View style={styles.fields}>
          {quoteView ? <StatusBadge label={quoteView.label} kind={quoteView.kind} /> : null}
          {acts.openInvoice ? (
            <Button testID="quote-open-invoice" label="Faturayı aç" onPress={() => router.push({ pathname: "/local-invoices/[id]", params: { id: String(record.converted_invoice_id) } })} />
          ) : null}
          {acts.remove ? <Button testID="quote-remove" variant="secondary" label="Sil" busy={actBusy === "remove"} onPress={removeQuote} /> : null}
        </View>
      </View>
    );
  }
  if (editState === "loading" || editState === "locked" || editState === "error") {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-edit-state">
        <StackHeader title={quote ? "Teklif" : "Faturayı düzenle"} />
        {editState === "loading" ? (
          <FormSkeleton fields={4} label={quote ? "Teklif yükleniyor" : "Fatura yükleniyor"} />
        ) : (
          <EmptyState
            icon={<ReceiptIcon size={30} color={colors.textTertiary} />}
            title={editState === "locked" ? "Bu fatura düzenlenemez" : quote ? "Teklif açılamadı" : "Fatura açılamadı"}
            description={
              editState === "locked"
                ? amountsLockNote(record)
                : `${quote ? "Teklif" : "Fatura"} şu an okunamadı. Biraz sonra yeniden deneyin.`
            }
          />
        )}
      </View>
    );
  }

  const freeCustomer = customerQuery.trim();
  const freeProduct = productQuery.trim();
  const withholdingRates = meta?.withholding?.length ? meta.withholding : WITHHOLDING_RATES;

  const lineExtras = (l: DocLine, i: number) => {
    const taxCodes = (l.other_taxes || []).map((t) => t.code);
    const options: { id: string; label: string; run: () => void }[] = [];
    if (!l.discount) options.push({ id: "discount", label: "İndirim", run: () => patchLine(l.line_key, { discount: { type: "percentage", value: "" } }) });
    if (!taxCodes.includes("0071")) options.push({ id: "otv", label: "ÖTV", run: () => patchLine(l.line_key, { other_taxes: [...l.other_taxes, { code: "0071", type: "rate", value: "" }] }) });
    if (!taxCodes.includes("4080")) options.push({ id: "oiv", label: "ÖİV", run: () => patchLine(l.line_key, { other_taxes: [...l.other_taxes, { code: "4080", type: "rate", value: "" }] }) });
    if (!taxCodes.includes("0059"))
      for (const r of ACCOMMODATION_RATES)
        options.push({ id: `acc${r}`, label: `%${r} Konaklama vergisi`, run: () => patchLine(l.line_key, { other_taxes: [...l.other_taxes, { code: "0059", type: "rate", value: r }] }) });
    if (!l.withholding && Number(l.vat_rate) > 0) options.push({ id: "wh", label: "Tevkifat", run: () => patchLine(l.line_key, { withholding: { rate: withholdingRates[0].rate, code: "" } }) });
    return (
      <>
        {l.discount ? (
          <Removable testID={`invoice-line-${i}-discount`} label="İndirim" onRemove={() => patchLine(l.line_key, { discount: null })}>
            <View style={styles.pair}>
              <OptionChips testIDPrefix={`invoice-line-${i}-discount-type`} options={DISCOUNT_TYPES} value={l.discount.type} onChange={(v) => patchLine(l.line_key, { discount: { ...l.discount!, type: v } })} />
              <FormField
                style={{ flex: 1 }}
                testID={`invoice-line-${i}-discount-value`}
                label={l.discount.type === "percentage" ? "Oran (%)" : "Tutar (₺)"}
                value={l.discount.value}
                onChangeText={(t) => patchLine(l.line_key, { discount: { ...l.discount!, value: t } })}
                keyboardType="decimal-pad"
                placeholder="0"
                error={errors[`discount${i}`]}
              />
            </View>
          </Removable>
        ) : null}
        {l.other_taxes.map((t, ti) =>
          t.code === "0059" ? (
            <Removable key={t.code} testID={`invoice-line-${i}-tax-${t.code}`} label={`%${t.value} Konaklama vergisi`} onRemove={() => patchLine(l.line_key, { other_taxes: l.other_taxes.filter((_, x) => x !== ti) })} />
          ) : (
            <Removable key={t.code} testID={`invoice-line-${i}-tax-${t.code}`} label={TAX_LABEL[t.code] || "Vergi"} onRemove={() => patchLine(l.line_key, { other_taxes: l.other_taxes.filter((_, x) => x !== ti) })}>
              <FormField
                testID={`invoice-line-${i}-tax-${t.code}-value`}
                label="Oran (%)"
                value={t.value}
                onChangeText={(v) => patchLine(l.line_key, { other_taxes: l.other_taxes.map((x, xi) => (xi === ti ? { ...x, value: v } : x)) })}
                keyboardType="decimal-pad"
                placeholder="0"
                error={errors[`tax${i}`]}
              />
            </Removable>
          )
        )}
        {l.withholding ? (
          <Removable testID={`invoice-line-${i}-withholding`} label="KDV tevkifatı" onRemove={() => patchLine(l.line_key, { withholding: null })}>
            <OptionChips
              testIDPrefix={`invoice-line-${i}-wh-rate`}
              options={withholdingRates.map((w) => ({ value: w.rate, label: w.label }))}
              value={l.withholding.rate}
              onChange={(v) => patchLine(l.line_key, { withholding: { ...l.withholding!, rate: v } })}
            />
            <FormField
              testID={`invoice-line-${i}-wh-code`}
              label="Tevkifat kodu"
              value={l.withholding.code}
              onChangeText={(v) => patchLine(l.line_key, { withholding: { ...l.withholding!, code: v } })}
              placeholder="ör. 601"
              keyboardType="number-pad"
              error={tried || l.withholding.code ? errors[`withholding${i}`] : undefined}
            />
          </Removable>
        ) : null}
        {lineMenu === l.line_key ? (
          <View style={styles.menu}>
            <ChipRow>
              {options.map((o) => (
                <Chip
                  key={o.id}
                  testID={`invoice-line-${i}-add-${o.id}`}
                  label={o.label}
                  onPress={() => {
                    o.run();
                    setLineMenu(null);
                  }}
                />
              ))}
            </ChipRow>
            {!options.length ? <Text style={[type.caption, { color: colors.textTertiary }]}>Eklenecek başka seçenek yok.</Text> : null}
          </View>
        ) : (
          <Button testID={`invoice-line-${i}-plus`} variant="ghost" size="sm" label="İndirim / vergi ekle" icon={<PlusIcon size={14} color={colors.primary} />} onPress={() => setLineMenu(l.line_key)} />
        )}
      </>
    );
  };

  const docOptions: { id: string; label: string; run: () => void }[] = [];
  if (!form.doc_discount) docOptions.push({ id: "dd", label: "Ara toplam indirimi", run: () => patch({ doc_discount: { type: "percentage", value: "" } }) });
  if (form.accommodation_rate === "") for (const r of ACCOMMODATION_RATES) docOptions.push({ id: `acc${r}`, label: `%${r} Konaklama vergisi`, run: () => patch({ accommodation_rate: r }) });
  if (!form.stopaj_rate) docOptions.push({ id: "stopaj", label: "Stopaj uygula", run: () => setDocMenu("stopaj") });
  if (!form.withholding_all) docOptions.push({ id: "wha", label: "Tümüne tevkifat", run: () => setDocMenu("withholding") });

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-new-screen">
      <StackHeader
        title={quote ? (editId ? editNumber || "Teklif" : "Yeni teklif") : editId ? "Faturayı düzenle" : "Yeni satış faturası"}
        subtitle={quote ? (quoteView ? quoteView.label : "Kaydedilmedi") : editId ? editNumber || "Taslak" : "Taslak"}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {draft.pending ? <DraftBanner at={draft.pending.at} onRestore={restoreDraft} onDiscard={draft.discard} /> : null}
          <HeroCard tone="blue">
            <Text style={styles.heroLabel}>{quote ? "Teklif toplamı" : "Genel toplam"}</Text>
            <Text testID="invoice-total-preview" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {totals ? money(totals.total) : form.lines.length ? (preview.pending ? "…" : "—") : formatTry(0)}
            </Text>
            <View style={styles.heroFoot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroFootLabel}>Ara toplam</Text>
                <Text style={[styles.heroFootValue, tabular]} numberOfLines={1}>
                  {totals ? money(totals.subtotal) : "—"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroFootLabel}>KDV</Text>
                <Text style={[styles.heroFootValue, tabular]} numberOfLines={1}>
                  {totals ? money(totals.vat) : "—"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroFootLabel}>{totals && totals.payable !== totals.total ? "Tahsil edilecek" : "Kalem"}</Text>
                <Text style={[styles.heroFootValue, tabular]} numberOfLines={1}>
                  {totals && totals.payable !== totals.total ? money(totals.payable) : form.lines.length}
                </Text>
              </View>
            </View>
          </HeroCard>

          {/* Müşteri */}
          <SectionTitle title="Müşteri" action={form.customer_name && canChangeCustomer(record) ? <Button testID="invoice-customer-change" label="Değiştir" variant="ghost" size="sm" onPress={clearCustomer} /> : undefined} />
          {form.customer_name ? (
            <Card style={styles.block}>
              <ListRow
                leading={
                  <IconTile tint={colors.emeraldSoft}>
                    <UserIcon size={18} color={colors.emerald} />
                  </IconTile>
                }
                title={form.customer_name}
                subtitle={[form.customer_tax_no ? `VKN/TCKN ${form.customer_tax_no}` : "", form.customer_tax_office].filter(Boolean).join(" · ") || (form.customer_id ? "Kayıtlı cari" : "Cari kaydı olmadan")}
                meta={form.customer_address || undefined}
                testID="invoice-customer-quicklook"
                chevron={Boolean(form.customer_id)}
                onPress={form.customer_id ? () => setQuick({ kind: "cari", id: String(form.customer_id), name: form.customer_name, sub: "Bakiye, son hareketler ve siparişler" }) : undefined}
              />
            </Card>
          ) : (
            <>
              <SearchField testID="invoice-customer-search" value={customerQuery} onChangeText={setCustomerQuery} placeholder="Cari adı, telefon veya vergi no ara" />
              {tried && !freeCustomer ? <Text style={[type.caption, styles.note, { color: colors.error }]}>Müşteri seçimi zorunludur.</Text> : null}
              {freeCustomer ? (
                <Card style={[styles.block, { marginTop: spacing.xs }]}>
                  {customerBusy && customerRows.length === 0 ? (
                    <View style={styles.searching}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : null}
                  {customerRows.map((c, i) => (
                    <ListRow
                      key={c.id}
                      testID={`invoice-customer-${c.id}`}
                      divider={i > 0}
                      leading={
                        <IconTile tint={colors.emeraldSoft}>
                          <UserIcon size={18} color={colors.emerald} />
                        </IconTile>
                      }
                      title={c.name}
                      subtitle={c.tax_no ? `VKN/TCKN ${c.tax_no}` : c.phone || c.email || (c.source === "orders" ? "Siparişlerden" : undefined)}
                      onPress={() => pickCustomer({ id: c.source === "orders" ? null : c.id, name: c.name, tax_no: c.tax_no, tax_office: c.tax_office, address: c.address })}
                    />
                  ))}
                  <ListRow
                    testID="invoice-customer-free"
                    divider={customerRows.length > 0 || customerBusy}
                    leading={
                      <IconTile tint={colors.primarySoft}>
                        <PlusIcon size={18} color={colors.primary} />
                      </IconTile>
                    }
                    title={`"${freeCustomer}" adıyla devam et`}
                    subtitle="Cari kaydı açılmadan faturaya yazılır"
                    onPress={() => pickCustomer({ id: null, name: freeCustomer })}
                  />
                </Card>
              ) : null}
            </>
          )}

          <View style={styles.fields}>
            <FormField
              testID="invoice-document-name"
              label={quote ? "Teklif ismi (isteğe bağlı)" : "Fatura ismi (isteğe bağlı)"}
              value={form.document_name}
              onChangeText={(t) => patch({ document_name: t })}
              placeholder="Örn. sipariş no ya da kısa not"
              maxLength={200}
              hint="Listede müşteri adının altında görünür."
            />
          </View>

          {/* Kalemler */}
          <SectionTitle title="Kalemler" action={form.lines.length > 0 ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{form.lines.length} kalem</Text> : undefined} />
          {posLocked ? (
            <>
              <Text testID="invoice-pos-lock" style={[type.caption, styles.note, { color: colors.textSecondary }]}>{posLockNote(record)}</Text>
              <Card style={styles.block}>
                {(Array.isArray(record?.items) ? record.items : []).map((it: any, i: number) => {
                  const lt = lineTotal(String(it?.line_key || ""));
                  return (
                    <ListRow
                      key={String(it?.line_key || i)}
                      testID={`invoice-pos-line-${i}`}
                      divider={i > 0}
                      title={String(it?.product_name || it?.description || `Kalem ${i + 1}`)}
                      subtitle={`${String(it?.quantity ?? "").replace(".", ",")} × ${formatTry(it?.price_basis === "gross" ? it?.gross_unit_price : it?.unit_price)}${it?.price_basis === "gross" ? " (KDV dahil)" : ""} · KDV %${it?.vat_rate ?? 0}`}
                      trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "600" }]}>{lt != null ? money(lt) : "—"}</Text>}
                    />
                  );
                })}
              </Card>
              {form.lines.some((l) => Number(l.vat_rate) === 0) ? (
                <View style={[styles.block, { gap: spacing.sm, marginTop: spacing.sm }]} testID="invoice-pos-exemptions">
                  {form.lines.map((l, i) => (Number(l.vat_rate) === 0 ? <React.Fragment key={l.line_key}>{exemptionPicker(l, i, `${i + 1}. satır istisna kodu`)}</React.Fragment> : null))}
                </View>
              ) : null}
            </>
          ) : null}
          {!posLocked && form.lines.map((l, i) => {
            const lt = lineTotal(l.line_key);
            const name = l.product_id ? l.product_name : l.description;
            return (
              <Card key={l.line_key} padded style={[styles.block, styles.lineCard]}>
                <View style={styles.lineHead}>
                  <IconTile tint={l.product_id ? colors.infoBg : colors.amberSoft}>
                    <PackageIcon size={18} color={l.product_id ? colors.info : colors.amber} />
                  </IconTile>
                  <PressableScale
                    testID={`invoice-line-quicklook-${i}`}
                    disabled={!l.product_id}
                    onPress={l.product_id ? () => setQuick({ kind: "urun", id: String(l.product_id), name: l.product_name, sub: "Fiyat, stok, son alış ve satışlar" }) : undefined}
                    accessibilityRole={l.product_id ? "button" : undefined}
                    accessibilityLabel={l.product_id ? `${name || "Ürün"}, ürün özetini aç` : undefined}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                      {name || `Kalem ${i + 1}`}
                    </Text>
                    {l.product_id ? (
                      <Text style={[type.caption, { color: colors.primary, fontWeight: "600" }]}>Ürün · Özet ›</Text>
                    ) : (
                      <Text style={[type.caption, { color: colors.textTertiary }]}>Serbest kalem</Text>
                    )}
                  </PressableScale>
                  <PressableScale
                    testID={`invoice-line-remove-${i}`}
                    onPress={() => removeLine(l.line_key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name || "Kalem"} kalemini kaldır`}
                    style={[styles.removeBtn, { backgroundColor: colors.errorBg }]}
                  >
                    <TrashIcon size={18} color={colors.error} />
                  </PressableScale>
                </View>
                {!l.product_id ? (
                  <FormField testID={`invoice-line-desc-${i}`} label="Açıklama" value={l.description} onChangeText={(t) => patchLine(l.line_key, { description: t })} maxLength={500} error={shown(`line${i}`)} />
                ) : null}
                <View style={styles.pair}>
                  <FormField
                    style={{ flex: 1 }}
                    testID={`invoice-line-qty-${i}`}
                    label="Miktar"
                    value={l.quantity}
                    onChangeText={(t) => patchLine(l.line_key, { quantity: t })}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    error={errors[`qty${i}`] && (tried || l.quantity.trim() !== "") ? errors[`qty${i}`] : undefined}
                  />
                  <FormField
                    style={{ flex: 1.4 }}
                    testID={`invoice-line-price-${i}`}
                    label="Birim fiyat (KDV hariç)"
                    value={l.price}
                    onChangeText={(t) => patchLine(l.line_key, { price: t })}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    error={errors[`price${i}`] && (tried || l.price.trim() !== "") ? errors[`price${i}`] : undefined}
                  />
                </View>
                <View>
                  <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>KDV oranı</Text>
                  <OptionChips
                    testIDPrefix={`invoice-line-vat-${i}`}
                    options={VAT_OPTIONS}
                    value={l.vat_rate as 0 | 1 | 10 | 20}
                    onChange={(v) => patchLine(l.line_key, vatPatch(l, v))}
                  />
                </View>
                {Number(l.vat_rate) === 0 && !quote ? exemptionPicker(l, i) : null}
                {meta?.units?.length ? (
                  <View>
                    <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Birim</Text>
                    <View style={{ marginHorizontal: -spacing.lg }}>
                      <ChipRow>
                        {(meta.units.some((u) => u.key === l.unit) ? meta.units : [{ key: l.unit, label: l.unit }, ...meta.units]).map((u) => (
                          <Chip key={u.key} testID={`invoice-line-unit-${i}-${u.key}`} label={u.label} selected={l.unit === u.key} onPress={() => patchLine(l.line_key, { unit: u.key })} />
                        ))}
                      </ChipRow>
                    </View>
                  </View>
                ) : null}
                {lineExtras(l, i)}
                <View style={[styles.lineFoot, { borderTopColor: colors.border }]}>
                  <SummaryLine label="Satır tutarı (KDV dahil)" value={lt != null ? money(lt) : "—"} />
                </View>
              </Card>
            );
          })}

          {posLocked ? null : (
          <>
          <SearchField testID="invoice-product-search" value={productQuery} onChangeText={setProductQuery} placeholder="Ürün adı, stok kodu veya barkod ara" />
          {tried && form.lines.length === 0 && !freeProduct ? <Text style={[type.caption, styles.note, { color: colors.error }]}>En az bir kalem ekleyin.</Text> : null}
          {!freeProduct && form.lines.length === 0 && !tried ? <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Ürün arayarak ya da adını yazarak kalem ekleyin.</Text> : null}
          {freeProduct ? (
            <Card style={[styles.block, { marginTop: spacing.xs }]}>
              {productBusy && productRows.length === 0 ? (
                <View style={styles.searching}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}
              {productRows.map((p, i) => (
                <ListRow
                  key={p.id}
                  testID={`invoice-product-${p.id}`}
                  divider={i > 0}
                  leading={
                    <IconTile tint={colors.infoBg}>
                      <PackageIcon size={18} color={colors.info} />
                    </IconTile>
                  }
                  title={p.name}
                  subtitle={[p.sku, `Stok ${p.stock}`].filter(Boolean).join(" · ")}
                  trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary, fontWeight: "600" }]}>{formatTry(p.price)}</Text>}
                  onPress={() => addLine(p, p.name)}
                />
              ))}
              <ListRow
                testID="invoice-product-free"
                divider={productRows.length > 0 || productBusy}
                leading={
                  <IconTile tint={colors.amberSoft}>
                    <PlusIcon size={18} color={colors.amber} />
                  </IconTile>
                }
                title={`"${freeProduct}" adıyla serbest kalem ekle`}
                subtitle="Ürün kartına bağlanmadan faturaya yazılır"
                onPress={() => addLine(null, freeProduct)}
              />
            </Card>
          ) : null}

          </>
          )}

          {/* Stok (teklifte yok) */}
          {stockMode && !quote && !posLocked ? (
            <>
              <SectionTitle title="Stok takibi" />
              <ChipRow>
                {(["with_document", "none"] as const).map((k) => (
                  <Chip key={k} testID={`invoice-stock-${k}`} label={STOCK_TEXT[k].title} selected={stockMode === k} onPress={() => patch({ stock_mode: k })} />
                ))}
              </ChipRow>
              <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>
                {meta?.stock.owner === "accounting" && stockMode === "none" ? "Stoğunuz muhasebe programınızda tutulduğu için stok çıkışı varsayılan olarak yapılmaz." : STOCK_TEXT[stockMode].hint}
              </Text>
            </>
          ) : null}

          {/* Tarih */}
          {quote ? (
            <>
              <SectionTitle title="Tarih ve geçerlilik" />
              <Card padded style={[styles.block, { gap: spacing.xs }]}>
                <SummaryLine label="Teklif tarihi" value={formatDate(form.issue_date)} />
                <SummaryLine label="Geçerlilik tarihi" value={form.valid_until ? formatDate(form.valid_until) : "Yok"} />
                <OptionChips
                  testIDPrefix="quote-valid"
                  options={VALID_OPTIONS}
                  value={(VALID_OPTIONS.find((o) => form.valid_until && addDays(form.issue_date, o.value) === form.valid_until)?.value ?? -1) as any}
                  onChange={(d) => patch({ valid_until: addDays(form.issue_date, d) })}
                />
                {form.valid_until ? <Button testID="quote-valid-clear" variant="ghost" size="sm" label="Geçerlilik tarihini kaldır" onPress={() => patch({ valid_until: "" })} /> : null}
                {errors.valid ? <Text style={[type.caption, { color: colors.error }]}>{errors.valid}</Text> : null}
              </Card>
            </>
          ) : (
            <>
              <SectionTitle title="Tarih ve vade" />
              <Card padded style={[styles.block, { gap: spacing.xs }]}>
                <SummaryLine label="Fatura tarihi" value={formatDate(form.issue_date)} />
                <SummaryLine label="Vade tarihi" value={formatDate(form.due_date || form.issue_date)} />
                <OptionChips testIDPrefix="invoice-due" options={DUE_OPTIONS} value={(DUE_OPTIONS.find((o) => o.value === dueDays)?.value ?? -1) as any} onChange={(d) => patch({ due_date: addDays(form.issue_date, d) })} />
              </Card>
            </>
          )}

          <View style={styles.fields}>
            <FormField testID="invoice-notes" label="Not (isteğe bağlı)" value={form.notes} onChangeText={(t) => patch({ notes: t })} placeholder={quote ? "Teklifte görünecek not" : "Faturada görünecek not"} multiline maxLength={500} />
          </View>
          <View style={{ marginTop: spacing.xs }}>
            <ChipRow>
              <Chip testID="invoice-note-balance" label="Müşteri bakiyesini not olarak ekle" selected={form.include_balance} onPress={() => patch({ include_balance: !form.include_balance })} />
              <Chip
                testID="invoice-note-iban"
                label="IBAN bilgisi ekle"
                selected={form.include_iban}
                onPress={() => patch({ include_iban: !form.include_iban, iban: !form.include_iban && !form.iban && banks[0] ? banks[0].iban : form.iban })}
              />
            </ChipRow>
          </View>
          {form.include_iban ? (
            <View style={styles.fields}>
              <FormField
                testID="invoice-iban"
                label="IBAN"
                value={form.iban}
                onChangeText={(t) => patch({ iban: t })}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                autoCapitalize="characters"
                autoCorrect={false}
                hint="Fatura notunda ve çıktıda görünür."
                error={tried || form.iban.trim() ? errors.iban : undefined}
              />
              {banks.length ? (
                <View style={{ marginHorizontal: -spacing.lg }}>
                  <ChipRow>
                    {banks.map((b) => (
                      <Chip key={b.iban} testID={`invoice-iban-pick-${b.iban.replace(/\s/g, "")}`} label={b.name} selected={form.iban.replace(/\s/g, "") === b.iban.replace(/\s/g, "")} onPress={() => patch({ iban: b.iban })} />
                    ))}
                  </ChipRow>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Toplam ve ara toplam seçenekleri */}
          <SectionTitle title="Toplam" />
          <Card padded style={[styles.block, { gap: spacing.xs }]}>
            {form.doc_discount && !posLocked ? (
              <Removable testID="invoice-doc-discount" label="Ara toplam indirimi" onRemove={() => patch({ doc_discount: null })}>
                <View style={styles.pair}>
                  <OptionChips testIDPrefix="invoice-doc-discount-type" options={DISCOUNT_TYPES} value={form.doc_discount.type} onChange={(v) => patch({ doc_discount: { ...form.doc_discount!, type: v } })} />
                  <FormField
                    style={{ flex: 1 }}
                    testID="invoice-doc-discount-value"
                    label={form.doc_discount.type === "percentage" ? "Oran (%)" : "Tutar (₺)"}
                    value={form.doc_discount.value}
                    onChangeText={(t) => patch({ doc_discount: { ...form.doc_discount!, value: t } })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    error={errors.doc_discount}
                  />
                </View>
              </Removable>
            ) : null}
            {form.accommodation_rate !== "" ? <Removable testID="invoice-doc-accommodation" label={`%${form.accommodation_rate} Konaklama vergisi`} onRemove={() => patch({ accommodation_rate: "" })} /> : null}
            {form.stopaj_rate ? <Removable testID="invoice-doc-stopaj" label={`%${form.stopaj_rate} Stopaj`} onRemove={() => patch({ stopaj_rate: "" })} /> : null}
            {form.withholding_all ? (
              <Removable testID="invoice-doc-withholding" label="Tümüne tevkifat" onRemove={() => patch({ withholding_all: null })}>
                <OptionChips
                  testIDPrefix="invoice-doc-wh-rate"
                  options={withholdingRates.map((w) => ({ value: w.rate, label: w.label }))}
                  value={form.withholding_all.rate}
                  onChange={(v) => patch({ withholding_all: { ...form.withholding_all!, rate: v } })}
                />
                <FormField
                  testID="invoice-doc-wh-code"
                  label="Tevkifat kodu"
                  value={form.withholding_all.code}
                  onChangeText={(v) => patch({ withholding_all: { ...form.withholding_all!, code: v } })}
                  placeholder="ör. 601"
                  keyboardType="number-pad"
                  error={tried || form.withholding_all.code ? errors.withholding_all : undefined}
                />
              </Removable>
            ) : null}
            {docMenu === "stopaj" ? (
              <ChipRow>
                {STOPAJ_RATES.map((r) => (
                  <Chip key={r} testID={`invoice-doc-stopaj-${r}`} label={`%${r} Stopaj`} onPress={() => (patch({ stopaj_rate: r }), setDocMenu(null))} />
                ))}
              </ChipRow>
            ) : docMenu === "withholding" ? (
              <ChipRow>
                {withholdingRates.map((w) => (
                  <Chip key={w.rate} testID={`invoice-doc-wh-${w.rate}`} label={`Tümüne ${w.label}`} onPress={() => (patch({ withholding_all: { rate: w.rate, code: "" } }), setDocMenu(null))} />
                ))}
              </ChipRow>
            ) : docMenu === "root" ? (
              <ChipRow>
                {docOptions.map((o) => (
                  <Chip
                    key={o.id}
                    testID={`invoice-doc-add-${o.id}`}
                    label={o.label}
                    onPress={() => {
                      if (o.id !== "stopaj" && o.id !== "wha") setDocMenu(null);
                      o.run();
                    }}
                  />
                ))}
              </ChipRow>
            ) : docOptions.length && !posLocked ? (
              <Button testID="invoice-doc-plus" variant="ghost" size="sm" label="Ara toplama ekle" icon={<PlusIcon size={14} color={colors.primary} />} onPress={() => setDocMenu("root")} />
            ) : null}

            <View testID="invoice-totals" style={{ gap: 2, marginTop: spacing.xs }}>
              {rows.length ? (
                rows.map((r) => (
                  <SummaryLine
                    key={r.key}
                    label={r.label}
                    value={r.amount.startsWith("-") ? `-${money(r.amount.slice(1))}` : money(r.amount)}
                    strong={r.strong}
                    color={r.key === "payable" ? colors.primary : undefined}
                  />
                ))
              ) : (
                <Text style={[type.caption, { color: colors.textTertiary }]}>
                  {form.lines.length === 0 ? "Kalem ekleyince toplam burada görünür." : preview.pending ? "Toplam hesaplanıyor…" : "Kalemleri tamamlayınca toplam hesaplanır."}
                </Text>
              )}
            </View>
          </Card>
          {preview.error ? (
            <Text testID="invoice-preview-error" style={[type.caption, styles.note, { color: colors.error }]}>
              {preview.error}
            </Text>
          ) : null}

          <View style={styles.fields}>
            {uncertain ? (
              <Text testID="invoice-uncertain" style={[type.callout, { color: colors.amber }]}>
                Önceki gönderimin sonucu alınamadı. Yeniden gönderebilirsiniz; aynı taslak iki kez açılmaz.
              </Text>
            ) : null}
            <Button
              testID="invoice-submit"
              label={uncertain ? "Yeniden gönder" : quote ? (editId ? "Değişiklikleri kaydet" : "Teklifi kaydet") : editId ? "Değişiklikleri kaydet" : "Taslak olarak kaydet"}
              busy={busy}
              disabled={Boolean(actBusy)}
              onPress={() => submit("save_draft")}
            />
            {quote ? (
              editId ? (
                <>
                  {acts.convert ? <Button testID="quote-convert" variant="secondary" label="Faturaya çevir" busy={actBusy === "convert"} disabled={busy || Boolean(actBusy)} onPress={convertQuote} /> : null}
                  {acts.mark ? (
                    <View style={styles.pair}>
                      <Button testID="quote-accept" variant="secondary" size="sm" label="Kabul edildi" disabled={busy || Boolean(actBusy)} onPress={() => markQuote("accepted")} style={{ flex: 1 }} />
                      <Button testID="quote-reject" variant="secondary" size="sm" label="Reddedildi" disabled={busy || Boolean(actBusy)} onPress={() => markQuote("rejected")} style={{ flex: 1 }} />
                    </View>
                  ) : null}
                  {lifecycleActions(record).share ? (
                    <Button
                      testID="quote-share"
                      variant="secondary"
                      label="E-posta ile paylaş"
                      disabled={busy || Boolean(actBusy)}
                      onPress={() => router.push({ pathname: "/quotes/share", params: { id: editId, title: editNumber || "Teklif", email: String(record?.customer_email || "") } })}
                    />
                  ) : null}
                  {acts.remove ? <Button testID="quote-remove" variant="ghost" label="Teklifi sil" disabled={busy || Boolean(actBusy)} onPress={removeQuote} /> : null}
                </>
              ) : (
                <Text style={[type.caption, { color: colors.textTertiary }]}>Kaydettikten sonra teklifi faturaya çevirebilir, kabul ya da red olarak işaretleyebilirsiniz.</Text>
              )
            ) : (
              <>
                {!isIssued ? <Button testID="invoice-issue" variant="secondary" label="Kaydet ve kes" disabled={busy} onPress={() => submit("issue")} /> : null}
                <Text testID={isIssued ? "issued-edit-note" : undefined} style={[type.caption, { color: colors.textTertiary }]}>
                  {isIssued
                    ? "Fatura kesilmiş durumda kalır; kaydedince stok ve cari bakiyesi yeni tutara göre güncellenir. Resmileştirince fatura Paraşüt'e gider."
                    : "Kaydedince fatura taslak olarak durur; \"Kaydet ve kes\" faturayı keser. Resmileştirince fatura Paraşüt'e gider."}
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <QuickLookSheet token={token} target={quick} onClose={() => setQuick(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  fields: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.md },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  notice: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  pair: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  searching: { minHeight: 60, alignItems: "center", justifyContent: "center" },
  lineCard: { gap: spacing.sm, marginBottom: spacing.sm },
  lineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineFoot: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs, marginTop: spacing.xs },
  removeBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  extra: { borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  extraHead: { flexDirection: "row", alignItems: "center" },
  extraX: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  menu: { marginHorizontal: -spacing.lg, gap: spacing.xs },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, marginTop: 2 },
  heroFoot: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroFootLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  heroFootValue: { color: ON_HERO.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
});
