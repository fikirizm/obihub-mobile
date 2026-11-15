// Bildirimler (GET/PATCH /mobile/notification-preferences; hesap bazlı, tüm cihazlar). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md §4.
// Yeni sipariş açık/kapalı, ses, kilit ekranında tutar, iOS "Zamana duyarlı", sessiz saatler, kanal süzgeci, test bildirimi.
// Her değişiklik kısmi PATCH ile hemen kaydedilir; hata olursa eski değer geri gelir.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { getNotificationPrefs, patchNotificationPrefs, sendPushTest, type NotificationPrefs } from "../src/api";
import { quietLabel, toggleMuted } from "../src/push-ui";
import { useTheme } from "../src/theme/ThemeProvider";
import { spacing, type } from "../src/theme/tokens";
import { EmptyState } from "../src/components/EmptyState";
import { AlertIcon } from "../src/components/Icons";
import { Button } from "../src/ui/Button";
import { Chip, ChipRow } from "../src/ui/Chip";
import { useFeedback } from "../src/ui/Feedback";
import { StackHeader } from "../src/ui/Header";
import { Card, ListRow, SectionTitle } from "../src/ui/ListRow";

const QUIET_PRESETS = [
  { label: "22:00 – 08:00", start: "22:00", end: "08:00" },
  { label: "23:00 – 07:00", start: "23:00", end: "07:00" },
  { label: "00:00 – 09:00", start: "00:00", end: "09:00" },
];

export default function NotificationSettingsScreen() {
  const { token, pushStatus, enableNotifications } = useAuth();
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setState("loading");
    try {
      setPrefs(await getNotificationPrefs(token));
      setState("ready");
    } catch (e: any) {
      setState([404, 405].includes(Number(e?.status)) ? "unavailable" : "error");
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<NotificationPrefs>) => {
    if (!token || !prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    try {
      setPrefs(await patchNotificationPrefs(token, patch));
    } catch (e: any) {
      setPrefs(before);
      toast(e?.message || "Ayar kaydedilemedi.", "error");
    }
  };
  const test = async () => {
    if (!token || testing) return;
    setTesting(true);
    try {
      const r = await sendPushTest(token);
      toast(`Test bildirimi ${r?.devices || 1} cihaza gönderildi.`, "success");
    } catch (e: any) {
      toast(e?.code === "NO_DEVICE" ? "Bu hesapta bildirim alan cihaz yok. Önce bildirimlere izin verin." : e?.message || "Test bildirimi gönderilemedi.", "error");
    } finally {
      setTesting(false);
    }
  };

  const sw = (testID: string, value: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <Switch testID={testID} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="notification-settings-screen">
      <StackHeader title="Bildirimler" />
      {state === "loading" ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : state === "unavailable" ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.textTertiary} />} title="Henüz kullanılamıyor" description="Bildirim tercihleri sunucu güncellemesiyle açılacak." />
      ) : state === "error" || !prefs ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Ayarlar okunamadı" description="Biraz sonra yeniden deneyin." actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge }}>
          {Platform.OS !== "web" && pushStatus !== "granted" ? (
            <Card style={[styles.block, styles.warn, { backgroundColor: colors.warningBg }]}>
              <Text style={[type.callout, { color: colors.textPrimary }]}>Bu cihazda bildirim izni kapalı; yeni siparişler kilit ekranına düşmez.</Text>
              <Button
                testID="notif-permission"
                size="sm"
                label={pushStatus === "denied" ? "Ayarları aç" : "Bildirimlere izin ver"}
                onPress={() => (pushStatus === "denied" ? Linking.openSettings() : enableNotifications())}
              />
            </Card>
          ) : null}
          {prefs.orders_view_allowed === false ? (
            <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Sipariş görme yetkiniz olmadığı için yeni sipariş bildirimi almazsınız.</Text>
          ) : null}

          <SectionTitle title="Yeni sipariş" />
          <Card style={styles.block}>
            <ListRow title="Yeni sipariş bildirimi" subtitle="Uygulama kapalıyken de kilit ekranına düşer" trailing={sw("notif-new-order", prefs.new_order, (v) => save({ new_order: v }))} />
            <ListRow divider title="Ses" subtitle="Sipariş sesiyle çalar; kapalıyken sessiz gelir" trailing={sw("notif-sound", prefs.sound, (v) => save({ sound: v }), !prefs.new_order)} />
            <ListRow divider title="Kilit ekranında tutarı göster" subtitle="Kapalıyken yalnız ürün sayısı görünür" trailing={sw("notif-amount", prefs.show_amount, (v) => save({ show_amount: v }), !prefs.new_order)} />
            {Platform.OS === "ios" ? (
              <ListRow divider title="Zamana duyarlı" subtitle="Odak modunda da gösterilir" trailing={sw("notif-time-sensitive", prefs.time_sensitive, (v) => save({ time_sensitive: v }), !prefs.new_order)} />
            ) : null}
          </Card>
          <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Kilit ekranında müşteri adı hiçbir zaman gösterilmez.</Text>

          <SectionTitle title="Sessiz saatler" />
          <Card style={styles.block}>
            <ListRow
              title="Sessiz saatler"
              subtitle={quietLabel(prefs.quiet_hours)}
              trailing={sw("notif-quiet", prefs.quiet_hours?.enabled === true, (v) => save({ quiet_hours: { ...prefs.quiet_hours, enabled: v } }), !prefs.new_order)}
            />
          </Card>
          {prefs.quiet_hours?.enabled ? (
            <ChipRow>
              {QUIET_PRESETS.map((q) => (
                <Chip
                  key={q.label}
                  testID={`notif-quiet-${q.start}`}
                  label={q.label}
                  selected={prefs.quiet_hours.start === q.start && prefs.quiet_hours.end === q.end}
                  onPress={() => save({ quiet_hours: { ...prefs.quiet_hours, enabled: true, start: q.start, end: q.end } })}
                />
              ))}
            </ChipRow>
          ) : null}
          <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Sessiz saatte bildirim yine gelir, ancak ses çıkarmaz.</Text>

          {prefs.available_channels?.length ? (
            <>
              <SectionTitle title="Kanallar" />
              <Text style={[type.caption, styles.note, { color: colors.textTertiary, marginBottom: spacing.xs }]}>Kapattığınız kanalın siparişleri bildirim üretmez.</Text>
              <ChipRow>
                {prefs.available_channels.map((c) => (
                  <Chip
                    key={c.key}
                    testID={`notif-channel-${c.key}`}
                    label={c.label}
                    selected={!prefs.muted_channels.includes(c.key)}
                    onPress={() => save({ muted_channels: toggleMuted(prefs.muted_channels, c.key) })}
                  />
                ))}
              </ChipRow>
            </>
          ) : null}

          <View style={[styles.block, { marginTop: spacing.lg, gap: spacing.xs }]}>
            <Button testID="notif-test" variant="secondary" label={testing ? "Gönderiliyor…" : "Test bildirimi gönder"} busy={testing} onPress={test} />
            {typeof prefs.registered_devices === "number" ? (
              <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>{`Bildirim alan cihaz: ${prefs.registered_devices}`}</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
  warn: { padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
});
