// Oturumlar ve cihazlar (GET /auth/sessions, DELETE /auth/sessions/{id}, POST /auth/sessions/revoke-others). Sözleşme §3.
// Bir cihazın oturumunu kapatmak o cihazın güvenilir cihaz belirtecini ve bildirim kaydını da siler (yeniden girişte kod istenir).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { deleteMobileSession, getMobileSessions, revokeOtherSessions, type MobileSession } from "../src/api";
import { useTheme } from "../src/theme/ThemeProvider";
import { spacing, type } from "../src/theme/tokens";
import { EmptyState } from "../src/components/EmptyState";
import { AlertIcon } from "../src/components/Icons";
import { StatusBadge } from "../src/components/StatusBadge";
import { Button } from "../src/ui/Button";
import { useFeedback } from "../src/ui/Feedback";
import { StackHeader } from "../src/ui/Header";
import { Card, ListRow } from "../src/ui/ListRow";

const when = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
};
const platformLabel = (p?: string) => (p === "ios" ? "iOS" : p === "android" ? "Android" : p === "web" ? "Web" : p || "");

export default function SessionsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<MobileSession[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await getMobileSessions(token));
      setState("ready");
    } catch (e: any) {
      setState([404, 405].includes(Number(e?.status)) ? "unavailable" : "error");
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (s: MobileSession) => {
    if (!token || busy) return;
    const ok = await confirm({
      title: "Bu cihazdaki oturum kapatılsın mı?",
      message: `${s.device_name || "Cihaz"} çıkış yapar; yeniden girişte e-posta kodu istenir ve bildirimleri durur.`,
      confirmLabel: "Oturumu kapat",
      destructive: true,
    });
    if (!ok) return;
    setBusy(s.id);
    try {
      await deleteMobileSession(token, s.id);
      toast("Oturum kapatıldı.", "success");
      load();
    } catch (e: any) {
      toast(e?.message || "Oturum kapatılamadı.", "error");
    } finally {
      setBusy("");
    }
  };
  const others = async () => {
    if (!token || busy) return;
    const ok = await confirm({ title: "Diğer tüm cihazlardan çıkış yapılsın mı?", message: "Bu cihaz açık kalır; diğer cihazlarda yeniden giriş gerekir.", confirmLabel: "Diğerlerinden çık", destructive: true });
    if (!ok) return;
    setBusy("others");
    try {
      const r = await revokeOtherSessions(token);
      toast(`${r?.revoked ?? 0} cihazın oturumu kapatıldı.`, "success");
      load();
    } catch (e: any) {
      toast(e?.message || "İşlem yapılamadı.", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="sessions-screen">
      <StackHeader title="Oturumlar ve cihazlar" />
      {state === "loading" ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : state === "unavailable" ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.textTertiary} />} title="Henüz kullanılamıyor" description="Cihaz yönetimi sunucu güncellemesiyle açılacak." />
      ) : state === "error" || !items ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Oturumlar okunamadı" description="Biraz sonra yeniden deneyin." actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Card>
            {items.map((s, i) => (
              <View key={s.id}>
                <ListRow
                  testID={`session-${s.id}`}
                  divider={i > 0}
                  title={s.device_name || "Cihaz"}
                  subtitle={[platformLabel(s.platform), s.app_version ? `v${s.app_version}` : null, `Son kullanım ${when(s.last_used_at)}`].filter(Boolean).join(" · ")}
                  meta={s.ip_hint ? `IP ${s.ip_hint}` : undefined}
                  trailing={s.current ? <StatusBadge label="Bu cihaz" kind="success" size="sm" /> : undefined}
                />
                {!s.current ? (
                  <View style={styles.rowAct}>
                    <Button testID={`session-${s.id}-delete`} size="sm" variant="ghost" label="Oturumu kapat" busy={busy === s.id} disabled={Boolean(busy)} onPress={() => remove(s)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
          {items.some((s) => !s.current) ? (
            <Button testID="sessions-revoke-others" variant="secondary" label="Diğer tüm cihazlardan çık" busy={busy === "others"} disabled={Boolean(busy)} onPress={others} />
          ) : (
            <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center" }]}>Yalnız bu cihazda oturum açık.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, body: { padding: spacing.lg, gap: spacing.md }, rowAct: { alignItems: "flex-end", paddingRight: spacing.sm, paddingBottom: spacing.xs } });
