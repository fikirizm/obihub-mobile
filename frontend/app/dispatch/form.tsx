// P5.1 elle irsaliye: giden (direction=out) ya da gelen (direction=in; tedarikçiden gelen ürünleri stoğa alır). POST /dispatch-notes +
// Idempotency-Key (belirsiz sonuçta aynı anahtarla yeniden gönderilir; ikinci irsaliye oluşmaz). Ürünler GET /catalog/items?kind=all,
// depolar GET /warehouses. Kurallar: src/dispatch-form.ts (web DispatchNoteFormPage ile aynı).
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { newIdempotencyKey, request } from "../../src/api";
import { sendKeyedMoney } from "../../src/api-finans";
import { dispatchErrorText } from "../../src/dispatch";
import { blankDispatch, defaultWarehouse, dispatchBody, itemLine, partyLabel, savedText, textLine, validateDispatch, type Direction, type DispatchForm, type DispatchLine } from "../../src/dispatch-form";
import { useDebounce } from "../../src/hooks/useDebounce";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { PlusIcon, TrashIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { Note } from "../../src/components/sms/SmsParts";
import { Button } from "../../src/ui/Button";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField, OptionChips } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, SectionTitle } from "../../src/ui/ListRow";
import { SearchField } from "../../src/ui/SearchField";

const today = () => {
  const d = new Date(Date.now() + 3 * 3600 * 1000); // İstanbul günü
  return d.toISOString().slice(0, 10);
};

