// Toplu SMS: birleşik alıcı listesi (cari + tüm kanal sipariş müşterileri + web üyeleri; arama + filtre) ya da elle numara → metin →
// ileti türü (Bilgilendirme / Ticari + İYS) → Gönder (onaylı). Alıcı kuralları: src/sms-recipients.ts (web recipientsModel.js, 24 Kas 2026).
// request_id her gönderim denemesi için bir kez üretilir; içerik değişince yenilenir, aynı içerikle yinelemede aynısı gider.
// UNKNOWN_OUTCOME: sonuç "belirsiz" ekranına geçer, yeniden gönderme düğmesi yok.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { request } from "../../api";
import {
  addRecipients,
  campaignBody,
  campaignFailure,
  COMMERCIAL_NOTE,
  CONSENT_TEXT,
  IYS_OPTIONS,
  makeRequestId,
  normalizePhone,
  resultView,
  sendBlockReason,
  type Selection,
} from "../../sms";
import {
  activeFilterCount,
  applyAll,
  countFacets,
  EMPTY_FILTERS,
  filterChips,
  indexRows,
  LAST_ORDER_OPTIONS,
  MIN_ORDER_OPTIONS,
  normalizeResponse,
  ROLE_OPTIONS,
  rowSub,
  SOURCE_LABEL,
  SOURCE_ORDER,
  type Filters,
} from "../../sms-recipients";
import { Chip } from "../../ui/Chip";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../theme/tokens";
import { useFeedback } from "../../ui/Feedback";
import { Button } from "../../ui/Button";
import { FormField, OptionChips } from "../../ui/FormField";
import { Card, SectionTitle } from "../../ui/ListRow";
import { SearchField } from "../../ui/SearchField";
import { CheckIcon } from "../Icons";
import { PressableScale } from "../KPICard";
import { Note, SmsEditor } from "./SmsParts";

const PAGE = 50;
const nf = (n: number) => n.toLocaleString("tr-TR");
type ListState = { status: "loading" } | { status: "error"; msg: string; forbidden: boolean } | { status: "ready"; data: ReturnType<typeof normalizeResponse> };

function ResultCard({ result, onNew }: { result: any; onNew?: () => void }) {
  const { colors } = useTheme();
  const v = resultView(result);
  const bg = { success: colors.successBg, warning: colors.warningBg, error: colors.errorBg, info: colors.infoBg }[v.tone];
  return (
    <View style={[styles.result, { backgroundColor: bg }]} testID="sms-result" accessibilityRole={v.tone === "error" || v.tone === "warning" ? "alert" : undefined}>
      <Text style={[type.headline, { color: v.tone === "error" ? colors.error : colors.textPrimary }]}>{v.title}</Text>
      {v.lines.map((l) => (
        <Text key={l} style={[type.footnote, { color: colors.textSecondary }]}>{l}</Text>
      ))}
      {v.rejectedTitle ? (
        <View style={{ gap: 2, marginTop: spacing.xs }}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{v.rejectedTitle}</Text>
          {v.rejectedItems.map((r: { phone: string; reason: string }, i: number) => (
            <Text key={`${r.phone}-${i}`} style={[type.caption, tabular, { color: colors.textSecondary }]}>{`${r.phone} · ${r.reason}`}</Text>
          ))}
        </View>
      ) : null}
      {onNew ? <Button testID="sms-bulk-new" variant="secondary" size="sm" label="Yeni toplu SMS" onPress={onNew} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} /> : null}
    </View>
  );
}

