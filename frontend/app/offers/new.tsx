// C8 — yeni satış teklifi (Paraşüt).  Web: pages/TekliflerPage.js OfferForm + CreateModal.  POST /parasut/sales-offers.
// Müşteri Paraşüt kişilerinden aranır (en az 2 harf), satırlarda Paraşüt ürünleri önerilir ya da serbest metin yazılır.
// Toplam yalnız önizlemedir; teklifi Paraşüt hesaplar.  Uçta işlem anahtarı yok: ağ hatası / 5xx sonrası teklif oluşmuş olabilir,
// bu yüzden form kendiliğinden yeniden göndermez; kullanıcı önce listeyi kontrol eder (çift teklif riski).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { createSalesOffer, getContacts, getProducts } from "../../src/api";
import { istanbulToday } from "../../src/api-gider";
import { formatMinor } from "../../src/allocation";
import { addDays, blankLine, lineFromProduct, OFFER_CURRENCIES, offerPayload, offerResultUncertain, offerTotals, validateOffer, VAT_RATES, type OfferLine } from "../../src/offer-form";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, ReceiptIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { HeroCard, ON_HERO } from "../../src/ui/HeroCard";
import { Card, SectionTitle } from "../../src/ui/ListRow";

type Contact = { id: string; name: string; email?: string; city?: string };
type Product = { id: string; name: string; list_price?: unknown; sales_price?: unknown; vat_rate?: unknown; currency?: string };

const trDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
function parseDateInput(text: string): string {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
const curLabel = (c: string) => (c === "TRL" ? "TL" : c);
const curCode = (c: string) => (c === "TRL" ? "TRY" : c);

export default function NewOfferScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const mayWrite = canManage(user, "billing");
  const today = istanbulToday();

  const [contact, setContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [issueText, setIssueText] = useState(trDate(today));
  const [dueText, setDueText] = useState("");
  const [currency, setCurrency] = useState<string>("TRL");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<OfferLine[]>([blankLine()]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);

  // Kişi arama: en az 2 harf, 350 ms bekleme; geç gelen eski yanıt yenisinin üstüne yazmaz.
  useEffect(() => {
    if (!token || contact) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await getContacts(token, q);
        if (mine !== seq.current) return;
        setResults((Array.isArray(r?.contacts) ? r.contacts : []).map((c: any) => ({ id: String(c.id), name: String(c.name || ""), email: c.email || "", city: c.city || "" })));
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [token, query, contact]);

  useEffect(() => {
    if (!token) return;
    getProducts(token)
      .then((r) => setProducts((Array.isArray(r?.items) ? r.items : []).map((p: any) => ({ ...p, id: String(p.id), name: String(p.name || "") }))))
      .catch(() => setProducts([]));
  }, [token]);

  const issueDate = parseDateInput(issueText);
  const dueDate = dueText.trim() ? parseDateInput(dueText) : "";
  const form = { contact_id: contact?.id || "", contact_name: contact?.name || "", description, issue_date: issueDate, due_date: dueDate, currency, note, items };
  const v = validateOffer(form);
  const totals = useMemo(() => offerTotals(items), [items]);
  const issueErr = tried && !issueDate ? "Geçerli bir tarih girin (GG.AA.YYYY)." : undefined;
  const dueErr = tried && dueText.trim() && (!dueDate || (issueDate && dueDate < issueDate)) ? "Geçerlilik tarihi teklif tarihinden önce olamaz (GG.AA.YYYY)." : undefined;
  const locked = saving || uncertain;

  const setLine = (i: number, patch: Partial<OfferLine>) => setItems((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const suggestions = (l: OfferLine) => {
    const q = l.description.trim().toLocaleLowerCase("tr-TR");
    return (q ? products.filter((p) => p.name.toLocaleLowerCase("tr-TR").includes(q)) : products).slice(0, 5);
  };

  const send = async () => {
    if (!token || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const r = await createSalesOffer(token, offerPayload(form));
      toast("Teklif oluşturuldu", "success");
      if (r?.id) router.replace({ pathname: "/offers/[id]", params: { id: String(r.id) } });
      else if (router.canGoBack()) router.back();
    } catch (e: any) {
      if (offerResultUncertain(e)) setUncertain(true);
      setError(e?.message || "Teklif oluşturulamadı.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const submit = async () => {
    setTried(true);
    if (!v.ok || !issueDate || dueErr) return;
    await send();
  };

  // Sonuç belirsizken yeniden gönderim yalnız açık onayla (teklif ikinci kez oluşabilir).
  const resendAnyway = async () => {
    const ok = await confirm({
      title: "Yine de gönderilsin mi?",
      message: "Önceki gönderim Paraşüt'te teklif oluşturmuş olabilir. Teklifler listesinde görünmüyorsa gönderin; görünüyorsa ikinci bir teklif oluşur.",
      confirmLabel: "Yine de gönder",
    });
    if (ok) await send();
  };

  const body = () => {
    if (!mayWrite)
      return <EmptyState icon={<ReceiptIcon size={30} color={colors.textTertiary} />} title="Yetkiniz yok" description="Teklif oluşturmak için fatura yönetimi yetkisi gerekir." />;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <HeroCard tone="violet">
            <Text style={styles.heroLabel}>Tahmini genel toplam</Text>
            <Text testID="offer-total" style={[styles.heroValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMinor(totals.total, curCode(currency))}
            </Text>
            <View style={styles.heroFacts}>
              {[
                ["Ara toplam", totals.subtotal],
                ["İndirim", totals.discount],
                ["KDV", totals.vat],
              ].map(([k, val]) => (
                <View key={String(k)} style={styles.heroFact}>
                  <Text style={styles.heroFactLabel}>{String(k)}</Text>
                  <Text style={[styles.heroFactValue, tabular]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMinor(val as bigint, curCode(currency))}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.heroHint}>Kesin tutarı Paraşüt hesaplar.</Text>
          </HeroCard>

          <SectionTitle title="Müşteri" />
          {contact ? (
            <Card padded style={[styles.block, styles.picked]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text testID="offer-contact-picked" style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                  {contact.name}
                </Text>
                {contact.email || contact.city ? (
                  <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[contact.email, contact.city].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Button testID="offer-contact-change" size="sm" variant="secondary" label="Değiştir" disabled={locked} onPress={() => { setContact(null); setQuery(""); }} />
            </Card>
          ) : (
            <View style={styles.form}>
              <FormField
                testID="offer-contact-search"
                label="Müşteri ara"
                value={query}
                onChangeText={setQuery}
                placeholder="En az 2 harf"
                editable={!locked}
                error={tried && !contact ? "Müşteri seçin." : undefined}
              />
              {query.trim().length >= 2 ? (
                <Card>
                  {searching ? (
                    <Text style={[type.footnote, styles.pad, { color: colors.textTertiary }]}>Aranıyor…</Text>
                  ) : results.length === 0 ? (
                    <Text style={[type.footnote, styles.pad, { color: colors.textTertiary }]}>Sonuç bulunamadı. Müşteri önce Paraşüt'te kayıtlı olmalı.</Text>
                  ) : (
                    results.map((c, i) => (
                      <PressableScale key={c.id} testID={`offer-contact-${c.id}`} onPress={() => { setContact(c); setResults([]); }} accessibilityRole="button" accessibilityLabel={c.name}>
                        <View style={[styles.pad, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>
                            {c.name}
                          </Text>
                          {c.email || c.city ? (
                            <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                              {[c.email, c.city].filter(Boolean).join(" · ")}
                            </Text>
                          ) : null}
                        </View>
                      </PressableScale>
                    ))
                  )}
                </Card>
              ) : null}
            </View>
          )}

          <SectionTitle title="Tarih ve para birimi" />
          <View style={styles.form}>
            <FormField testID="offer-issue-date" label="Teklif tarihi" value={issueText} onChangeText={setIssueText} editable={!locked} placeholder="GG.AA.YYYY" error={issueErr} />
            <FormField testID="offer-due-date" label="Geçerlilik tarihi (isteğe bağlı)" value={dueText} onChangeText={setDueText} editable={!locked} placeholder="GG.AA.YYYY" error={dueErr} />
          </View>
          <ChipRow>
            {[15, 30].map((d) => {
              const iso = issueDate ? addDays(issueDate, d) : "";
              return <Chip key={d} testID={`offer-due-${d}`} label={`${d} gün`} selected={Boolean(iso) && dueDate === iso} onPress={() => !locked && iso && setDueText(trDate(iso))} />;
            })}
            <Chip label="Süresiz" selected={!dueText.trim()} onPress={() => !locked && setDueText("")} />
          </ChipRow>
          <ChipRow>
            {OFFER_CURRENCIES.map((c) => (
              <Chip key={c} testID={`offer-currency-${c}`} label={curLabel(c)} selected={currency === c} onPress={() => !locked && setCurrency(c)} />
            ))}
          </ChipRow>

          <View style={styles.form}>
            <FormField testID="offer-description" label="Açıklama (isteğe bağlı)" value={description} onChangeText={setDescription} editable={!locked} placeholder="Teklif açıklaması" maxLength={200} />
          </View>

          <SectionTitle
            title="Ürün / hizmet satırları"
            action={<Button testID="offer-add-line" size="sm" variant="secondary" label="Satır ekle" disabled={locked} onPress={() => setItems((p) => [...p, blankLine()])} />}
          />
          {items.map((l, i) => {
            const lineErr = tried ? v.lines[i] : undefined;
            const sugg = focusLine === i && !l.product_id ? suggestions(l) : [];
            return (
              <Card key={i} style={[styles.block, styles.lineCard]}>
                <View testID={`offer-line-${i}`} style={styles.lineBody}>
                  <View style={styles.lineHead}>
                    <Text style={[type.caption, { color: colors.textTertiary, flex: 1 }]}>{`Satır ${i + 1}${l.product_id ? " · Paraşüt ürünü" : ""}`}</Text>
                    {items.length > 1 ? (
                      <Button testID={`offer-remove-${i}`} size="sm" variant="secondary" label="Kaldır" disabled={locked} onPress={() => setItems((p) => p.filter((_, k) => k !== i))} />
                    ) : null}
                  </View>
                  <TextInput
                    testID={`offer-line-name-${i}`}
                    style={[styles.input, type.body, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                    value={l.description}
                    onChangeText={(t) => setLine(i, { description: t, product_id: "" })}
                    onFocus={() => setFocusLine(i)}
                    editable={!locked}
                    placeholder="Ürün / hizmet adı"
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel={`Satır ${i + 1} ürün / hizmet adı`}
                  />
                  {sugg.length ? (
                    <View style={[styles.sugg, { borderColor: colors.border }]}>
                      {sugg.map((p, k) => (
                        <PressableScale key={p.id} testID={`offer-product-${i}-${p.id}`} onPress={() => { setItems((prev) => prev.map((x, j) => (j === i ? lineFromProduct(p, x) : x))); setFocusLine(null); }} accessibilityRole="button" accessibilityLabel={p.name}>
                          <View style={[styles.suggRow, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                            <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                              {p.name}
                            </Text>
                            {p.list_price ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${p.list_price} ${p.currency || ""}`}</Text> : null}
                          </View>
                        </PressableScale>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.grid}>
                    <View style={{ flex: 1 }}>
                      <FormField testID={`offer-qty-${i}`} label="Adet" value={l.quantity} onChangeText={(t) => setLine(i, { quantity: t })} editable={!locked} keyboardType="decimal-pad" />
                    </View>
                    <View style={{ flex: 1.4 }}>
                      <FormField testID={`offer-price-${i}`} label={`Birim fiyat (${curLabel(currency)})`} value={l.unit_price} onChangeText={(t) => setLine(i, { unit_price: t })} editable={!locked} keyboardType="decimal-pad" placeholder="0,00" />
                    </View>
                  </View>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>KDV</Text>
                  <View style={styles.chips}>
                    {VAT_RATES.map((r) => (
                      <Chip key={r} testID={`offer-vat-${i}-${r}`} label={`%${r}`} selected={l.vat_rate === r} onPress={() => !locked && setLine(i, { vat_rate: r })} />
                    ))}
                  </View>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>İndirim</Text>
                  <View style={styles.grid}>
                    <View style={[styles.chips, { flex: 1.2 }]}>
                      <Chip testID={`offer-disc-pct-${i}`} label="Yüzde" selected={l.discount_type === "percentage"} onPress={() => !locked && setLine(i, { discount_type: "percentage" })} />
                      <Chip testID={`offer-disc-amt-${i}`} label="Tutar" selected={l.discount_type === "amount"} onPress={() => !locked && setLine(i, { discount_type: "amount" })} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormField testID={`offer-disc-${i}`} label={l.discount_type === "percentage" ? "%" : curLabel(currency)} value={l.discount_value} onChangeText={(t) => setLine(i, { discount_value: t })} editable={!locked} keyboardType="decimal-pad" placeholder="0" />
                    </View>
                  </View>
                  {lineErr ? (
                    <Text testID={`offer-line-error-${i}`} accessibilityRole="alert" style={[type.caption, { color: colors.error }]}>
                      {lineErr}
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          })}

          <View style={styles.form}>
            <FormField testID="offer-note" label="Not (isteğe bağlı)" value={note} onChangeText={setNote} editable={!locked} placeholder="Teklife eklenecek not" maxLength={500} multiline />
            {tried && v.form && contact ? (
              <Text accessibilityRole="alert" style={[type.footnote, { color: colors.error }]}>
                {v.form}
              </Text>
            ) : null}
            {uncertain ? (
              <View testID="offer-uncertain" style={[styles.box, { backgroundColor: colors.warningBg }]}>
                <AlertIcon size={16} color={colors.amber} />
                <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>
                  Sonuç alınamadı; teklif Paraşüt'te oluşmuş olabilir. Yeniden göndermeden önce Teklifler listesini kontrol edin.
                </Text>
              </View>
            ) : null}
            {error ? (
              <View testID="offer-error" accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.errorBg }]}>
                <AlertIcon size={16} color={colors.error} />
                <Text style={[type.footnote, { color: colors.error, flex: 1 }]}>{error}</Text>
              </View>
            ) : null}
            {uncertain ? (
              <>
                <Button testID="offer-check-list" label="Teklifleri kontrol et" onPress={() => (router.canGoBack() ? router.back() : router.replace("/offers"))} />
                <Button testID="offer-resend" variant="secondary" label="Yine de gönder" busy={saving} onPress={resendAnyway} />
              </>
            ) : (
              <Button testID="offer-submit" label={saving ? "Oluşturuluyor…" : "Teklif oluştur"} icon={<ReceiptIcon size={18} color="#FFFFFF" />} busy={saving} onPress={submit} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="offer-new-screen">
      <StackHeader title="Yeni teklif" subtitle="Paraşüt" />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingTop: spacing.xs, paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  heroLabel: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  heroValue: { color: ON_HERO.text, fontSize: 34, fontWeight: "800", letterSpacing: -0.6, marginTop: 2 },
  heroFacts: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroFact: { flex: 1, minWidth: 0 },
  heroFactLabel: { color: ON_HERO.soft, fontSize: 12 },
  heroFactValue: { color: ON_HERO.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  heroHint: { color: ON_HERO.soft, fontSize: 12, marginTop: spacing.sm },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  picked: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pad: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: "center" },
  lineCard: { marginTop: spacing.sm },
  lineBody: { padding: spacing.md, gap: spacing.sm },
  lineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  sugg: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  suggRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 44 },
  grid: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  box: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.md },
});
