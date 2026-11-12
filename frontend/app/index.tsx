import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Stop, Circle as SvgCircle } from "react-native-svg";
import { useAuth } from "../src/auth/AuthProvider";
import { useTheme } from "../src/theme/ThemeProvider";
import { hitTarget, radius, spacing, type } from "../src/theme/tokens";
import { Button } from "../src/ui/Button";
import { PressableScale } from "../src/components/KPICard";
import { MoonIcon, SunIcon, SparkleIcon } from "../src/components/Icons";

const LOGOMAIN = require("../assets/obihub/obihub-logomain.png");
const ICO = require("../assets/obihub/obihub-ico.png");

export default function Index() {
  const { token, bootLoading, login } = useAuth();
  const { colors, mode, toggle, shadows } = useTheme();
  const glow = mode === "dark" ? colors.primarySoft : colors.heroAccent;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigated = useRef(false);

  useEffect(() => {
    if (!bootLoading && token && !navigated.current) {
      navigated.current = true;
      router.replace("/(tabs)/dashboard");
    }
  }, [bootLoading, token]);

  // Hide login form once we know the user is authenticated to avoid flash
  if (!bootLoading && token) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Yönlendirmeyi yukarıdaki effect yapar; burada ikinci kez yapılmaz.
      await login(email.trim(), password);
    } catch (e: any) {
      const msg = e?.message || "Giriş başarısız oldu.";
      // Süresi dolan/duraklatılan abonelik: web'de giriş yapılıp ödeme tamamlanabilir; mobilde satın alma yok.
      setError(e?.status === 403 ? `${msg} Aboneliğinizi ObiHub web panelinden yenileyebilirsiniz.` : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = (focused: boolean) => [
    styles.input,
    {
      backgroundColor: colors.surfaceMuted,
      color: colors.textPrimary,
      borderColor: focused ? colors.primary : colors.borderSubtle,
    },
  ];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="login-screen">
      <View style={styles.bgWrap} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={glow} stopOpacity="0.55" />
              <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="g2" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={glow} stopOpacity="0.35" />
              <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <SvgCircle cx={70} cy={120} r={180} fill="url(#g1)" />
          <SvgCircle cx={350} cy={680} r={220} fill="url(#g2)" />
        </Svg>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SafeAnimatedView entering={FadeIn.duration(500)} style={styles.topBar}>
            <View style={[styles.brandPill, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
              <Image source={ICO} style={styles.brandIcoSmall} resizeMode="contain" accessible={false} />
              <Text style={[type.footnote, styles.brandText, { color: colors.textPrimary }]}>obihub</Text>
            </View>

            <PressableScale
              onPress={toggle}
              testID="theme-toggle"
              accessibilityRole="button"
              accessibilityLabel={mode === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
              style={[styles.themeBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
            >
              {mode === "dark" ? (
                <SunIcon size={20} color={colors.warning} />
              ) : (
                <MoonIcon size={20} color={colors.textSecondary} />
              )}
            </PressableScale>
          </SafeAnimatedView>

          <SafeAnimatedView entering={FadeInDown.delay(80).duration(500)} style={styles.heroBlock}>
            <View style={[styles.heroChip, { backgroundColor: colors.primarySoft }]}>
              <SparkleIcon size={12} color={colors.primary} />
              <Text style={[type.caption, { color: colors.primary }]}>Bağlayın, eşitleyin, büyütün</Text>
            </View>
            <Image source={LOGOMAIN} style={styles.heroLogo} resizeMode="contain" accessibilityLabel="ObiHub" />
            <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.textPrimary }]}>
              Tüm pazaryerleriniz tek panelde
            </Text>
            <Text style={[type.callout, styles.heroSub, { color: colors.textSecondary }]}>
              Trendyol, Hepsiburada, n11 ve WooCommerce siparişlerinizi, faturalarınızı ve raporlarınızı tek yerden yönetin.
            </Text>
          </SafeAnimatedView>

          <SafeAnimatedView
            entering={FadeInUp.delay(160).duration(550)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.lg]}
          >
            <Text style={[type.caption, styles.formLabel, { color: colors.textSecondary }]}>E-posta</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              accessibilityLabel="E-posta"
              placeholder="ornek@firma.com"
              placeholderTextColor={colors.textTertiary}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              style={inputStyle(emailFocused)}
            />

            <Text style={[type.caption, styles.formLabel, { color: colors.textSecondary, marginTop: spacing.sm }]}>Şifre</Text>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
              accessibilityLabel="Şifre"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              style={inputStyle(passwordFocused)}
            />

            {error ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[styles.errorBox, { backgroundColor: colors.errorBg }]}
              >
                <Text style={[type.footnote, styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <Button
              label="Giriş yap"
              onPress={handleSubmit}
              testID="login-submit-button"
              busy={submitting}
              style={[styles.submitBtn, shadows.primary]}
            />

            <PressableScale
              onPress={() => router.push("/forgot-password")}
              accessibilityRole="link"
              style={styles.forgotBtn}
            >
              <Text style={[type.callout, styles.forgotText, { color: colors.primary }]}>Şifremi unuttum</Text>
            </PressableScale>

            <Text style={[type.caption, styles.legal, { color: colors.textTertiary }]}>
              Devam ederek ObiHub Hizmet Şartlarını kabul etmiş olursunuz.
            </Text>
          </SafeAnimatedView>

          <SafeAnimatedView entering={FadeIn.delay(360).duration(500)} style={styles.footer}>
            <Text style={[type.caption, { color: colors.textTertiary }]}>© {new Date().getFullYear()} ObiHub</Text>
          </SafeAnimatedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bgWrap: { ...StyleSheet.absoluteFillObject },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === "ios" ? spacing.huge : spacing.xxl,
    paddingBottom: spacing.huge,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  brandIcoSmall: { width: 22, height: 22 },
  brandText: { fontWeight: "700", letterSpacing: -0.2 },
  themeBtn: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  heroBlock: { gap: spacing.xs, marginBottom: spacing.lg },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    marginBottom: spacing.xs,
  },
  heroLogo: { width: 200, height: 44, marginBottom: spacing.xs, marginTop: spacing.xxs },
  heroSub: { marginTop: spacing.xxs },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  formLabel: { marginBottom: 6 },
  input: {
    height: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: type.body.fontSize,
    fontWeight: "500",
    borderWidth: 1.5,
  },
  errorBox: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  errorText: { fontWeight: "600" },
  submitBtn: { marginTop: spacing.md },
  forgotBtn: { alignItems: "center", justifyContent: "center", minHeight: hitTarget, marginTop: spacing.xs },
  forgotText: { fontWeight: "600" },
  legal: { textAlign: "center", marginTop: spacing.xs },
  footer: { alignItems: "center", marginTop: spacing.xl },
});
