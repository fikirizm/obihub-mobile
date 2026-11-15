// Bildirim izni açıklama ekranı (sistem izninden ÖNCE). Kullanıcı isteği (15 Kas 2026): uygulama arka plandayken yeni sipariş
// kilit ekranına "yeni sipariş" sesiyle düşsün. İzin yalnız "Bildirimleri aç"tan sonra sistemden istenir; "Şimdi değil" 7 gün susturur.
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAuth } from "../auth/AuthProvider";
import { shouldShowPushPrompt } from "../push-ui";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { Button } from "../ui/Button";
import { BellIcon, CheckIcon } from "./Icons";

const POINTS = [
  "Yeni sipariş kilit ekranına düşer, özel \"yeni sipariş\" sesiyle.",
  "Bildirime dokununca sipariş doğrudan açılır.",
  "Kilit ekranında müşteri adı gösterilmez; tutarı da ayarlardan gizleyebilirsiniz.",
];

export function PushPrompt() {
  const { token, pushStatus, pushPromptAt, enableNotifications, dismissPushPrompt } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  if (Platform.OS === "web" || !token || closed || !shouldShowPushPrompt(pushStatus, pushPromptAt)) return null;

  const allow = async () => {
    setBusy(true);
    await enableNotifications();
    setBusy(false);
    setClosed(true);
  };
  const later = async () => {
    setClosed(true);
    await dismissPushPrompt();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={later} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} onPress={later} accessibilityLabel="Kapat" />
      <View style={styles.end} pointerEvents="box-none">
        <View testID="push-prompt" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.badgeWrap}>
            <Svg width={72} height={72} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="push-g" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#247ee8" />
                  <Stop offset="1" stopColor="#16beb4" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={72} height={72} rx={22} fill="url(#push-g)" />
            </Svg>
            <BellIcon size={32} color="#FFFFFF" strokeWidth={2.2} />
          </View>
          <Text accessibilityRole="header" style={[type.title, styles.center, { color: colors.textPrimary }]}>
            Yeni siparişleri anında duyun
          </Text>
          <Text style={[type.callout, styles.center, { color: colors.textSecondary }]}>Uygulama kapalıyken bile siparişler size ulaşsın.</Text>
          <View style={styles.points}>
            {POINTS.map((p) => (
              <View key={p} style={styles.point}>
                <View style={[styles.tick, { backgroundColor: colors.successBg }]}>
                  <CheckIcon size={13} color={colors.success} />
                </View>
                <Text style={[type.callout, { color: colors.textPrimary, flex: 1 }]}>{p}</Text>
              </View>
            ))}
          </View>
          <Button testID="push-prompt-allow" label="Bildirimleri aç" busy={busy} onPress={allow} />
          <Button testID="push-prompt-later" variant="ghost" label="Şimdi değil" disabled={busy} onPress={later} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  end: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.lg, gap: spacing.sm },
  badgeWrap: { width: 72, height: 72, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  center: { textAlign: "center" },
  points: { gap: spacing.sm, marginVertical: spacing.sm },
  point: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
