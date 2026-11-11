import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { getCatalog } from "../../src/api";
import { createLocalInvoice, invoiceTotals, isUncertainWrite, searchInvoiceCustomers, type InvoiceCustomer, type InvoiceLineInput } from "../../src/api-finans";
import { todayIso } from "../../src/finance";
import { useDebounce } from "../../src/hooks/useDebounce";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatTry } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { PackageIcon, PlusIcon, ReceiptIcon, TrashIcon, UserIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { Button } from "../../src/ui/Button";
import { parseAmount, useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips, SummaryLine } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";
import { SearchField } from "../../src/ui/SearchField";
import type { CatalogProduct } from "../../src/types";

// Web formundaki KDV oranları ve varsayılan %20 (frontend/src/pages/ObiHubInvoicesPage.js:83).
const VAT_OPTIONS = [
  { value: 0, label: "%0" },
  { value: 1, label: "%1" },
  { value: 10, label: "%10" },
  { value: 20, label: "%20" },
] as const;

const DUE_OPTIONS = [
  { value: 0, label: "Bugün" },
  { value: 7, label: "7 gün" },
  { value: 14, label: "14 gün" },
  { value: 30, label: "30 gün" },
  { value: 60, label: "60 gün" },
] as const;

type Line = { key: string; product_id: string | null; product_name: string; qtyText: string; priceText: string; vat_rate: number };

type Customer = { id: string | null; name: string; tax_no: string; tax_office: string; address: string };

let lineSeq = 0;
const newKey = () => `l${Date.now()}-${++lineSeq}`;

const toText = (n: number) => (Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(".", ",") : "");

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Miktar ayrıştırıcı. parseAmount para tutarı içindir (2 haneye yuvarlar, noktayı binlik sayar); miktar
// kesirli olabilir (kg, metre). Web formu gibi en çok 3 ondalık kabul edilir; fazlası yuvarlanmaz, hata sayılır.
// Virgül ondalık ayırıcıdır; virgül yoksa tek nokta da ondalık sayılır ("1.125" → 1,125), çünkü bazı
// bölge ayarlarında sayı klavyesi yalnızca nokta sunar. Birden çok ayırıcı geçersizdir.
const QTY_MAX_DECIMALS = 3;
function parseQuantity(text: string): number | null {
  const raw = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(raw)) return null;
  const [, frac = ""] = raw.split(/[.,]/);
  if (frac.length > QTY_MAX_DECIMALS) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const formatQty = (n: number) => String(n).replace(".", ",");

function qtyError(text: string): string | undefined {
  const raw = text.trim();
  const q = parseQuantity(raw);
  if (q !== null) return q > 0 ? undefined : "Sıfırdan büyük olmalı";
  if (/^\d+[.,]\d+$/.test(raw)) return `En çok ${QTY_MAX_DECIMALS} ondalık hane`;
  return "Geçerli bir miktar girin (ör. 2 ya da 0,125)";
}

function parseLine(l: Line): InvoiceLineInput | null {
  const quantity = parseQuantity(l.qtyText);
  const unit_price = parseAmount(l.priceText, true);
  if (!l.product_name.trim() || quantity === null || quantity <= 0 || unit_price === null) return null;
  return { product_id: l.product_id, product_name: l.product_name, quantity, unit_price, vat_rate: l.vat_rate };
}

export default function NewLocalInvoiceScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "billing");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const customerSearch = useDebounce(customerQuery.trim(), 300);
  const [customerRows, setCustomerRows] = useState<InvoiceCustomer[]>([]);
  const [customerBusy, setCustomerBusy] = useState(false);

  const [lines, setLines] = useState<Line[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const productSearch = useDebounce(productQuery.trim(), 300);
  const [productRows, setProductRows] = useState<CatalogProduct[]>([]);
  const [productBusy, setProductBusy] = useState(false);

  const [dueDays, setDueDays] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Önceki gönderimin sonucu belirsiz kaldıysa (yanıt alınamadı) doğrudur; yeniden gönderim ayrıca onaylatılır.
  const [uncertain, setUncertain] = useState(false);

  // Cari arama (web: /customers?search=&per_page=8). Geç gelen eski yanıt, sıra sayacıyla elenir.
  const customerSeq = useRef(0);
  useEffect(() => {
    if (!token || !customerSearch || customer) {
      customerSeq.current++; // yoldaki eski yanıt, temizlenen listeyi geri doldurmasın
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
  }, [token, customerSearch, customer]);

  const productSeq = useRef(0);
  useEffect(() => {
    if (!token || !productSearch) {
      productSeq.current++; // yoldaki eski yanıt, temizlenen listeyi geri doldurmasın
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

  const pickCustomer = (c: Customer) => {
    setCustomer(c);
    setCustomerQuery("");
    setCustomerRows([]);
  };

  const addLine = (product_id: string | null, product_name: string, price: number) => {
    setLines((prev) => [...prev, { key: newKey(), product_id, product_name, qtyText: "1", priceText: toText(price), vat_rate: 20 }]);
    setProductQuery("");
    setProductRows([]);
  };

  const patchLine = (key: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const parsed = lines.map(parseLine);
  const validLines = parsed.filter((l): l is InvoiceLineInput => l !== null);
  const totals = invoiceTotals(validLines);
  const allValid = lines.length > 0 && validLines.length === lines.length;
  const issueDate = todayIso();
  const dueDate = addDays(issueDate, dueDays);

  const submit = async () => {
    setTried(true);
    if (!token || sending.current) return;
    if (!customer) return toast("Önce müşteriyi seçin.", "error");
    if (lines.length === 0) return toast("Faturaya en az bir kalem ekleyin.", "error");
    if (!allValid) return toast("Kalemlerdeki miktar ve fiyatları kontrol edin.", "error");
    const ok = await confirm({
      title: uncertain ? "Taslak yeniden gönderilsin mi?" : "Fatura taslağı kaydedilsin mi?",
      message:
        (uncertain ? "Önceki gönderimin sonucu alınamadı; taslak kaydedilmiş olabilir. Fatura listesinde görünüyorsa yeniden göndermeyin, aksi halde aynı taslak iki kez oluşur.\n" : "") +
        `${customer.name} · ${validLines.length} kalem\n` +
        `Ara toplam ${formatTry(totals.subtotal)} + KDV ${formatTry(totals.vat_amount)}\n` +
        `Genel toplam: ${formatTry(totals.total)}\n` +
        `Vade: ${formatDate(dueDate)}. Fatura taslak olarak kaydedilir; resmileştirme ayrıca yapılır.`,
      confirmLabel: uncertain ? "Yine de gönder" : "Taslak olarak kaydet",
      destructive: uncertain,
    });
    if (!ok || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const inv = await createLocalInvoice(token, {
        customer_id: customer.id,
        customer_name: customer.name,
        customer_tax_no: customer.tax_no,
        customer_tax_office: customer.tax_office,
        customer_address: customer.address,
        issue_date: issueDate,
        due_date: dueDate,
        notes,
        lines: validLines,
      });
      toast(inv?.invoice_number ? `Taslak kaydedildi: ${inv.invoice_number}` : "Taslak kaydedildi", "success");
      if (inv?.id) router.replace({ pathname: "/local-invoices/[id]", params: { id: inv.id } });
      else router.back();
    } catch (e: any) {
      if (isUncertainWrite(e)) {
        setUncertain(true);
        toast("Sonuç alınamadı. Taslak kaydedilmiş olabilir; fatura listesini kontrol edin.", "error");
      } else {
        toast(e?.message || "Fatura kaydedilemedi.", "error");
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  if (!mayWrite) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-new-screen">
        <StackHeader title="Yeni fatura" />
        <EmptyState icon={<ReceiptIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Fatura oluşturmak için fatura yönetimi yetkisi gerekir." />
      </View>
    );
  }

  const freeCustomer = customerQuery.trim();
  const freeProduct = productQuery.trim();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="local-invoice-new-screen">
      <StackHeader title="Yeni satış faturası" subtitle="Taslak" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="blue">
            <Text style={styles.heroLabel}>Genel toplam</Text>
            <Text testID="invoice-total-preview" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {formatTry(totals.total)}
            </Text>
            <View style={styles.heroFoot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroFootLabel}>Ara toplam</Text>
                <Text style={[styles.heroFootValue, tabular]} numberOfLines={1}>
                  {formatTry(totals.subtotal)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroFootLabel}>KDV</Text>
                <Text style={[styles.heroFootValue, tabular]} numberOfLines={1}>
                  {formatTry(totals.vat_amount)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroFootLabel}>Kalem</Text>
                <Text style={[styles.heroFootValue, tabular]}>{lines.length}</Text>
              </View>
            </View>
          </HeroCard>

          {/* Müşteri */}
          <SectionTitle
            title="Müşteri"
            action={
              customer ? (
                <Button testID="invoice-customer-change" label="Değiştir" variant="ghost" size="sm" onPress={() => setCustomer(null)} />
              ) : undefined
            }
          />
          {customer ? (
            <Card style={styles.block}>
              <ListRow
                leading={
                  <IconTile tint={colors.emeraldSoft}>
                    <UserIcon size={18} color={colors.emerald} />
                  </IconTile>
                }
                title={customer.name}
                subtitle={[customer.tax_no ? `VKN/TCKN ${customer.tax_no}` : "", customer.tax_office].filter(Boolean).join(" · ") || (customer.id ? "Kayıtlı cari" : "Cari kaydı olmadan")}
                meta={customer.address || undefined}
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
                      // Siparişlerden türetilen kayıtların kalıcı cari kimliği yoktur; fatura yalnızca adıyla açılır.
                      onPress={() => pickCustomer({ id: c.source === "orders" ? null : c.id, name: c.name, tax_no: c.tax_no || "", tax_office: c.tax_office || "", address: c.address || "" })}
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
                    onPress={() => pickCustomer({ id: null, name: freeCustomer, tax_no: "", tax_office: "", address: "" })}
                  />
                </Card>
              ) : null}
            </>
          )}

          {/* Kalemler */}
          <SectionTitle title="Kalemler" action={lines.length > 0 ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{lines.length} kalem</Text> : undefined} />
          {lines.map((l, i) => {
            const p = parsed[i];
            const qty = parseQuantity(l.qtyText);
            const qtyErr = qtyError(l.qtyText);
            const price = parseAmount(l.priceText, true);
            const lineNet = p ? invoiceTotals([p]).subtotal : 0;
            return (
              <Card key={l.key} padded style={[styles.block, styles.lineCard]}>
                <View style={styles.lineHead}>
                  <IconTile tint={l.product_id ? colors.infoBg : colors.amberSoft}>
                    <PackageIcon size={18} color={l.product_id ? colors.info : colors.amber} />
                  </IconTile>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>
                      {l.product_name}
                    </Text>
                    <Text style={[type.caption, { color: colors.textTertiary }]}>{l.product_id ? "Ürün" : "Serbest kalem"}</Text>
                  </View>
                  <PressableScale
                    testID={`invoice-line-remove-${i}`}
                    onPress={() => removeLine(l.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.product_name} kalemini kaldır`}
                    style={[styles.removeBtn, { backgroundColor: colors.errorBg }]}
                  >
                    <TrashIcon size={18} color={colors.error} />
                  </PressableScale>
                </View>
                <View style={styles.pair}>
                  <FormField
                    style={{ flex: 1 }}
                    testID={`invoice-line-qty-${i}`}
                    label="Miktar"
                    value={l.qtyText}
                    onChangeText={(t) => patchLine(l.key, { qtyText: t })}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    // Ondalık fazlası ve çoklu ayırıcı sessizce düzeltilmez; yazılırken gösterilir. Boş alan yalnızca gönderimde uyarılır.
                    error={qtyErr && (tried || l.qtyText.trim() !== "") ? qtyErr : undefined}
                    hint={qty !== null && qty > 0 ? `Okunan miktar: ${formatQty(qty)}` : undefined}
                  />
                  <FormField
                    style={{ flex: 1.4 }}
                    testID={`invoice-line-price-${i}`}
                    label="Birim fiyat (KDV hariç)"
                    value={l.priceText}
                    onChangeText={(t) => patchLine(l.key, { priceText: t })}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    suffix="TRY"
                    error={tried && price === null ? "Geçerli bir fiyat girin" : undefined}
                  />
                </View>
                <View>
                  <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>KDV oranı</Text>
                  <OptionChips testIDPrefix={`invoice-line-vat-${i}`} options={VAT_OPTIONS} value={l.vat_rate} onChange={(v) => patchLine(l.key, { vat_rate: v })} />
                </View>
                <View style={[styles.lineFoot, { borderTopColor: colors.border }]}>
                  <SummaryLine label="Satır tutarı (KDV hariç)" value={formatTry(lineNet)} />
                </View>
              </Card>
            );
          })}

          <SearchField testID="invoice-product-search" value={productQuery} onChangeText={setProductQuery} placeholder="Ürün adı, stok kodu veya barkod ara" />
          {tried && lines.length === 0 && !freeProduct ? <Text style={[type.caption, styles.note, { color: colors.error }]}>En az bir kalem ekleyin.</Text> : null}
          {!freeProduct && lines.length === 0 && !tried ? (
            <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Ürün arayarak ya da adını yazarak kalem ekleyin.</Text>
          ) : null}
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
                  onPress={() => addLine(p.id, p.name, p.price)}
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
                onPress={() => addLine(null, freeProduct, 0)}
              />
            </Card>
          ) : null}

          {/* Tarih ve not */}
          <SectionTitle title="Tarih ve vade" />
          <Card padded style={[styles.block, { gap: spacing.xs }]}>
            <SummaryLine label="Düzenleme tarihi" value={formatDate(issueDate)} />
            <SummaryLine label="Vade tarihi" value={formatDate(dueDate)} />
            <OptionChips testIDPrefix="invoice-due" options={DUE_OPTIONS} value={dueDays} onChange={setDueDays} />
          </Card>

          <View style={styles.fields}>
            <FormField testID="invoice-notes" label="Not (isteğe bağlı)" value={notes} onChangeText={setNotes} placeholder="Faturada görünecek not" multiline maxLength={500} />
          </View>

          <SectionTitle title="Özet" />
          <Card padded style={[styles.block, { gap: 2 }]}>
            <SummaryLine label="Ara toplam" value={formatTry(totals.subtotal)} />
            <SummaryLine label="KDV" value={formatTry(totals.vat_amount)} />
            <View style={[styles.lineFoot, { borderTopColor: colors.border }]}>
              <SummaryLine label="Genel toplam" value={formatTry(totals.total)} strong color={colors.primary} />
            </View>
          </Card>
          <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>
            Fatura taslak olarak kaydedilir; kesin tutarları sunucu kalemlerden hesaplar. Resmileştirme ve tahsilat fatura ekranından yapılır.
          </Text>

          <View style={styles.fields}>
            {uncertain ? (
              <Text testID="invoice-uncertain" style={[type.callout, { color: colors.amber }]}>
                Önceki gönderimin sonucu alınamadı. Taslak kaydedilmiş olabilir; yeniden göndermeden önce fatura listesini kontrol edin.
              </Text>
            ) : null}
            <Button testID="invoice-submit" label={uncertain ? "Taslağı yeniden gönder" : "Taslak olarak kaydet"} busy={busy} onPress={submit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  fields: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.md },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  pair: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  searching: { minHeight: 60, alignItems: "center", justifyContent: "center" },
  lineCard: { gap: spacing.sm, marginBottom: spacing.sm },
  lineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineFoot: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs, marginTop: spacing.xs },
  removeBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1, marginTop: 2 },
  heroFoot: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroFootLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  heroFootValue: { color: ON_HERO.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
});
