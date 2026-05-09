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
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Stop, Circle as SvgCircle } from "react-native-svg";
import { useAuth } from "../src/auth/AuthProvider";
import { useTheme } from "../src/theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../src/theme/tokens";
import { PressableScale } from "../src/components/KPICard";
import { MoonIcon, SunIcon, SparkleIcon } from "../src/components/Icons";

const LOGOMAIN = require("../assets/obihub/obihub-logomain.png");
const ICO = require("../assets/obihub/obihub-ico.png");

export default function Index() {
  const { token, bootLoading, login } = useAuth();
  const { colors, mode, toggle, shadows } = useTheme();
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
      await login(email.trim(), password);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      setError(e?.message || "Giriş başarısız oldu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="login-screen">
      <View style={styles.bgWrap} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={mode === "dark" ? "#1E40AF" : "#60A5FA"} stopOpacity="0.55" />
              <Stop offset="1" stopColor={mode === "dark" ? "#0B1220" : "#F8FBFF"} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="g2" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={mode === "dark" ? "#312E81" : "#A78BFA"} stopOpacity="0.4" />
              <Stop offset="1" stopColor={mode === "dark" ? "#0B1220" : "#F8FBFF"} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <SvgCircle cx={70} cy={120} r={180} fill="url(#g1)" />
          <SvgCircle cx={350} cy={680} r={220} fill="url(#g2)" />
        </Svg>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SafeAnimatedView entering={FadeIn.duration(500)} style={styles.topBar}>
            <View style={[styles.brandPill, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}>
              <Image source={ICO} style={styles.brandIcoSmall} resizeMode="contain" />
              <Text style={[styles.brandText, { color: colors.textPrimary }]}>obihub</Text>
            </View>

            <PressableScale
              onPress={toggle}
              testID="theme-toggle"
              style={[
                styles.themeBtn,
                { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                shadows.sm,
              ]}
            >
              {mode === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </PressableScale>
          </SafeAnimatedView>

          <SafeAnimatedView entering={FadeInDown.delay(80).duration(500)} style={styles.heroBlock}>
            <View style={[styles.heroChip, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
              <SparkleIcon size={12} color={colors.primary} />
              <Text style={[styles.heroChipText, { color: colors.primary }]}>Connect. Sync. Scale.</Text>
            </View>
            <Image source={LOGOMAIN} style={styles.heroLogo} resizeMode="contain" />
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Tüm pazaryerlerin tek panelde</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Trendyol, Hepsiburada, n11 ve WooCommerce siparişlerini, faturalarını ve raporlarını tek yerden yönet.
            </Text>
          </SafeAnimatedView>

          <SafeAnimatedView
            entering={FadeInUp.delay(160).duration(550)}
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
              shadows.lg,
            ]}
          >
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>E-POSTA</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="ornek@firma.com"
              placeholderTextColor={colors.textTertiary}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceMuted,
                  color: colors.textPrimary,
                  borderColor: emailFocused ? colors.primary : colors.borderSubtle,
                },
              ]}
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: spacing.sm }]}>ŞİFRE</Text>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceMuted,
                  color: colors.textPrimary,
                  borderColor: passwordFocused ? colors.primary : colors.borderSubtle,
                },
              ]}
            />

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <PressableScale
              onPress={handleSubmit}
              testID="login-submit-button"
              disabled={submitting}
              style={[styles.submitBtn, { backgroundColor: colors.primary }, shadows.primary]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Giriş Yap</Text>
              )}
            </PressableScale>

            <Text style={[styles.legal, { color: colors.textTertiary }]}>
              Devam ederek ObiHub Hizmet Şartlarını kabul etmiş olursun.
            </Text>
          </SafeAnimatedView>

          <SafeAnimatedView entering={FadeIn.delay(360).duration(500)} style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              © {new Date().getFullYear()} ObiHub · Premium SaaS
            </Text>
          </SafeAnimatedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bgWrap: { ...StyleSheet.absoluteFillObject },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === "ios" ? spacing.huge : spacing.xxl,
    paddingBottom: spacing.xl,
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
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
  },
  brandIcoSmall: { width: 22, height: 22 },
  brandText: { fontSize: 13, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginBottom: spacing.xs,
  },
  heroChipText: { fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 0.4, textTransform: "uppercase" },
  heroLogo: { width: 200, height: 44, marginBottom: spacing.xs, marginTop: 4 },
  heroTitle: { fontSize: 32, fontWeight: fontWeight.bold, letterSpacing: -1 },
  heroSub: { fontSize: 14, lineHeight: 20, marginTop: 4, fontWeight: fontWeight.medium },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  formLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    fontWeight: fontWeight.bold,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: fontWeight.medium,
    borderWidth: 1.5,
  },
  errorBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  errorText: { fontSize: 13, fontWeight: fontWeight.semibold },
  submitBtn: {
    height: 54,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  legal: { fontSize: 11, textAlign: "center", marginTop: spacing.sm, fontWeight: fontWeight.medium },
  footer: { alignItems: "center", marginTop: spacing.xl, paddingBottom: spacing.lg },
  footerText: { fontSize: 11, fontWeight: fontWeight.medium },
});
