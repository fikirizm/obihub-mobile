import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FadeInDown } from "react-native-reanimated";
import { SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { useTheme } from "../src/theme/ThemeProvider";
import { hitTarget, radius, spacing, tabular, type } from "../src/theme/tokens";
import { PressableScale } from "../src/components/KPICard";
import { ArrowLeftIcon, CheckIcon } from "../src/components/Icons";
import { Button } from "../src/ui/Button";
import { confirmPasswordReset, requestPasswordReset } from "../src/api";

type Step = "email" | "code";

export default function ForgotPasswordScreen() {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequestCode = async () => {
    if (!email.trim()) {
      setError("E-posta adresinizi girin.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setStep("code");
    } catch (e: any) {
      setError(e?.message || "Kod gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!code.trim()) {
      setError("Doğrulama kodunu girin.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmPasswordReset(email.trim().toLowerCase(), code.trim(), newPassword);
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || "Şifre sıfırlanamadı. Kodu kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <View style={[styles.successBadge, { backgroundColor: colors.successBg }]}>
            <CheckIcon size={32} color={colors.success} />
          </View>
          <Text accessibilityRole="header" style={[type.title, styles.centerText, { color: colors.textPrimary }]}>
            Şifreniz güncellendi
          </Text>
          <Text style={[type.callout, styles.centerText, { color: colors.textSecondary }]}>
            Yeni şifrenizle giriş yapabilirsiniz.
          </Text>
          <Button label="Giriş yap" onPress={() => router.replace("/")} style={styles.successBtn} />
        </View>
      </View>
    );
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle },
  ];
  const labelStyle = [type.caption, styles.label, { color: colors.textSecondary }];
  const errorBox = error ? (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
      <Text style={[type.footnote, styles.errorText, { color: colors.error }]}>{error}</Text>
    </View>
  ) : null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* StackHeader ile aynı görünüm; geri düğmesi kod adımında e-posta adımına döndüğü için yerel. */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: colors.background }]}>
        <PressableScale
          onPress={() => (step === "code" ? setStep("email") : router.back())}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
        >
          <ArrowLeftIcon size={20} color={colors.textPrimary} />
        </PressableScale>
        <View style={styles.headerTitle}>
          <Text accessibilityRole="header" style={[type.headline, { color: colors.textPrimary }]} numberOfLines={1}>
            {step === "email" ? "Şifremi unuttum" : "Kodu doğrulayın"}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAnimatedView
            entering={FadeInDown.duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.lg]}
          >
            {step === "email" ? (
              <>
                <Text style={[type.callout, styles.desc, { color: colors.textSecondary }]}>
                  Hesabınıza bağlı e-posta adresini girin. Şifre sıfırlama kodu gönderilecektir.
                </Text>
                <Text style={labelStyle}>E-posta</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  accessibilityLabel="E-posta"
                  placeholder="ornek@firma.com"
                  placeholderTextColor={colors.textTertiary}
                  style={inputStyle}
                />
                {errorBox}
                <Button label="Kod gönder" onPress={handleRequestCode} busy={loading} style={[styles.submitBtn, shadows.primary]} />
              </>
            ) : (
              <>
                <Text style={[type.callout, styles.desc, { color: colors.textSecondary }]}>
                  <Text style={styles.strong}>{email}</Text> adresine gönderilen 6 haneli kodu ve yeni şifrenizi girin.
                </Text>
                <Text style={labelStyle}>Doğrulama kodu</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  accessibilityLabel="Doğrulama kodu"
                  placeholder="123456"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={6}
                  style={[inputStyle, tabular]}
                />
                <Text style={[labelStyle, styles.labelGap]}>Yeni şifre</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  accessibilityLabel="Yeni şifre"
                  placeholder="En az 6 karakter"
                  placeholderTextColor={colors.textTertiary}
                  style={inputStyle}
                />
                <Text style={[labelStyle, styles.labelGap]}>Yeni şifre (tekrar)</Text>
                <TextInput
                  value={newPasswordConfirm}
                  onChangeText={setNewPasswordConfirm}
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="new-password"
                  accessibilityLabel="Yeni şifre, tekrar"
                  placeholder="Şifreyi tekrar girin"
                  placeholderTextColor={colors.textTertiary}
                  style={inputStyle}
                />
                {errorBox}
                <Button
                  label="Şifreyi güncelle"
                  onPress={handleConfirm}
                  busy={loading}
                  style={[styles.submitBtn, shadows.primary]}
                />
                <PressableScale
                  onPress={handleRequestCode}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading }}
                  style={styles.resendBtn}
                >
                  <Text style={[type.callout, styles.strongLink, { color: colors.primary }]}>Kodu tekrar gönder</Text>
                </PressableScale>
              </>
            )}
          </SafeAnimatedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.xs },
  centerText: { textAlign: "center" },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  successBtn: { alignSelf: "stretch", marginTop: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: { flex: 1, minWidth: 0, alignItems: "center" },
  headerRight: { minWidth: hitTarget },
  iconBtn: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.huge },
  card: { borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1 },
  desc: { marginBottom: spacing.md },
  strong: { fontWeight: "700" },
  label: { marginBottom: 6 },
  labelGap: { marginTop: spacing.sm },
  input: {
    height: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: type.body.fontSize,
    fontWeight: "500",
    borderWidth: 1.5,
    marginBottom: 2,
  },
  errorBox: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  errorText: { fontWeight: "600" },
  submitBtn: { marginTop: spacing.md },
  resendBtn: { alignItems: "center", justifyContent: "center", minHeight: hitTarget, marginTop: spacing.xs },
  strongLink: { fontWeight: "600" },
});
