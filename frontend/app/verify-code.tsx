// Yeni cihazda ilk giriş: e-posta doğrulama kodu (premium). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md §1.
// 6 kutu, iOS'ta e-postadan otomatik doldurma, kod tamamlanınca kendiliğinden doğrulama, yanlışta sarsıntı, yeniden gönderme geri sayımı.
// Doğrulanınca cihaz güvenilir sayılır (90 gün); çıkıp girmek yeniden kod istemez.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAuth } from "../src/auth/AuthProvider";
import { codeErrorText, codeNeedsNew } from "../src/mobile-auth";
import { maskEmail, otpComplete, resendLabel, secondsLeft } from "../src/otp";
import { useTheme } from "../src/theme/ThemeProvider";
import { radius, spacing, type } from "../src/theme/tokens";
import { MailIcon } from "../src/components/Icons";
import { Button } from "../src/ui/Button";
import { OtpInput } from "../src/ui/OtpInput";

export default function VerifyCodeScreen() {
  const params = useLocalSearchParams<{ email?: string; resendAfter?: string; message?: string }>();
  const { token, verifyCode, resendCode } = useAuth();
  const { colors } = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(String(params.message || ""));
  const [resendAt, setResendAt] = useState(() => Date.now() + (Number(params.resendAfter) > 0 ? Number(params.resendAfter) : 45) * 1000);
  const [left, setLeft] = useState(() => secondsLeft(resendAt));
  const [resending, setResending] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setLeft(secondsLeft(resendAt)), 500);
    return () => clearInterval(t);
  }, [resendAt]);

  // Oturum açılınca panele (giriş ekranı yığından çıkar).
  useEffect(() => {
    if (token) router.replace("/(tabs)/dashboard");
  }, [token]);

  const submit = async (value = code) => {
    if (sending.current || !otpComplete(value)) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await verifyCode(value);
    } catch (e: any) {
      if (e?.code === "LOGIN_RESTART") {
        router.back();
        return;
      }
      setError(codeErrorText(e));
      setCode("");
      if (codeNeedsNew(e)) setInfo("");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (left > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      const r = await resendCode();
      if (r.verify) {
        setResendAt(Date.now() + r.verify.resendAfter * 1000);
        setInfo(r.verify.message || "Yeni kod e-posta adresinize gönderildi.");
        setCode("");
      }
    } catch (e: any) {
      if (e?.code === "LOGIN_RESTART") return router.back();
      const wait = Number(e?.retryAfter);
      if (Number.isFinite(wait) && wait > 0) setResendAt(Date.now() + wait * 1000);
      setError(codeErrorText(e));
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="verify-code-screen">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.badge}>
          <Svg width={76} height={76} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="otp-g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#247ee8" />
                <Stop offset="1" stopColor="#16beb4" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={76} height={76} rx={24} fill="url(#otp-g)" />
          </Svg>
          <View style={styles.badgeIcon}>
            <MailIcon size={34} color="#FFFFFF" />
          </View>
        </View>
        <Text accessibilityRole="header" style={[type.largeTitle, styles.center, { color: colors.textPrimary }]}>
          E-postanızı kontrol edin
        </Text>
        <Text style={[type.callout, styles.center, { color: colors.textSecondary }]}>
          {`${params.email ? maskEmail(String(params.email)) : "E-posta adresinize"} adresine 6 haneli bir kod gönderdik. Bu cihazdan ilk girişte bir kez istenir.`}
        </Text>
        <View style={{ marginTop: spacing.lg }}>
          <OtpInput value={code} onChange={(c) => (setCode(c), error && setError(""))} onComplete={submit} error={Boolean(error)} disabled={busy} />
        </View>
        <View style={styles.status}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : error ? (
            <Text testID="verify-error" style={[type.footnote, styles.center, { color: colors.error }]}>
              {error}
            </Text>
          ) : info ? (
            <Text style={[type.footnote, styles.center, { color: colors.textTertiary }]}>{info}</Text>
          ) : null}
        </View>
        <Button testID="verify-submit" label={busy ? "Doğrulanıyor…" : "Doğrula ve giriş yap"} busy={busy} disabled={!otpComplete(code)} onPress={() => submit()} />
        <Button testID="verify-resend" variant="ghost" label={resending ? "Gönderiliyor…" : resendLabel(left)} disabled={left > 0 || resending} onPress={resend} />
        <Text style={[type.caption, styles.center, { color: colors.textTertiary, marginTop: spacing.md }]}>
          Kod gelmediyse gereksiz (spam) klasörüne bakın. Kod 5 dakika geçerlidir.
        </Text>
        <Button variant="ghost" size="sm" label="Farklı hesapla giriş yap" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Degrade SVG mutlak konumlu; simge üstte kalsın.
  badgeIcon: { zIndex: 1, elevation: 1 },
  body: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  badge: { width: 76, height: 76, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: spacing.md, borderRadius: radius.xl },
  center: { textAlign: "center" },
  status: { minHeight: 36, alignItems: "center", justifyContent: "center" },
});
