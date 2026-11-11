import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { useTheme } from "../theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../theme/tokens";
import { ClockIcon } from "./Icons";
import { PressableScale } from "./KPICard";

// Aboneliği kilitli hesapta her veri çağrısı 403 döner. Boş ekranlar yerine nedenini gösterir.
// Abonelik işlemleri web panelden yapılır; uygulama içinde satın alma sunulmaz.
export function SubscriptionLockOverlay() {
  const { token, subscriptionLock, retrySubscription, logout } = useAuth();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  if (!token || !subscriptionLock) return null;
  // Backend mesajı "Abonelik erişimi pasif." ile başlar; başlık bunu zaten söylüyor.
  const message = subscriptionLock.replace(/^Abonelik erişimi pasif\.\s*/, "") || subscriptionLock;

  const retry = async () => {
    setBusy(true);
    try {
      await retrySubscription();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      testID="subscription-lock"
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        styles.wrap,
        { backgroundColor: colors.background, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.md]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.warningBg }]}>
          <ClockIcon size={26} color={colors.warning} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          Abonelik erişimi kapalı
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Aboneliğinizi ObiHub web panelinden yönetebilirsiniz.
        </Text>

        <PressableScale
          testID="subscription-lock-retry"
          onPress={retry}
          disabled={busy}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Tekrar dene</Text>}
        </PressableScale>
        <PressableScale
          testID="subscription-lock-logout"
          onPress={() => logout()}
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Çıkış yap</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: fontWeight.bold, letterSpacing: -0.4, textAlign: "center" },
  message: { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: spacing.xs },
  hint: { fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: spacing.sm },
  primaryBtn: {
    alignSelf: "stretch",
    height: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: fontWeight.semibold },
  secondaryBtn: {
    alignSelf: "stretch",
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: fontWeight.semibold },
});
