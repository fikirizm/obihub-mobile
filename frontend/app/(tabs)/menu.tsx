import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { useNotifications } from "../../src/notifications/store";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { BellIcon, LogoutIcon, MailIcon, PackageIcon, PlugIcon, RefreshIcon, SettingsIcon, TruckIcon, WalletIcon } from "../../src/components/Icons";
import { canAccess } from "../../src/auth/permissions";
import { TabHeader } from "../../src/ui/Header";
import { useFeedback } from "../../src/ui/Feedback";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";

export default function MenuScreen() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const { unread } = useNotifications();
  const { confirm } = useFeedback();

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
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="menu-screen">
      <TabHeader title="Menü" subtitle={user?.company_name || undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <SectionTitle title="Operasyon" />
        <Card style={styles.block}>
          {canAccess(user, "catalog") || canAccess(user, "inventory") ? (
            <ListRow
              testID="menu-products"
              leading={<IconTile><PackageIcon size={18} color={colors.primary} /></IconTile>}
              title="Ürünler ve stok"
              subtitle="Arama, barkod, stok ve fiyat"
              chevron
              onPress={() => router.push("/products")}
            />
          ) : null}
          <ListRow
            testID="menu-integrations"
            divider
            leading={<IconTile><PlugIcon size={18} color={colors.primary} /></IconTile>}
            title="Mağazalar"
            subtitle="Bağlı kanallar ve sipariş eşitleme"
            chevron
            onPress={() => router.push("/integrations")}
          />
          <ListRow
            testID="menu-hepsijet"
            divider
            leading={<IconTile><TruckIcon size={18} color={colors.primary} /></IconTile>}
            title="HepsiJet Kargo"
            subtitle="Manuel gönderi ve etiket"
            chevron
            onPress={() => router.push("/hepsijet")}
          />
          {canAccess(user, "catalog") ? (
            <ListRow
              testID="menu-jobs"
              divider
              leading={<IconTile><RefreshIcon size={18} color={colors.primary} /></IconTile>}
              title="Senkron işleri"
              subtitle="Ürün eşitleme sonuçları"
              chevron
              onPress={() => router.push("/jobs")}
            />
          ) : null}
        </Card>

        <SectionTitle title="Hesap" />
        <Card style={styles.block}>
          <ListRow
            testID="menu-notifications"
            leading={<IconTile><BellIcon size={18} color={colors.primary} /></IconTile>}
            title="Bildirimler"
            subtitle={unread > 0 ? `${unread} okunmamış` : "Okunmamış bildirim yok"}
            chevron
            onPress={() => router.push("/notifications")}
          />
          <ListRow
            testID="menu-support"
            divider
            leading={<IconTile><MailIcon size={18} color={colors.primary} /></IconTile>}
            title="Destek"
            subtitle="Talepleriniz ve yanıtlar"
            chevron
            onPress={() => router.push("/support")}
          />
          <ListRow
            testID="menu-subscription"
            divider
            leading={<IconTile><WalletIcon size={18} color={colors.primary} /></IconTile>}
            title="Abonelik"
            subtitle="Paket ve kullanım"
            chevron
            onPress={() => router.push("/subscription")}
          />
          <ListRow
            testID="menu-settings"
            divider
            leading={<IconTile><SettingsIcon size={18} color={colors.primary} /></IconTile>}
            title="Ayarlar"
            subtitle="Profil ve görünüm"
            chevron
            onPress={() => router.push("/settings")}
          />
        </Card>

        <Card style={[styles.block, { marginTop: spacing.xl }]}>
          <ListRow
            testID="menu-logout"
            leading={<IconTile tint={colors.errorBg}><LogoutIcon size={18} color={colors.error} /></IconTile>}
            title="Çıkış yap"
            destructive
            onPress={onLogout}
          />
        </Card>

        <Text style={[type.caption, { color: colors.textTertiary, textAlign: "center", marginTop: spacing.xl, paddingHorizontal: spacing.xl }]}>
          Entegrasyon kurulumu, ürün ekleme ve paket işlemleri web panelinden yapılır.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 }, block: { marginHorizontal: spacing.lg } });
