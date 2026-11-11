import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { SafeAnimatedView } from "../src/components/SafeAnimatedView";
import { FadeInDown } from "react-native-reanimated";
import { useTheme } from "../src/theme/ThemeProvider";
import { fontWeight, radius, spacing } from "../src/theme/tokens";
import { PressableScale } from "../src/components/KPICard";
import { ArrowLeftIcon } from "../src/components/Icons";
import { confirmPasswordReset, requestPasswordReset } from "../src/api";

type Step = "email" | "code";

export default function ForgotPasswordScreen() {
  const { colors, shadows } = useTheme();
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
    if (!code.trim()) { setError("Doğrulama kodunu girin."); return; }
    if (newPassword.length < 6) { setError("Şifre en az 6 karakter olmalıdır."); return; }
    if (newPassword !== newPasswordConfirm) { setError("Şifreler eşleşmiyor."); return; }
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
          <Text style={[styles.successIcon]}>✅</Text>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Şifreniz güncellendi!</Text>
          <Text style={[styles.successSub, { color: colors.textSecondary }]}>
            Yeni şifrenizle giriş yapabilirsiniz.
          </Text>
          <PressableScale
            onPress={() => router.replace("/")}
            style={[styles.btn, { backgroundColor: colors.primary, marginTop: spacing.lg }, shadows.primary]}
          >
            <Text style={styles.btnText}>Giriş Yap</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.topBar}>
            <PressableScale
              onPress={() => (step === "code" ? setStep("email") : router.back())}
              style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.sm]}
            >
              <ArrowLeftIcon size={18} color={colors.textPrimary} />
            </PressableScale>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
              {step === "email" ? "Şifremi Unuttum" : "Kodu Doğrula"}
            </Text>
          </View>

          <SafeAnimatedView
            entering={FadeInDown.duration(400)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, shadows.lg]}
          >
            {step === "email" ? (
              <>
                <Text style={[styles.desc, { color: colors.textSecondary }]}>
                  Hesabınıza bağlı e-posta adresini girin. Şifre sıfırlama kodu gönderilecektir.
                </Text>
                <Text style={[styles.label, { color: colors.textSecondary }]}>E-POSTA</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="ornek@firma.com"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                />
                {error ? (
                  <View style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                  </View>
                ) : null}
                <PressableScale
                  onPress={handleRequestCode}
                  disabled={loading}
                  style={[styles.btn, { backgroundColor: colors.primary, marginTop: spacing.md }, shadows.primary]}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Kod Gönder</Text>}
                </PressableScale>
              </>
            ) : (
              <>
                <Text style={[styles.desc, { color: colors.textSecondary }]}>
                  <Text style={{ fontWeight: "700" }}>{email}</Text> adresine gönderilen 6 haneli kodu ve yeni şifrenizi girin.
                </Text>
                <Text style={[styles.label, { color: colors.textSecondary }]}>DOĞRULAMA KODU</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={6}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                />
                <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.sm }]}>YENİ ŞİFRE</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="En az 6 karakter"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                />
                <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.sm }]}>YENİ ŞİFRE (TEKRAR)</Text>
                <TextInput
                  value={newPasswordConfirm}
                  onChangeText={setNewPasswordConfirm}
                  secureTextEntry
                  placeholder="Şifreyi tekrar girin"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                />
                {error ? (
                  <View style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                  </View>
                ) : null}
                <PressableScale
                  onPress={handleConfirm}
                  disabled={loading}
                  style={[styles.btn, { backgroundColor: colors.primary, marginTop: spacing.md }, shadows.primary]}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Şifreyi Güncelle</Text>}
                </PressableScale>
                <PressableScale
                  onPress={handleRequestCode}
                  disabled={loading}
                  style={{ marginTop: spacing.sm, alignItems: "center", paddingVertical: spacing.xs }}
                >
                  <Text style={[styles.resendText, { color: colors.primary }]}>Kodu tekrar gönder</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingTop: Platform.OS === "ios" ? 60 : 40 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.lg },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  screenTitle: { fontSize: 20, fontWeight: fontWeight.bold, letterSpacing: -0.4 },
  card: { borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1 },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: spacing.md, fontWeight: fontWeight.medium },
  label: { fontSize: 11, letterSpacing: 0.6, fontWeight: fontWeight.bold, textTransform: "uppercase", marginBottom: 6 },
  input: { height: 50, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontWeight: fontWeight.medium, borderWidth: 1.5, marginBottom: 2 },
  errorBox: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  errorText: { fontSize: 13, fontWeight: fontWeight.semibold },
  btn: { height: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  resendText: { fontSize: 14, fontWeight: fontWeight.semibold },
  successIcon: { fontSize: 56, marginBottom: spacing.md },
  successTitle: { fontSize: 24, fontWeight: fontWeight.bold, letterSpacing: -0.5, marginBottom: spacing.xs },
  successSub: { fontSize: 14, textAlign: "center", fontWeight: fontWeight.medium, lineHeight: 20 },
});
