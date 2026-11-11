import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { createReferralLink, getReferralConfig, sendReferralEmailInvite } from "../src/api-fatura-hesap";
import { EmptyState } from "../src/components/EmptyState";
import { CheckIcon, ClockIcon, LinkIcon, MailIcon, SparkleIcon } from "../src/components/Icons";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, type } from "../src/theme/tokens";
import { Button } from "../src/ui/Button";
import { Chip, SegmentedControl } from "../src/ui/Chip";
import { useFeedback } from "../src/ui/Feedback";
import { StackHeader } from "../src/ui/Header";
import { HeroCard, ON_HERO } from "../src/ui/HeroCard";
import { Card, IconTile, ListRow, SectionTitle } from "../src/ui/ListRow";

const PLAN_LABELS: Record<string, string> = { trial: "Trial", starter: "Starter", growth: "Growth", enterprise: "Enterprise" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "link" | "email";
// Sunucuda davet listesi ucu yok; yalnızca bu ekranda oluşturulan davetler gösterilir.
type SentInvite = { id: string; title: string; detail: string; delivered: boolean };

const planLabel = (p: string) => PLAN_LABELS[p] || p.charAt(0).toLocaleUpperCase("tr-TR") + p.slice(1);

export default function InviteScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [plan, setPlan] = useState("");
  const [mode, setMode] = useState<Mode>("link");
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<SentInvite[]>([]);
  // Çift dokunuşta ikinci isteği durdurur (state güncellenmeden gelen ikinci basış).
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const cfg = await getReferralConfig(token);
      setPlans(cfg.allowedPlans);
      setPlan((prev) => (prev && cfg.allowedPlans.includes(prev) ? prev : cfg.defaultPlan));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Davet ayarları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const choosePlan = (p: string) => {
    // İstek sürerken plan değişirse dönen bağlantı yanlış plan adıyla gösterilirdi.
    if (p === plan || busy || inFlight.current) return;
    setPlan(p);
    // Bağlantı plana özeldir; plan değişince eski bağlantı gösterilmez.
    setLink("");
  };

  const share = async (url: string) => {
    try {
      await Share.share({ message: `ObiHub'ı denemeniz için davet bağlantım: ${url}` });
    } catch {
      toast("Paylaşım açılamadı. Bağlantıya basılı tutarak kopyalayabilirsiniz.", "error");
    }
  };

  const generate = async () => {
    if (!token || !plan || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const url = await createReferralLink(token, plan);
      if (!url) throw new Error("Sunucu bağlantı döndürmedi.");
      setLink(url);
      setSent((prev) => [{ id: url, title: "Davet bağlantısı", detail: `${planLabel(plan)} · paylaşıma hazır`, delivered: true }, ...prev]);
      toast("Davet bağlantısı oluşturuldu.", "success");
    } catch (e: any) {
      toast(e?.message || "Bağlantı oluşturulamadı.", "error");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(cleanEmail);
  const canSend = Boolean(plan) && cleanName.length > 0 && emailValid;

  const sendEmail = async () => {
    if (!token || !canSend || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await sendReferralEmailInvite(token, { plan, name: cleanName, email: cleanEmail, phone: phone.trim() || null });
      setSent((prev) => [
        {
          id: `${cleanEmail}-${Date.now()}`,
          title: cleanName,
          detail: `${cleanEmail} · ${planLabel(plan)}`,
          delivered: r.success,
        },
        ...prev,
      ]);
      if (r.success) {
        toast(r.message || "Davet gönderildi.", "success");
        setName("");
        setPhone("");
        setEmail("");
      } else {
        // Kayıt açıldı ama e-posta gitmedi: bağlantı elle paylaşılabilsin.
        toast(r.message || "Davet kaydedildi ancak e-posta gönderilemedi.", "error");
        if (r.invite_url) {
          setLink(r.invite_url);
          setMode("link");
        }
      }
    } catch (e: any) {
      toast(e?.message || "Davet gönderilemedi.", "error");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];
  const label = [type.callout, styles.label, { color: colors.textSecondary }];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="invite-screen">
      <StackHeader title="Davet et, kazan" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : error ? (
        <EmptyState
          icon={<SparkleIcon size={30} color={colors.primary} />}
          title="Davet ayarları yüklenemedi"
          description={error}
          actionLabel="Tekrar deneyin"
          onAction={load}
        />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<SparkleIcon size={30} color={colors.primary} />}
          title="Davet şu an kapalı"
          description="Davet için etkin bir abonelik planı bulunmuyor."
        />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <HeroCard tone="violet" style={{ marginTop: spacing.sm }}>
              <View style={styles.heroBadge}>
                <SparkleIcon size={22} color={ON_HERO.text} />
              </View>
              <Text style={[type.title, { color: ON_HERO.text, marginTop: spacing.md }]}>Arkadaşınızı davet edin</Text>
              <Text style={[type.body, { color: ON_HERO.soft, marginTop: spacing.xxs }]}>
                Davet ettiğiniz işletme ilk ödemesini yaptığında 3 ay kazanırsınız.
              </Text>
              <View style={styles.heroSteps}>
                {["Planı seçin", "Bağlantıyı paylaşın", "3 ay kazanın"].map((s, i) => (
                  <View key={s} style={styles.heroStep}>
                    <View style={styles.heroStepNo}>
                      <Text style={[type.caption, { color: ON_HERO.text, fontWeight: "700" }]}>{i + 1}</Text>
                    </View>
                    <Text style={[type.caption, { color: ON_HERO.soft, flexShrink: 1 }]}>{s}</Text>
                  </View>
                ))}
              </View>
            </HeroCard>

            <SectionTitle title="Abonelik planı" />
            <View style={styles.plans}>
              {plans.map((p) => (
                <Chip key={p} testID={`invite-plan-${p}`} label={planLabel(p)} selected={plan === p} onPress={() => choosePlan(p)} />
              ))}
            </View>
            <Text style={[type.caption, styles.hint, { color: colors.textTertiary }]}>Davet bu plan için oluşturulur.</Text>

            <SectionTitle title="Davet yöntemi" />
            <SegmentedControl<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "link", label: "Bağlantı" },
                { value: "email", label: "E-posta" },
              ]}
            />

            {mode === "link" ? (
              <View style={styles.section}>
                {link ? (
                  <View style={[styles.linkCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.emerald }]} testID="invite-link-card">
                    <View style={styles.linkHead}>
                      <CheckIcon size={16} color={colors.emerald} />
                      <Text style={[type.caption, { color: colors.emerald, fontWeight: "700" }]}>Bağlantı hazır · {planLabel(plan)}</Text>
                    </View>
                    <Text
                      testID="invite-link"
                      selectable
                      style={[type.callout, styles.linkText, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      {link}
                    </Text>
                    <Button
                      testID="invite-share"
                      label="Bağlantıyı paylaş"
                      icon={<LinkIcon size={18} color={ON_HERO.text} />}
                      onPress={() => share(link)}
                      style={{ marginTop: spacing.sm }}
                    />
                    <Button testID="invite-regenerate" label="Yeni bağlantı oluştur" variant="ghost" size="sm" busy={busy} onPress={generate} style={{ marginTop: spacing.xs }} />
                  </View>
                ) : (
                  <>
                    <Text style={[type.callout, { color: colors.textSecondary }]}>
                      Bağlantıyı oluşturun; WhatsApp, mesaj veya dilediğiniz uygulama ile paylaşın.
                    </Text>
                    <Button
                      testID="invite-generate"
                      label="Davet bağlantısı oluştur"
                      icon={<LinkIcon size={18} color={ON_HERO.text} />}
                      busy={busy}
                      disabled={!plan}
                      onPress={generate}
                      style={{ marginTop: spacing.md }}
                    />
                  </>
                )}
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={[type.callout, { color: colors.textSecondary }]}>Davet e-postasını ObiHub sizin adınıza gönderir.</Text>
                <Text style={label}>Ad Soyad</Text>
                <TextInput
                  testID="invite-name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Ad Soyad"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Ad Soyad"
                  autoCapitalize="words"
                  maxLength={120}
                  returnKeyType="next"
                  style={inputStyle}
                />
                <Text style={label}>E-posta</Text>
                <TextInput
                  testID="invite-email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@firma.com"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="E-posta"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={160}
                  style={inputStyle}
                />
                {email.trim().length > 0 && !emailValid ? (
                  <Text style={[type.caption, { color: colors.error, marginTop: spacing.xs }]}>Geçerli bir e-posta adresi yazın.</Text>
                ) : null}
                <Text style={label}>Telefon (isteğe bağlı)</Text>
                <TextInput
                  testID="invite-phone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="05xx xxx xx xx"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel="Telefon"
                  keyboardType="phone-pad"
                  maxLength={20}
                  style={inputStyle}
                />
                <Button
                  testID="invite-send"
                  label="Daveti gönder"
                  icon={<MailIcon size={18} color={ON_HERO.text} />}
                  busy={busy}
                  disabled={!canSend}
                  onPress={sendEmail}
                  style={{ marginTop: spacing.lg }}
                />
              </View>
            )}

            {sent.length > 0 ? (
              <>
                <SectionTitle title="Bu oturumdaki davetler" />
                <Card style={styles.block}>
                  {sent.map((s, i) => (
                    <ListRow
                      key={s.id}
                      divider={i > 0}
                      leading={
                        <IconTile tint={s.delivered ? colors.emeraldSoft : colors.amberSoft}>
                          {s.delivered ? <CheckIcon size={18} color={colors.emerald} /> : <ClockIcon size={18} color={colors.amber} />}
                        </IconTile>
                      }
                      title={s.title}
                      subtitle={s.detail}
                      meta={s.delivered ? undefined : "E-posta gönderilemedi"}
                    />
                  ))}
                </Card>
                <Text style={[type.caption, styles.hint, { color: colors.textTertiary }]}>
                  Liste yalnızca bu ekranda oluşturduğunuz davetleri gösterir; ekrandan çıkınca temizlenir.
                </Text>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { paddingBottom: spacing.huge },
  block: { marginHorizontal: spacing.lg },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  plans: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginHorizontal: spacing.lg },
  hint: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  label: { marginTop: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontSize: 15, marginTop: spacing.xs },
  heroBadge: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  heroSteps: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  heroStep: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  heroStepNo: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: ON_HERO.faint },
  linkCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  linkHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
});