export function BulkSection({ token, view, goConnection }: { token: string | null; view: any; goConnection: () => void }) {
  const { colors } = useTheme();
  const { confirm } = useFeedback();
  const max = Number(view?.max_recipients) > 0 ? Number(view.max_recipients) : 5000;
  const rid = useRef(makeRequestId());
  const touch = () => {
    rid.current = makeRequestId();
  };
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [sel, setSel] = useState<Selection>({});
  const [limitMsg, setLimitMsg] = useState("");
  const [mPhone, setMPhone] = useState("");
  const [mName, setMName] = useState("");
  const [mErr, setMErr] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"info" | "commercial">("info");
  const [iys, setIys] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const [result, setResult] = useState<any>(null);
  const busy = useRef(false);

  const commercial = kind === "commercial";
  const count = Object.keys(sel).length;

  // Web: sekme açılınca parametresiz /netgsm/recipients bir kez yüklenir; arama ve filtre istemcide.
  const load = useCallback(() => {
    if (!token) return;
    setList({ status: "loading" });
    request<any>("/netgsm/recipients", { method: "GET" }, token)
      .then((data) => setList({ status: "ready", data: normalizeResponse(data) }))
      .catch((e: any) =>
        setList({
          status: "error",
          forbidden: Number(e?.status) === 403,
          msg: Number(e?.status) === 403 ? "Alıcı listesini görme yetkiniz yok (Satış ya da Ayarlar yetkisi gerekir)." : e?.message || "Alıcılar yüklenemedi.",
        }),
      );
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const data = list.status === "ready" ? list.data : null;
  const entries = useMemo(() => indexRows(data?.items || []), [data]);
  const items = useMemo(() => applyAll(entries, query, filters), [entries, query, filters]);
  const counts = useMemo(() => countFacets(data?.items || [], filters.role), [data, filters.role]);
  const chips = data ? filterChips(filters, data.facets) : [];
  const nFilters = activeFilterCount(filters);
  const setF = (patch: Partial<Filters>) => (setFilters((f) => ({ ...f, ...patch })), setShown(PAGE));
  const toggleIn = (key: "sources" | "channels", v: string) => setF({ [key]: filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] } as Partial<Filters>);
  const allOn = items.length > 0 && items.every((r) => sel[r.phone] !== undefined);

  const addMany = (rows: { name?: string; phone: string }[]) => {
    const r = addRecipients(sel, rows, max);
    setSel(r.sel);
    setLimitMsg(r.capped ? `En fazla ${nf(max)} alıcı seçilebilir.` : "");
    touch();
  };
  const removeMany = (rows: { phone: string }[]) => {
    const next = { ...sel };
    rows.forEach((r) => delete next[r.phone]);
    setSel(next);
    setLimitMsg("");
    touch();
  };
  const addManual = () => {
    const phone = normalizePhone(mPhone);
    if (!phone) return setMErr("Geçerli bir cep numarası girin (ör. 0532 123 45 67).");
    setMErr("");
    addMany([{ name: mName.trim(), phone }]);
    setMPhone("");
    setMName("");
  };

  const reason = sendBlockReason({ sender: String(view?.sender || ""), count, text, commercial, iys, consent });
  const submit = async () => {
    if (busy.current || reason || !token) return;
    const ok = await confirm({ title: "SMS gönderilsin mi?", message: `${nf(count)} kişiye SMS gönderilecek. Bu işlem geri alınamaz.\n\n${text}`, confirmLabel: "Gönder" });
    if (!ok) return;
    busy.current = true;
    setSending(true);
    setSendErr("");
    try {
      const res = await request<any>("/netgsm/campaigns", { method: "POST", body: JSON.stringify(campaignBody(rid.current, text, commercial, iys, consent, sel)) }, token);
      setResult(res);
      if (resultView(res).newRequestId) touch();
    } catch (e: any) {
      // Sunucu kaydı yazmadan döndüyse aynı içerikle yineleme aynı request_id'yi taşır (çift SMS olmaz).
      const f = campaignFailure(e);
      if ("result" in f) setResult(f.result);
      else setSendErr(f.error);
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  const reset = () => {
    setSel({});
    setText("");
    setKind("info");
    setIys("");
    setConsent(false);
    setResult(null);
    setSendErr("");
    setLimitMsg("");
    touch();
  };

  if (result && resultView(result).finished)
    return (
      <View style={styles.block}>
        <ResultCard result={result} onNew={reset} />
      </View>
    );

  return (
    <View style={{ gap: spacing.xs }} testID="sms-bulk">
      {!view?.sender ? (
        <View style={styles.block}>
          <Note tone="warning" testID="sms-bulk-sender-missing">
            <Text style={[type.footnote, { color: colors.textPrimary }]}>SMS göndermek için önce gönderici adı seçin.</Text>
            <Button variant="ghost" size="sm" label="Bağlantı bölümüne git" onPress={goConnection} style={{ alignSelf: "flex-start" }} />
          </Note>
        </View>
      ) : null}
      {result ? (
        <View style={styles.block}>
          <ResultCard result={result} />
        </View>
      ) : null}

      <SectionTitle title="1. Alıcılar" action={<Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{`${nf(count)} seçildi`}</Text>} />
      <View style={[styles.block, { gap: spacing.sm }]}>
        {list.status === "loading" ? <ActivityIndicator color={colors.primary} testID="sms-recipients-loading" /> : null}
        {list.status === "error" ? (
          <Note tone="error">
            <Text style={[type.footnote, { color: colors.error }]}>{list.msg}</Text>
            {!list.forbidden ? <Button variant="ghost" size="sm" label="Tekrar dene" onPress={load} style={{ alignSelf: "flex-start" }} /> : null}
          </Note>
        ) : null}
        {data ? (
          <>
            {data.without_phone > 0 ? <Note>{`${nf(data.without_phone)} kayıtta geçerli cep numarası yok; bu kayıtlar listelenmedi.`}</Note> : null}
            {data.truncated ? <Note tone="warning">Liste çok uzun olduğu için tamamı gösterilmiyor. Aramayla ya da filtreyle daraltabilirsiniz.</Note> : null}
            <SearchField inset={false} testID="sms-recipient-search" value={query} onChangeText={(v) => (setQuery(v), setShown(PAGE))} placeholder="Ad, numara ya da şehir ara" />
            <View style={styles.filterBar}>
              <Button
                testID="sms-filter-toggle"
                variant={nFilters ? "primary" : "secondary"}
                size="sm"
                label={nFilters ? `Filtrele (${nFilters})` : "Filtrele"}
                onPress={() => setFilterOpen((o) => !o)}
              />
              {nFilters ? <Button variant="ghost" size="sm" label="Temizle" onPress={() => setF(EMPTY_FILTERS)} /> : null}
            </View>
            {chips.length && !filterOpen ? (
              <View style={styles.wrapRow} testID="sms-filter-chips">
                {chips.map((c) => (
                  <Chip key={c.key} label={`${c.label}  ✕`} selected onPress={() => setF(c.patch)} />
                ))}
              </View>
            ) : null}
            {filterOpen ? (
              <Card padded style={{ marginHorizontal: 0, gap: spacing.sm }}>
                <View testID="sms-filter-panel" style={{ gap: spacing.sm }}>
                  <FilterGroup title="Kaynak">
                    {SOURCE_ORDER.filter((k) => counts.sources[k] || filters.sources.includes(k)).map((k) => (
                      <Chip key={k} testID={`sms-f-src-${k}`} label={SOURCE_LABEL[k]} count={counts.sources[k] || 0} selected={filters.sources.includes(k)} onPress={() => toggleIn("sources", k)} />
                    ))}
                  </FilterGroup>
                  {data.facets.channels.length ? (
                    <FilterGroup title="Sipariş kanalı">
                      {data.facets.channels.filter((c) => counts.channels[c.key] || filters.channels.includes(c.key)).map((c) => (
                        <Chip key={c.key} testID={`sms-f-ch-${c.key}`} label={c.label} count={counts.channels[c.key] || 0} selected={filters.channels.includes(c.key)} onPress={() => toggleIn("channels", c.key)} />
                      ))}
                    </FilterGroup>
                  ) : null}
                  {data.facets.cities.length ? (
                    <FilterGroup title="Şehir" scroll>
                      <Chip label="Tümü" selected={!filters.city} onPress={() => setF({ city: "" })} />
                      {data.facets.cities.filter((c) => counts.cities[c.name] || filters.city === c.name).map((c) => (
                        <Chip key={c.name} label={c.name} count={counts.cities[c.name] || 0} selected={filters.city === c.name} onPress={() => setF({ city: filters.city === c.name ? "" : c.name })} />
                      ))}
                    </FilterGroup>
                  ) : null}
                  {data.facets.classes.length ? (
                    <FilterGroup title="Kategori / etiket" scroll>
                      <Chip label="Tümü" selected={!filters.classId} onPress={() => setF({ classId: "" })} />
                      {data.facets.classes.filter((c) => counts.classes[c.id] || filters.classId === c.id).map((c) => (
                        <Chip key={c.id} label={c.name} count={counts.classes[c.id] || 0} selected={filters.classId === c.id} onPress={() => setF({ classId: filters.classId === c.id ? "" : c.id })} />
                      ))}
                    </FilterGroup>
                  ) : null}
                  <FilterGroup title="Cari türü">
                    {ROLE_OPTIONS.map(([value, label]) => (
                      <Chip key={value || "any"} testID={`sms-f-role-${value || "any"}`} label={label} selected={filters.role === value} onPress={() => setF({ role: value })} />
                    ))}
                  </FilterGroup>
                  <FilterGroup title="Sipariş sayısı">
                    {MIN_ORDER_OPTIONS.map(([value, label]) => (
                      <Chip key={value || "any"} testID={`sms-f-min-${value || "any"}`} label={label} selected={filters.minOrders === value} onPress={() => setF({ minOrders: value })} />
                    ))}
                  </FilterGroup>
                  <FilterGroup title="Son sipariş">
                    {LAST_ORDER_OPTIONS.map(([value, label]) => (
                      <Chip key={value || "any"} testID={`sms-f-last-${value || "any"}`} label={label} selected={filters.lastOrder === value} onPress={() => setF({ lastOrder: value })} />
                    ))}
                  </FilterGroup>
                  <Button testID="sms-filter-apply" size="sm" label={`Sonuçları göster (${nf(items.length)})`} onPress={() => setFilterOpen(false)} />
                </View>
              </Card>
            ) : null}
            <Card style={{ marginHorizontal: 0 }}>
              {items.length ? (
                <>
                  <CheckRow
                    testID="sms-select-all"
                    label={query.trim() || nFilters ? `Filtreye uyan ${nf(items.length)} kişinin tümünü seç` : `Tümünü seç (${nf(items.length)})`}
                    on={allOn}
                    onPress={() => (allOn ? removeMany(items) : addMany(items.map((r) => ({ name: r.name || "", phone: r.phone }))))}
                    strong
                  />
                  {items.slice(0, shown).map((r) => (
                    <CheckRow
                      key={r.phone}
                      label={r.name || "İsimsiz"}
                      sub={rowSub(r)}
                      stacked
                      on={sel[r.phone] !== undefined}
                      onPress={() => (sel[r.phone] !== undefined ? removeMany([r]) : addMany([{ name: r.name || "", phone: r.phone }]))}
                      divider
                    />
                  ))}
                </>
              ) : (
                <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>
                  {data.items.length ? "Aramanıza ya da filtrenize uyan kişi yok." : "Cep numarası olan cari, sipariş müşterisi ya da web üyesi bulunamadı."}
                </Text>
              )}
            </Card>
            {items.length > shown ? <Button variant="secondary" size="sm" label={`Daha fazla göster (${nf(items.length - shown)})`} onPress={() => setShown((x) => x + PAGE)} /> : null}
          </>
        ) : null}
        <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600", marginTop: spacing.xs }]}>Numara ekle</Text>
        <FormField testID="sms-manual-phone" label="Telefon numarası" value={mPhone} onChangeText={setMPhone} keyboardType="phone-pad" placeholder="0532 123 45 67" error={mErr} onSubmitEditing={addManual} />
        <FormField testID="sms-manual-name" label="Ad (isteğe bağlı)" value={mName} onChangeText={setMName} />
        <Button testID="sms-manual-add" variant="secondary" size="sm" label="Numara ekle" onPress={addManual} style={{ alignSelf: "flex-start" }} />
        {limitMsg ? <Note tone="error">{limitMsg}</Note> : null}
        {count > 0 ? (
          <View style={styles.selbar}>
            <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{`${nf(count)} alıcı seçildi`}</Text>
            <Button variant="ghost" size="sm" label="Seçimi temizle" onPress={() => (setSel({}), setLimitMsg(""), touch())} />
          </View>
        ) : null}
      </View>

      <SectionTitle title="2. Mesaj" />
      <View style={styles.block}>
        <SmsEditor
          token={token}
          testID="sms-bulk-text"
          label="Mesaj"
          value={text}
          onChange={(t) => (setText(t), touch())}
          variables={Array.isArray(view?.variables?.bulk) ? view.variables.bulk : []}
          scope="bulk"
          encoding={view?.encoding === "DEFAULT" ? "DEFAULT" : "TURKISH"}
          placeholder="Mesajınızı yazın"
        />
      </View>

      <SectionTitle title="3. İleti türü" />
      <View style={[styles.block, { gap: spacing.sm }]}>
        <OptionChips
          options={[
            { value: "info", label: "Bilgilendirme" },
            { value: "commercial", label: "Ticari" },
          ]}
          value={kind}
          onChange={(v) => (setKind(v as "info" | "commercial"), touch())}
          testIDPrefix="sms-kind"
        />
        <Text style={[type.caption, { color: colors.textTertiary }]}>{commercial ? "Kampanya, indirim, tanıtım" : "Sipariş, randevu, duyuru"}</Text>
        {commercial ? (
          <>
            <Note tone="warning">{COMMERCIAL_NOTE}</Note>
            <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>İYS filtresi (zorunlu)</Text>
            <OptionChips options={IYS_OPTIONS.map(([value, label]) => ({ value, label }))} value={iys} onChange={(v) => (setIys(v), touch())} testIDPrefix="sms-iys" />
            <View style={[styles.consent, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[type.footnote, { color: colors.textPrimary, flex: 1 }]}>{CONSENT_TEXT}</Text>
              <Switch testID="sms-consent" accessibilityLabel={CONSENT_TEXT} value={consent} onValueChange={(v) => (setConsent(v), touch())} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
          </>
        ) : null}
      </View>

      <View style={[styles.block, { gap: spacing.sm, marginTop: spacing.md }]}>
        {sendErr ? <Note tone="error" testID="sms-send-error">{sendErr}</Note> : null}
        <Text testID="sms-send-reason" style={[type.footnote, { color: reason ? colors.textSecondary : colors.textPrimary }]}>{reason || `${nf(count)} alıcıya gidecek.`}</Text>
        <Button testID="sms-send" label={sending ? "Gönderiliyor…" : "Gönder"} busy={sending} disabled={!!reason || sending} onPress={submit} />
      </View>
    </View>
  );
}

// scroll: yatay kayan çip satırı (şehir, sınıf); diğerleri alt satıra sarar.
function FilterGroup({ title, children, scroll }: { title: string; children: React.ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "700" }]}>{title}</Text>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.wrapRow}>{children}</View>
      )}
    </View>
  );
}

function CheckRow({ label, sub, on, onPress, divider, strong, stacked, testID }: { label: string; sub?: string; on: boolean; onPress: () => void; divider?: boolean; strong?: boolean; stacked?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={sub ? `${label} ${sub}` : label}
      style={[styles.check, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
    >
      <View style={[styles.box, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>{on ? <CheckIcon size={14} color="#fff" /> : null}</View>
      {stacked ? (
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
          <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
          {sub ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]} numberOfLines={1}>{sub}</Text> : null}
        </View>
      ) : (
        <>
          <Text style={[strong ? type.bodyStrong : type.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{label}</Text>
          {sub ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{sub}</Text> : null}
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  result: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
  selbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  consent: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  check: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 48 },
  filterBar: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  scrollRow: { flexDirection: "row", gap: 6, paddingRight: spacing.md },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
