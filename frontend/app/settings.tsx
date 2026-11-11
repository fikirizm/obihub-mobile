import React from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "../src/auth/AuthProvider";
import { useAppLock } from "../src/security/AppLock";
import { useTheme } from "../src/theme/ThemeProvider";
import { spacing, type } from "../src/theme/tokens";
import { StackHeader } from "../src/ui/Header";
import { SegmentedControl } from "../src/ui/Chip";
import { useFeedback } from "../src/ui/Feedback";
import { Button } from "../src/ui/Button";
import { Card, ListRow, SectionTitle } from "../src/ui/ListRow";

const ROLE_LABELS: Record<string, string> = {
  owner: "Hesap sahibi",
  admin: "Yönetici",
  manager: "Müdür",
  operator: "Operatör",
  accountant: "Muhasebe",
  support: "Destek",
  viewer: "İzleyici",
};

function Value({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.callout, { color: colors.textSecondary, maxWidth: 190 }]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const { confirm, toast } = useFeedback();
  const appLock = useAppLock();

  const onLogout = async () => {
    const ok = await confirm({
      title: "Çıkış yapılsın mı?",
      message: "Tekrar giriş yapana kadar bu cihaza sipariş bildirimi gelmez.",
      confirmLabel: "Çıkış yap",
      destructive: true,
    });
    if (ok) await logout();
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="settings-screen">
      <StackHeader title="Ayarlar" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <SectionTitle title="Profil" />
        <Card style={styles.block}>
          <ListRow title="Ad Soyad" trailing={<Value>{user?.full_name || "-"}</Value>} />
          <ListRow divider title="E-posta" trailing={<Value>{user?.email || "-"}</Value>} />
          <ListRow divider title="Firma" trailing={<Value>{user?.company_name || "-"}</Value>} />
          {user?.role ? <ListRow divider title="Rol" trailing={<Value>{ROLE_LABELS[user.role] || user.role}</Value>} /> : null}
        </Card>
        <Text style={[type.caption, styles.note, { color: colors.textTertiary }]}>Profil bilgileri web panelinden değiştirilir.</Text>

        <SectionTitle title="Görünüm" />
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "light", label: "Açık" },
            { value: "dark", label: "Koyu" },
          ]}
        />

        {appLock.supported ? (
          <>
            <SectionTitle title="Güvenlik" />
            <Card style={styles.block}>
              <ListRow
                title="Biyometrik kilit"
                subtitle="Açılışta Face ID veya parmak izi iste"
                trailing={
                  <Switch
                    testID="settings-app-lock"
                    accessibilityLabel="Biyometrik kilit"
                    value={appLock.enabled}
                    onValueChange={async (v) => {
                      const ok = await appLock.setEnabled(v);
                      if (!ok) toast("Kimlik doğrulanamadı, ayar değişmedi.", "error");
                    }}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                }
              />
            </Card>
          </>
        ) : null}

        <SectionTitle title="Uygulama" />
        <Card style={styles.block}>
          <ListRow title="Sürüm" trailing={<Value>{Constants.expoConfig?.version || "-"}</Value>} />
        </Card>

        <Button testID="settings-logout" label="Çıkış yap" variant="secondary" onPress={onLogout} style={{ marginHorizontal: spacing.lg, marginTop: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  note: { marginHorizontal: spacing.lg, marginTop: spacing.xs },
});
