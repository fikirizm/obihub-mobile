// Toplu SMS: alıcı kaynağı ya da elle numara → metin → ileti türü (Bilgilendirme / Ticari + İYS) → Gönder (onaylı).
// request_id her gönderim denemesi için bir kez üretilir; içerik değişince yenilenir, aynı içerikle yinelemede aynısı gider.
// UNKNOWN_OUTCOME: sonuç "belirsiz" ekranına geçer, yeniden gönderme düğmesi yok.
import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native";
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
  SOURCES,
  type Selection,
} from "../../sms";
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
type ListState = { status: "loading" } | { status: "error"; msg: string; forbidden: boolean } | { status: "ready"; data: any };

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
  const [source, setSource] = useState<string | null>(null);
  const [lists, setLists] = useState<Record<string, ListState>>({});
  const [query, setQuery] = useState("");
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
  const current = source ? lists[source] : undefined;

  const loadSource = (key: string) => {
    setSource(key);
    setQuery("");
    setShown(PAGE);
    if (lists[key]?.status === "ready" || !token) return;
    setLists((l) => ({ ...l, [key]: { status: "loading" } }));
    request<any>(`/netgsm/recipients?source=${encodeURIComponent(key)}`, { method: "GET" }, token)
      .then((data) => setLists((l) => ({ ...l, [key]: { status: "ready", data } })))
      .catch((e: any) =>
        setLists((l) => ({
          ...l,
          [key]: {
            status: "error",
            forbidden: Number(e?.status) === 403,
            msg: Number(e?.status) === 403 ? "Alıcı listesini görme yetkiniz yok (Satış ya da Ayarlar yetkisi gerekir)." : e?.message || "Alıcılar yüklenemedi.",
          },
        }))
      );
  };

  const items: { name: string; phone: string }[] = useMemo(() => {
    const all = current?.status === "ready" && Array.isArray(current.data?.items) ? current.data.items : [];
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return q ? all.filter((r: any) => `${r.name} ${r.phone}`.toLocaleLowerCase("tr-TR").includes(q)) : all;
  }, [current, query]);
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
        <OptionChips options={SOURCES.map(([value, label]) => ({ value, label }))} value={source || ""} onChange={loadSource} testIDPrefix="sms-source" />
        {!source ? <Text style={[type.caption, { color: colors.textTertiary }]}>Bir kaynak seçin. Birden çok kaynaktan seçebilirsiniz; aynı numara bir kez sayılır.</Text> : null}
        {current?.status === "loading" ? <ActivityIndicator color={colors.primary} /> : null}
        {current?.status === "error" ? (
          <Note tone="error">
            <Text style={[type.footnote, { color: colors.error }]}>{current.msg}</Text>
            {!current.forbidden ? <Button variant="ghost" size="sm" label="Tekrar dene" onPress={() => source && loadSource(source)} style={{ alignSelf: "flex-start" }} /> : null}
          </Note>
        ) : null}
        {current?.status === "ready" ? (
          <>
            {Number(current.data?.without_phone) > 0 ? <Note>{`${nf(Number(current.data.without_phone))} kayıtta geçerli cep numarası yok; bu kayıtlar listelenmedi.`}</Note> : null}
            {current.data?.truncated ? <Note tone="warning">Liste çok uzun olduğu için tamamı gösterilmiyor. Aramayla daraltabilirsiniz.</Note> : null}
            <SearchField inset={false} value={query} onChangeText={(v) => (setQuery(v), setShown(PAGE))} placeholder="Ad veya numara ara" />
            <Card style={{ marginHorizontal: 0 }}>
              {items.length ? (
                <>
                  <CheckRow testID="sms-select-all" label={`Tümünü seç${query.trim() ? " (aranan)" : ""}`} on={allOn} onPress={() => (allOn ? removeMany(items) : addMany(items))} strong />
                  {items.slice(0, shown).map((r) => (
                    <CheckRow key={r.phone} label={r.name || "İsimsiz"} sub={r.phone} on={sel[r.phone] !== undefined} onPress={() => (sel[r.phone] !== undefined ? removeMany([r]) : addMany([r]))} divider />
                  ))}
                </>
              ) : (
                <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>
                  {Array.isArray(current.data?.items) && current.data.items.length ? "Aramanıza uyan kayıt yok." : "Bu kaynakta cep numarası olan kayıt bulunamadı."}
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

function CheckRow({ label, sub, on, onPress, divider, strong, testID }: { label: string; sub?: string; on: boolean; onPress: () => void; divider?: boolean; strong?: boolean; testID?: string }) {
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
      <Text style={[strong ? type.bodyStrong : type.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={[type.caption, tabular, { color: colors.textTertiary }]}>{sub}</Text> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  result: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
  selbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  consent: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  check: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 48 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
