import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { request } from "../../src/api";
import { hepsiJetVisible } from "../../src/hepsijet-ui";
import { useNotifications } from "../../src/notifications/store";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, type } from "../../src/theme/tokens";
import { BellIcon, ChartIcon, LogoutIcon, MailIcon, PackageIcon, PhoneIcon, RefreshIcon, SettingsIcon, SparkleIcon, TruckIcon, WalletIcon } from "../../src/components/Icons";
import { canAccess, canManage, canSeeReceipts, canSell } from "../../src/auth/permissions";
import { TabHeader } from "../../src/ui/Header";
import { useFeedback } from "../../src/ui/Feedback";
import { Card, IconTile, ListRow, SectionTitle } from "../../src/ui/ListRow";

export default function MenuScreen() {
  const { user, logout, token } = useAuth();
  // Web kenar menüsüyle aynı (useNavVisibility.js): destek modülü super admin tarafından kapatıldıysa menüde görünmez.
  // Liste okunamazsa görünür kalır.
  const [supportEnabled, setSupportEnabled] = useState(true);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    request<any>("/integration-providers", { method: "GET" }, token)
      .then((res) => {
        const rows: any[] = Array.isArray(res?.items) ? res.items : [];
        if (alive) setSupportEnabled(rows.some((x) => String(x?.key || "").toLowerCase() === "support_center"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  // HepsiJet yalnız kurulu firmada görünür (GET /hepsijet/config → configured); Menü'ye her dönüşte yeniden okunur,
  // okunamazsa gizli. HepsiJet entegrasyon listesinde yer almaz.
  const [hepsijet, setHepsijet] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let alive = true;
      request<any>("/hepsijet/config", { method: "GET" }, token)
        .then((cfg) => alive && setHepsijet(hepsiJetVisible(cfg)))
        .catch(() => alive && setHepsijet(false));
      return () => {
        alive = false;
      };
    }, [token])
  );
  const { colors } = useTheme();
  const { unread } = useNotifications();
  const { confirm } = useFeedback();

  const canProducts = canAccess(user, "catalog") || canAccess(user, "inventory");
  const canReports = canAccess(user, "reports");
  const canPos = canSell(user);
  const showOps = canPos || canSeeReceipts(user) || canAccess(user, "settings") || canProducts || canReports || canAccess(user, "catalog") || hepsijet;

  const onLogout = async () => {
    const ok = await confirm({
      title: "Çıkış yapılsın mı?",
      message: "Hesabınıza tekrar giriş yapmanız gerekir.",
      confirmLabel: "Çıkış yap",
      destructive: true,
    });
    if (ok) await logout();
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="menu-screen">
      <TabHeader title="Menü" eyebrow={user?.company_name || undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {showOps ? (
          <>
        <SectionTitle title="Operasyon" />
        <Card style={styles.block}>
          {canPos ? (
            <ListRow
              testID="menu-pos"
              leading={<IconTile tint={colors.successBg}><WalletIcon size={18} color={colors.success} /></IconTile>}
              title="Hızlı satış"
              subtitle="Barkod okut, sepete ekle, tahsil et"
              chevron
              onPress={() => router.push("/pos")}
            />
          ) : null}
          {canAccess(user, "settings") ? (
            <ListRow
              testID="menu-web-store"
              divider={canPos || canSeeReceipts(user)}
              leading={<IconTile tint={colors.primarySoft}><SparkleIcon size={18} color={colors.primary} /></IconTile>}
              title="Web Mağaza"
              subtitle="Yayın, sepet rezervasyonu ve ödemeler"
              chevron
              onPress={() => router.push("/website" as Href)}
            />
          ) : null}
          {canAccess(user, "orders") ? (
            <ListRow
              testID="menu-returns"
              divider
              leading={<IconTile tint={colors.warningBg}><RefreshIcon size={18} color={colors.warning} /></IconTile>}
              title="İade talepleri"
              subtitle="Trendyol ve Hepsiburada iadeleri, stok önerisi"
              chevron
              onPress={() => router.push("/marketplace-returns" as Href)}
            />
          ) : null}
          {canAccess(user, "settings") ? (
            <ListRow
              testID="menu-sms"
              divider
              leading={<IconTile tint={colors.violetSoft}><PhoneIcon size={18} color={colors.violet} /></IconTile>}
              title="SMS"
              subtitle="Netgsm, sipariş SMS'leri ve toplu SMS"
              chevron
              onPress={() => router.push("/sms" as Href)}
            />
          ) : null}
          {canSeeReceipts(user) ? (
            <ListRow
              testID="menu-pos-receipts"
              divider={canPos || canAccess(user, "settings")}
              leading={<IconTile tint={colors.successBg}><WalletIcon size={18} color={colors.success} /></IconTile>}
              title="Satış Fişleri"
              subtitle="Mağaza satışları, fiş detayı ve fatura bağlantısı"
              chevron
              onPress={() => router.push("/pos-receipts" as Href)}
            />
          ) : null}
          {canAccess(user, "catalog") || canAccess(user, "inventory") ? (
            <ListRow
              testID="menu-products"
              divider={canPos || canSeeReceipts(user)}
              leading={<IconTile tint={colors.primarySoft}><PackageIcon size={18} color={colors.primary} /></IconTile>}
              title="Ürünler ve stok"
              subtitle="Arama, barkod, stok ve fiyat"
              chevron
              onPress={() => router.push("/products")}
            />
          ) : null}
          {canAccess(user, "inventory") ? (
            <ListRow
              testID="menu-dispatch"
              divider
              leading={<IconTile tint={colors.primarySoft}><PackageIcon size={18} color={colors.primary} /></IconTile>}
              title="İrsaliyeler"
              subtitle="Giden ve gelen irsaliyeler, e-İrsaliye"
              chevron
              onPress={() => router.push("/dispatch" as any)}
            />
          ) : null}
          {hepsijet ? (
            <ListRow
              testID="menu-hepsijet"
              divider={canPos || canProducts}
              leading={<IconTile tint={colors.hepsijetSoft}><TruckIcon size={18} color={colors.hepsijet} /></IconTile>}
              title="HepsiJet"
              subtitle="Manuel gönderi, etiket ve alıcılar"
              chevron
              onPress={() => router.push("/hepsijet")}
            />
          ) : null}
          {canAccess(user, "reports") ? (
            <ListRow
              testID="menu-reports"
              divider={canProducts || canPos || hepsijet}
              leading={<IconTile tint={colors.violetSoft}><ChartIcon size={18} color={colors.violet} /></IconTile>}
              title="Raporlar"
              subtitle="Satış, kanal ve ürün analizi"
              chevron
              onPress={() => router.push("/reports")}
            />
          ) : null}
          {canAccess(user, "catalog") ? (
            <ListRow
              testID="menu-jobs"
              divider={canProducts || canReports || canPos || hepsijet}
              leading={<IconTile tint={colors.infoBg}><RefreshIcon size={18} color={colors.info} /></IconTile>}
              title="Senkron işleri"
              subtitle="Ürün eşitleme sonuçları"
              chevron
              onPress={() => router.push("/jobs")}
            />
          ) : null}
        </Card>
          </>
        ) : null}

        <SectionTitle title="Hesap" />
        <Card style={styles.block}>
          <ListRow
            testID="menu-notifications"
            leading={<IconTile tint={colors.amberSoft}><BellIcon size={18} color={colors.amber} /></IconTile>}
            title="Bildirimler"
            subtitle={unread > 0 ? `${unread} okunmamış` : "Okunmamış bildirim yok"}
            chevron
            onPress={() => router.push("/notifications")}
          />
          {supportEnabled ? (
            <ListRow
              testID="menu-support"
              divider
              leading={<IconTile tint={colors.emeraldSoft}><MailIcon size={18} color={colors.emerald} /></IconTile>}
              title="Destek"
              subtitle="Talepleriniz ve yanıtlar"
              chevron
              onPress={() => router.push("/support")}
            />
          ) : null}
          <ListRow
            testID="menu-subscription"
            divider
            leading={<IconTile tint={colors.violetSoft}><WalletIcon size={18} color={colors.violet} /></IconTile>}
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