export default function DispatchFormScreen() {
  const p = useLocalSearchParams<{ direction?: string }>();
  const direction: Direction = p.direction === "in" ? "in" : "out";
  const outgoing = direction === "out";
  const party = partyLabel(direction);
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState<DispatchForm>(() => blankDispatch(direction, today()));
  const [lines, setLines] = useState<DispatchLine[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default?: boolean; archived?: boolean }[]>([]);
  const [search, setSearch] = useState("");
  const term = useDebounce(search.trim(), 300);
  const [results, setResults] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const key = useRef(newIdempotencyKey("dn"));
  const lockedBody = useRef<any>(null);
  const live = warehouses.filter((w) => !w.archived);
  const defWid = defaultWarehouse(warehouses);

  useEffect(() => {
    if (!token) return;
    request<any>("/warehouses?include_archived=0&with_totals=0", { method: "GET" }, token)
      .then((r) => setWarehouses(Array.isArray(r?.items) ? r.items : []))
      .catch(() => setWarehouses([]));
  }, [token]);
  useEffect(() => {
    if (!token || term.length < 2) return setResults([]);
    let alive = true;
    const qs = new URLSearchParams({ q: term, kind: "all", limit: "10" });
    request<any>(`/catalog/items?${qs.toString()}`, { method: "GET" }, token)
      .then((r) => alive && setResults((Array.isArray(r?.items) ? r.items : []).filter((i: any) => !i.archived)))
      .catch(() => alive && setResults([]));
    return () => {
      alive = false;
    };
  }, [token, term]);

  const set = (k: keyof DispatchForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const patchLine = (i: number, patch: Partial<DispatchLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (!token || busy) return;
    let body = lockedBody.current;
    if (!body) {
      const e = validateDispatch(form, lines);
      setErrors(e);
      setFormError("");
      if (Object.keys(e).length) return toast(Object.values(e)[0], "error");
      body = dispatchBody(form, lines);
    }
    setBusy(true);
    const out = await sendKeyedMoney(
      () => request<any>("/dispatch-notes", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key.current } }, token),
      () => confirm({ title: "Sonuç alınamadı", message: "İrsaliye oluşturulmuş olabilir. Yeniden gönderirseniz ikinci kez oluşmaz.", confirmLabel: "Yeniden gönder" })
    );
    setBusy(false);
    if (out.ok) {
      const note = out.result?.note || out.result;
      toast(out.result?.created === false ? "Bu irsaliye zaten oluşturulmuştu." : savedText(direction), "success");
      if (note?.id) router.replace({ pathname: "/dispatch/[id]", params: { id: String(note.id) } } as any);
      else router.back();
      return;
    }
    if (out.uncertain) {
      // Belirsiz sonuç: bilgiler kilitlenir, aynı gövde aynı anahtarla yeniden gönderilir.
      lockedBody.current = body;
      setLocked(true);
      setFormError("Sonuç alınamadı. Bilgiler kilitlendi; aynı irsaliyeyi yeniden gönderin (ikinci kez oluşmaz).");
      return;
    }
    key.current = newIdempotencyKey("dn");
    lockedBody.current = null;
    setLocked(false);
    setFormError(dispatchErrorText(out.error));
  };

  const field = (k: keyof DispatchForm, label: string, extra: Record<string, any> = {}) => (
    <FormField testID={`dn-${k}`} label={label} value={String(form[k])} onChangeText={set(k)} editable={!locked} error={errors[k] || undefined} {...extra} />
  );
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="dispatch-form">
      <StackHeader title={outgoing ? "Yeni giden irsaliye" : "Yeni gelen irsaliye"} subtitle={outgoing ? "Kaydedince stok depodan düşer" : "Kaydedince stok depoya girer"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }} keyboardShouldPersistTaps="handled">
          {formError ? (
            <View style={styles.block}>
              <Note tone="error" testID="dn-error">{formError}</Note>
            </View>
          ) : null}

          <SectionTitle title="Belge" />
          <View style={[styles.block, { gap: spacing.sm }]}>
            {field("issue_date", "Düzenleme tarihi (YYYY-AA-GG)", { maxLength: 10, autoCapitalize: "none" })}
            {field("shipment_date", "Fiili sevk tarihi (YYYY-AA-GG)", { maxLength: 10, autoCapitalize: "none" })}
            {field("number", "İrsaliye no (isteğe bağlı)", { maxLength: 40, hint: outgoing ? "Boş bırakılırsa otomatik verilir." : "Tedarikçinin irsaliye numarası." })}
            {field("name", "İrsaliye ismi (isteğe bağlı)", { maxLength: 200, placeholder: outgoing ? "Örn. haftalık sevk" : "Örn. tedarikçi teslimatı" })}
            {field("order_no", "Sipariş no (isteğe bağlı)", { maxLength: 100 })}
          </View>

          <SectionTitle title={party} />
          <View style={[styles.block, { gap: spacing.sm }]}>
            {field("party_name", `${party} adı`, { maxLength: 200 })}
            {field("party_tax_no", "VKN / TCKN (isteğe bağlı)", { maxLength: 11, keyboardType: "number-pad", hint: outgoing ? "e-İrsaliye için gerekir." : undefined })}
            {field("address", "Sevkiyat adresi (isteğe bağlı)", { maxLength: 500, multiline: true })}
            <View style={styles.pair}>
              {field("district", "İlçe", { maxLength: 80, style: { flex: 1 } })}
              {field("city", "İl", { maxLength: 80, style: { flex: 1 } })}
            </View>
            {field("postal_code", "Posta kodu (isteğe bağlı)", { maxLength: 10, keyboardType: "number-pad" })}
            {outgoing ? field("origin_address", "Çıkış adresi (isteğe bağlı)", { maxLength: 500, hint: "Boşsa firma adresi kullanılır." }) : null}
          </View>

          <SectionTitle title="Sevkiyat" />
          <View style={[styles.block, { gap: spacing.sm }]}>
            <OptionChips
              testIDPrefix="dn-method"
              options={[
                { value: "cargo", label: "Kargo / lojistik" },
                { value: "carrier", label: "Taşıyıcı (araç)" },
              ]}
              value={form.shipment_method}
              onChange={(v) => !locked && setForm((f) => ({ ...f, shipment_method: v as "cargo" | "carrier" }))}
            />
            {form.shipment_method === "cargo" ? (
              <>
                {field("carrier", "Kargo firması (isteğe bağlı)", { maxLength: 120, placeholder: "Örn. Aras Kargo" })}
                {field("tracking_no", "Takip no (isteğe bağlı)", { maxLength: 80, autoCapitalize: "characters" })}
              </>
            ) : (
              <>
                {field("driver_name", "Şoför adı soyadı (isteğe bağlı)", { maxLength: 120 })}
                {field("driver_tckn", "Şoför T.C. kimlik no (isteğe bağlı)", { maxLength: 11, keyboardType: "number-pad" })}
                {field("plate", "Araç plakası (isteğe bağlı)", { maxLength: 15, autoCapitalize: "characters", placeholder: "34 ABC 123" })}
                {field("trailer", "Dorse plakası (isteğe bağlı)", { maxLength: 15, autoCapitalize: "characters" })}
              </>
            )}
          </View>

          <SectionTitle title="Ürünler" action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${lines.length} satır`}</Text>} />
          <View style={[styles.block, { gap: spacing.sm }]}>
            {!locked ? <SearchField inset={false} testID="dn-item-search" value={search} onChangeText={setSearch} placeholder="Ürün ara (ad, stok kodu, barkod)" /> : null}
            {results.length ? (
              <Card style={{ marginHorizontal: 0 }}>
                {results.map((r, i) => (
                  <PressableScale
                    key={r.id}
                    testID={`dn-result-${r.id}`}
                    onPress={() => (setLines((ls) => [...ls, itemLine(r, defWid)]), setSearch(""), setResults([]), setErrors((e) => ({ ...e, lines: "" })))}
                    style={[styles.result, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                      <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>{[r.sku, r.barcode].filter(Boolean).join(" · ") || " "}</Text>
                    </View>
                    <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{r.tracks_stock === false ? "Stok takibi yok" : `Stokta: ${r.available ?? "—"}`}</Text>
                  </PressableScale>
                ))}
              </Card>
            ) : null}
            {lines.map((l, i) => (
              <Card key={i} style={{ marginHorizontal: 0 }}>
                <View style={styles.line} testID={`dn-line-${i}`}>
                  <View style={[styles.lineTop, !l.product_id && styles.lineTopText]}>
                    {l.product_id ? (
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>{l.name}</Text>
                        {l.sku ? <Text style={[type.caption, { color: colors.textTertiary }]}>{l.sku}</Text> : null}
                      </View>
                    ) : (
                      <FormField style={{ flex: 1 }} label="Açıklama" value={l.name} editable={!locked} maxLength={500} onChangeText={(v) => patchLine(i, { name: v })} />
                    )}
                    {!locked ? (
                      <PressableScale accessibilityRole="button" accessibilityLabel={`${i + 1}. satırı kaldır`} onPress={() => setLines((ls) => ls.filter((_, k) => k !== i))} style={styles.trash}>
                        <TrashIcon size={18} color={colors.error} />
                      </PressableScale>
                    ) : null}
                  </View>
                  <FormField testID={`dn-qty-${i}`} label="Miktar" suffix={l.unit || "adet"} value={l.qty} editable={!locked} keyboardType="decimal-pad" onChangeText={(v) => patchLine(i, { qty: v })} />
                  {l.product_id && live.length > 1 ? (
                    <View>
                      <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Depo</Text>
                      <OptionChips options={live.map((w) => ({ value: w.id, label: w.name }))} value={l.warehouse_id || defWid} onChange={(v) => !locked && patchLine(i, { warehouse_id: v })} />
                    </View>
                  ) : null}
                </View>
              </Card>
            ))}
            {!lines.length ? <Text style={[type.footnote, { color: colors.textTertiary }]}>Henüz ürün eklenmedi.</Text> : null}
            {errors.lines ? <Text style={[type.caption, { color: colors.error }]}>{errors.lines}</Text> : null}
            {!locked ? (
              <Button testID="dn-add-text" variant="ghost" size="sm" icon={<PlusIcon size={14} color={colors.primary} />} label="Açıklama satırı ekle" onPress={() => setLines((ls) => [...ls, textLine()])} style={{ alignSelf: "flex-start" }} />
            ) : null}
          </View>

          <SectionTitle title="Not" />
          <View style={styles.block}>{field("notes", "Not (isteğe bağlı)", { maxLength: 1000, multiline: true })}</View>

          <View style={[styles.block, { marginTop: spacing.md }]}>
            <Button testID="dn-save" label={busy ? "Kaydediliyor…" : locked ? "Yeniden gönder" : "Kaydet"} busy={busy} disabled={busy} onPress={submit} />
            {busy ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  pair: { flexDirection: "row", gap: spacing.sm },
  result: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, minHeight: 56 },
  line: { padding: spacing.md, gap: spacing.sm },
  lineTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  // Açıklama satırında silme düğmesi metin alanının ortasına hizalanır (alan 48, düğme 40).
  lineTopText: { alignItems: "flex-end" },
  trash: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
