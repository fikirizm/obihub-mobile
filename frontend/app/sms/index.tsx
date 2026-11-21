// Menü → SMS (Netgsm). Dört bölüm, web ile aynı sıra: Bağlantı, Otomatik SMS, Toplu SMS, Geçmiş. Tek kaynak GET /netgsm.
// Bağlantı formu yalnız firma sahibinde (can_manage_credentials); Netgsm şifresi yalnız bellekte durur, gönderilince silinir,
// cihazda saklanmaz. Ayarlar tek PUT /netgsm/settings (expected_revision; 409 DRAFT_CHANGED → yeniden yükle).
// Kurallar: src/sms.ts (saf, birim testli).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { fmtDate, MAX_ADMIN_PHONES, RULES, senderMissingText, senderRows, settingsError, toDraft, toPayload, type Draft } from "../../src/sms";
import { useTheme } from "../../src/theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../src/theme/tokens";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, CheckIcon } from "../../src/components/Icons";
import { PressableScale } from "../../src/components/KPICard";
import { StatusBadge } from "../../src/components/StatusBadge";
import { BulkSection } from "../../src/components/sms/BulkSection";
import { HistorySection } from "../../src/components/sms/HistorySection";
import { Note, SmsEditor, ToggleRow } from "../../src/components/sms/SmsParts";
import { Button } from "../../src/ui/Button";
import { SegmentedControl } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { FormField } from "../../src/ui/FormField";
import { StackHeader } from "../../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../../src/ui/ListRow";

type Tab = "connection" | "auto" | "bulk" | "history";
const TABS: { value: Tab; label: string }[] = [
  { value: "connection", label: "Bağlantı" },
  { value: "auto", label: "Otomatik" },
  { value: "bulk", label: "Toplu SMS" },
  { value: "history", label: "Geçmiş" },
];

export default function SmsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [view, setView] = useState<any>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("connection");
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setView(await request<any>("/netgsm", { method: "GET" }, token));
      setError("");
    } catch (e: any) {
      setError(Number(e?.status) === 403 ? "SMS ayarlarını görme yetkiniz yok. Yöneticinizden Ayarlar yetkisi isteyin." : e?.message || "SMS ayarları okunamadı.");
    } finally {
      setRefreshing(false);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);
  // Sunucudan yeni sürüm gelince taslak ondan kurulur (web useSettingsDraft ile aynı).
  useEffect(() => {
    if (!view) return;
    setDraft(toDraft(view));
    setSaveErr("");
    setConflict(false);
  }, [view?.revision, view?.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!token || saving || !view) return;
    setSaving(true);
    setSaveErr("");
    setConflict(false);
    try {
      setView(await request<any>("/netgsm/settings", { method: "PUT", body: JSON.stringify(toPayload(Number(view.revision) || 0, draft)) }, token));
      toast("Ayarlar kaydedildi.", "success");
    } catch (e: any) {
      const r = settingsError(e);
      setConflict(r.conflict);
      setSaveErr(r.text);
    } finally {
      setSaving(false);
    }
  };
  const patch = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d));
  const saveBar = (
    <View style={{ gap: spacing.xs }}>
      {saveErr ? (
        <Note tone="error" testID="sms-save-error">
          <Text style={[type.footnote, { color: colors.error }]}>{saveErr}</Text>
          {conflict ? <Button variant="ghost" size="sm" label="Yeniden yükle" onPress={load} style={{ alignSelf: "flex-start" }} /> : null}
        </Note>
      ) : null}
      <Button testID="sms-save" label={saving ? "Kaydediliyor…" : "Kaydet"} busy={saving} disabled={saving || conflict} onPress={save} />
    </View>
  );

  if (!view && !error)
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <StackHeader title="SMS" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );

  const missing = view ? senderMissingText(view) : "";
  const locked = view && !view.connected && (tab === "auto" || tab === "bulk");
  return (
    <KeyboardAvoidingView style={[styles.wrap, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="sms-screen">
      <StackHeader title="SMS" subtitle={view ? (view.connected ? (view.auth_failed ? "Netgsm erişim sorunu" : `Netgsm · ${view.sender || "gönderici adı seçilmedi"}`) : "Netgsm bağlı değil") : undefined} />
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="SMS açılamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <>
          <View style={styles.tabs}>
            <SegmentedControl options={TABS} value={tab} onChange={setTab} />
          </View>
          <ScrollView
            key={tab}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.xs }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
          >
            {missing && tab !== "history" && !view.auth_failed ? (
              <View style={styles.block}>
                <Note tone="warning" testID="sms-sender-missing">{missing}</Note>
              </View>
            ) : null}
            {locked ? (
              <EmptyState
                icon={<AlertIcon size={30} color={colors.textTertiary} />}
                title="Önce Netgsm hesabınızı bağlayın"
                description="SMS göndermek için Netgsm kullanıcı adı ve şifrenizle bağlantı kurmanız gerekir."
                actionLabel="Bağlantıya git"
                onAction={() => setTab("connection")}
              />
            ) : null}
            {tab === "connection" ? <ConnectionSection token={token} view={view} onView={setView} draft={draft} patch={patch} saveBar={saveBar} /> : null}
            {tab === "auto" && !locked ? <AutoSection token={token} view={view} draft={draft} patch={patch} saveBar={saveBar} /> : null}
            {tab === "bulk" && !locked ? <BulkSection token={token} view={view} goConnection={() => setTab("connection")} /> : null}
            {tab === "history" ? <HistorySection token={token} /> : null}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function ConnectionSection({ token, view, onView, draft, patch, saveBar }: { token: string | null; view: any; onView: (v: any) => void; draft: Draft; patch: (fn: (d: Draft) => Draft) => void; saveBar: React.ReactNode }) {
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const can = view?.can_manage_credentials === true;
  const [removing, setRemoving] = useState(false);
  const [sendersBusy, setSendersBusy] = useState(false);
  const [sendersErr, setSendersErr] = useState("");
  const [balance, setBalance] = useState<{ status: "loading" | "ready" | "error"; items: { name: string; amount: string }[]; msg?: string }>({ status: "loading", items: [] });

  const loadBalance = useCallback(() => {
    if (!token || !view?.connected) return;
    setBalance({ status: "loading", items: [] });
    request<any>("/netgsm/balance", { method: "GET" }, token)
      .then((d) => setBalance({ status: "ready", items: Array.isArray(d?.items) ? d.items : [] }))
      .catch((e: any) => setBalance({ status: "error", items: [], msg: e?.message || "Bakiye okunamadı." }));
  }, [token, view?.connected]);
  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const remove = async () => {
    if (!token || removing) return;
    const ok = await confirm({ title: "Netgsm bağlantısı kaldırılsın mı?", message: "Kaldırırsanız otomatik ve toplu SMS gönderimi durur. Kayıtlı kullanıcı adı ve şifre silinir; istediğiniz zaman yeniden bağlayabilirsiniz.", confirmLabel: "Bağlantıyı kaldır", destructive: true });
    if (!ok) return;
    setRemoving(true);
    try {
      onView(await request<any>("/netgsm/credentials", { method: "DELETE" }, token));
      toast("Netgsm bağlantısı kaldırıldı.", "success");
    } catch (e: any) {
      toast(e?.message || "Bağlantı kaldırılamadı.", "error");
    } finally {
      setRemoving(false);
    }
  };
  const refreshSenders = async () => {
    if (!token) return;
    setSendersBusy(true);
    setSendersErr("");
    try {
      const r = await request<any>("/netgsm/senders", { method: "GET" }, token);
      onView({ ...view, senders: Array.isArray(r?.senders) ? r.senders : [] });
    } catch (e: any) {
      setSendersErr(e?.message || "Liste yenilenemedi.");
    } finally {
      setSendersBusy(false);
    }
  };

  const senders = senderRows(view?.senders);
  return (
    <View style={{ gap: spacing.xs }} testID="sms-connection">
      {view?.auth_failed ? (
        <View style={styles.block}>
          <Note tone="warning">{`Netgsm hesabınıza erişilemiyor. ${view.last_error || "Kullanıcı adı veya şifre artık geçerli değil."} Yeniden bağlanın.`}</Note>
        </View>
      ) : null}
      {!view?.connected && !can ? (
        <View style={styles.block}>
          <Note>Netgsm hesabını yalnız firma sahibi bağlayabilir. Firma sahibi bağladığında burada görürsünüz.</Note>
        </View>
      ) : null}
      {can && (!view?.connected || view?.auth_failed) ? <CredentialsForm token={token} initialUser={String(view?.username || "")} reconnect={!!view?.connected} onView={onView} /> : null}
      {view?.connected ? (
        <>
          <SectionTitle title="Netgsm hesabı" />
          <Card style={styles.block}>
            <ListRow title="Kullanıcı adı" trailing={<Text style={[type.callout, tabular, { color: colors.textPrimary }]}>{view.username || "—"}</Text>} />
            <ListRow divider title="Durum" trailing={<StatusBadge label={view.auth_failed ? "Erişim sorunu" : "Bağlı"} kind={view.auth_failed ? "error" : "success"} size="sm" />} />
            {view.verified_at ? <ListRow divider title="Son doğrulama" trailing={<Text style={[type.callout, tabular, { color: colors.textSecondary }]}>{fmtDate(view.verified_at)}</Text>} /> : null}
          </Card>
          {can ? (
            <View style={styles.block}>
              <Button testID="sms-disconnect" variant="ghost" size="sm" label={removing ? "Kaldırılıyor…" : "Bağlantıyı kaldır"} disabled={removing} onPress={remove} style={{ alignSelf: "flex-start" }} />
            </View>
          ) : (
            <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>Netgsm hesabını yalnız firma sahibi bağlayabilir.</Text>
          )}

          <SectionTitle title="Bakiye" action={<Button variant="ghost" size="sm" label="Yenile" onPress={loadBalance} />} />
          <Card style={styles.block}>
            {balance.status === "loading" ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} /> : null}
            {balance.status === "error" ? <Text style={[type.footnote, { color: colors.error, padding: spacing.md }]}>{balance.msg}</Text> : null}
            {balance.status === "ready" ? (
              balance.items.length ? (
                balance.items.map((it, i) => (
                  <ListRow key={`${it.name}-${i}`} divider={i > 0} title={String(it.name)} trailing={<Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{String(it.amount)}</Text>} />
                ))
              ) : (
                <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Netgsm bakiye bilgisi döndürmedi.</Text>
              )
            ) : null}
          </Card>

          <SectionTitle title="Gönderici adı" action={<Button variant="ghost" size="sm" label={sendersBusy ? "Yenileniyor…" : "Listeyi yenile"} disabled={sendersBusy} onPress={refreshSenders} />} />
          <Card style={styles.block}>
            {senders.length ? (
              senders.map((s, i) => {
                const on = draft.sender === s.name;
                return (
                  <PressableScale
                    key={s.name}
                    testID={`sms-sender-${s.name}`}
                    disabled={!s.usable}
                    onPress={() => patch((d) => ({ ...d, sender: s.name }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: !s.usable }}
                    accessibilityLabel={s.name}
                    style={[styles.sender, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, !s.usable && { opacity: 0.55 }]}
                  >
                    <View style={[styles.radio, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>{on ? <CheckIcon size={12} color="#fff" /> : null}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{s.name}</Text>
                      <Text style={[type.caption, { color: colors.textTertiary }]}>{s.typeLabel}</Text>
                      {s.reason ? <Text style={[type.caption, { color: colors.error }]}>{s.reason}</Text> : null}
                    </View>
                  </PressableScale>
                );
              })
            ) : (
              <Text style={[type.footnote, { color: colors.textTertiary, padding: spacing.md }]}>Henüz gönderici adı bulunamadı. Netgsm panelinizde bir başlık tanımlayıp listeyi yenileyin.</Text>
            )}
          </Card>
          {sendersErr ? (
            <View style={styles.block}>
              <Note tone="error">{sendersErr}</Note>
            </View>
          ) : null}

          <SectionTitle title="Gönderim ayarları" />
          <Card style={styles.block}>
            <ToggleRow
              testID="sms-encoding"
              title="Türkçe karakterleri koru"
              hint="Kapalıyken Türkçe karakterler sadeleşebilir; tek SMS'e daha çok karakter sığar."
              value={draft.encoding === "TURKISH"}
              onChange={(v) => patch((d) => ({ ...d, encoding: v ? "TURKISH" : "DEFAULT" }))}
            />
          </Card>
          <View style={[styles.block, { gap: spacing.sm, marginTop: spacing.xs }]}>
            <FormField testID="sms-store-name" label="Mağaza adı" hint="Mesajlarda [magaza] yerine bu ad yazılır." maxLength={60} value={draft.store_name} onChangeText={(v) => patch((d) => ({ ...d, store_name: v }))} />
            {saveBar}
          </View>
        </>
      ) : null}
    </View>
  );
}

// Şifre yalnız bu bileşenin belleğinde durur; gönderimden sonra silinir, hiçbir depoya yazılmaz.
function CredentialsForm({ token, initialUser, reconnect, onView }: { token: string | null; initialUser: string; reconnect: boolean; onView: (v: any) => void }) {
  const { toast } = useFeedback();
  const { colors } = useTheme();
  const [username, setUsername] = useState(initialUser);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!token || busy || !username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const next = await request<any>("/netgsm/credentials", { method: "PUT", body: JSON.stringify({ username: username.trim(), password }) }, token);
      setPassword("");
      onView(next);
      toast("Netgsm hesabınız bağlandı.", "success");
    } catch (e: any) {
      // Hatalı girişte kendiliğinden yineleme yok; kullanıcı düzeltip yeniden basar.
      setError(e?.message || "Netgsm'e bağlanılamadı.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle title={reconnect ? "Yeniden bağlanın" : "Netgsm hesabınızı bağlayın"} />
      <View style={[styles.block, { gap: spacing.sm }]} testID="sms-credentials">
        <FormField
          testID="sms-username"
          label="Kullanıcı adı"
          hint="Netgsm abone numaranız; başında 0 olmadan (850…)."
          value={username}
          onChangeText={setUsername}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
        />
        <FormField
          testID="sms-password"
          label="Şifre"
          hint="Güvenlik için kaydedildikten sonra bir daha gösterilmez; telefonda saklanmaz."
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          onSubmitEditing={submit}
        />
        <Text style={[type.caption, { color: colors.textTertiary }]}>Netgsm panelinizde API erişiminin açık olması gerekir.</Text>
        {error ? <Note tone="error" testID="sms-connect-error">{error}</Note> : null}
        <Button testID="sms-connect" label={busy ? "Bağlanıyor…" : "Bağlan"} busy={busy} disabled={busy || !username.trim() || !password} onPress={submit} />
      </View>
    </>
  );
}

function AdminPhones({ phones, onChange }: { phones: string[]; onChange: (p: string[]) => void }) {
  const { colors } = useTheme();
  const list = phones.length ? phones : [""];
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.callout, { color: colors.textSecondary, fontWeight: "600" }]}>Yetkili telefon numaraları</Text>
      {list.map((p, i) => (
        <View key={i} style={styles.phoneRow}>
          <FormField
            label={`Telefon ${i + 1}`}
            style={{ flex: 1 }}
            keyboardType="phone-pad"
            placeholder="0532 123 45 67"
            value={p}
            onChangeText={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
          />
          <Button variant="ghost" size="sm" label="Sil" onPress={() => onChange(list.filter((_, j) => j !== i))} style={styles.phoneDel} />
        </View>
      ))}
      {list.length < MAX_ADMIN_PHONES ? (
        <Button variant="secondary" size="sm" label="Numara ekle" onPress={() => onChange([...list, ""])} style={{ alignSelf: "flex-start" }} />
      ) : (
        <Text style={[type.caption, { color: colors.textTertiary }]}>{`En fazla ${MAX_ADMIN_PHONES} numara ekleyebilirsiniz.`}</Text>
      )}
    </View>
  );
}

function AutoSection({ token, view, draft, patch, saveBar }: { token: string | null; view: any; draft: Draft; patch: (fn: (d: Draft) => Draft) => void; saveBar: React.ReactNode }) {
  const { colors } = useTheme();
  const vars: string[] = Array.isArray(view?.variables?.order) ? view.variables.order : [];
  const setRule = (key: string, fn: (r: Draft["rules"][string]) => Draft["rules"][string]) => patch((d) => ({ ...d, rules: { ...d.rules, [key]: fn(d.rules[key]) } }));
  return (
    <View style={{ gap: spacing.xs }} testID="sms-auto">
      <SectionTitle title="Sipariş SMS'leri" />
      <Card style={styles.block}>
        <ToggleRow testID="sms-enabled" title="Sipariş SMS'lerini gönder" hint="Kapalıyken aşağıdaki kuralların hiçbiri çalışmaz." value={draft.enabled} onChange={(v) => patch((d) => ({ ...d, enabled: v }))} />
      </Card>
      <SectionTitle title="Hangi siparişler için?" />
      <Card style={styles.block}>
        <ToggleRow testID="sms-channel-website" title="Web mağazam" value={draft.channels.website} onChange={(v) => patch((d) => ({ ...d, channels: { ...d.channels, website: v } }))} />
        <ToggleRow testID="sms-channel-woo" divider title="WooCommerce" value={draft.channels.woocommerce} onChange={(v) => patch((d) => ({ ...d, channels: { ...d.channels, woocommerce: v } }))} />
      </Card>
      <View style={styles.block}>
        <Note>WooCommerce sitenizde Netgsm eklentisi de açıksa müşteriye iki SMS gider; birini kapatın.</Note>
      </View>
      <SectionTitle title="Mesajlar" />
      <Text style={[type.caption, styles.block, { color: colors.textTertiary }]}>Her olay için metni düzenleyin. Değişkenler SMS giderken gerçek bilgiyle dolar.</Text>
      {RULES.map(([key, title, hint]) => {
        const rule = draft.rules[key];
        return (
          <Card key={key} style={[styles.block, { marginTop: spacing.xs }]}>
            <ToggleRow testID={`sms-rule-${key}`} title={title} hint={hint} value={rule.enabled} onChange={(v) => setRule(key, (r) => ({ ...r, enabled: v }))} />
            {rule.enabled ? (
              <View style={styles.ruleBody}>
                {key === "admin_created" ? <AdminPhones phones={rule.phones || []} onChange={(phones) => setRule(key, (r) => ({ ...r, phones }))} /> : null}
                <SmsEditor
                  token={token}
                  testID={`sms-rule-${key}-text`}
                  label={`${title} mesajı`}
                  value={rule.text}
                  onChange={(text) => setRule(key, (r) => ({ ...r, text }))}
                  variables={vars}
                  scope="order"
                  encoding={draft.encoding}
                  placeholder="Mesaj metnini yazın"
                />
              </View>
            ) : rule.text ? (
              <Text style={[type.caption, styles.ruleQuiet, { color: colors.textTertiary }]} numberOfLines={2}>{rule.text}</Text>
            ) : null}
          </Card>
        );
      })}
      <View style={[styles.block, { marginTop: spacing.md }]}>{saveBar}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  tabs: { paddingBottom: spacing.sm },
  sender: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 56 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  phoneRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  phoneDel: { marginBottom: 4 },
  ruleBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  ruleQuiet: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
});
