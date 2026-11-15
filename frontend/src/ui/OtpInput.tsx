// 6 haneli doğrulama kodu girişi (premium). Görünmez tek bir TextInput tüm kutuları besler: kendiliğinden ilerleme, silmede geri
// gelme, yapıştırma ve iOS'ta e-postadan/SMS'ten otomatik doldurma (textContentType=oneTimeCode) doğal çalışır.
// Etkin kutu marka renginde ve yanıp sönen imleçli; hata olunca kutular kısa bir sarsıntıyla kırmızılaşır.
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { activeBox, normalizeOtp, OTP_LENGTH, otpBoxes, otpComplete } from "../otp";
import { useTheme } from "../theme/ThemeProvider";
import { radius, tabular } from "../theme/tokens";

export function OtpInput({
  value,
  onChange,
  onComplete,
  error = false,
  disabled = false,
  autoFocus = true,
  testID = "otp-input",
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const caret = useRef(new Animated.Value(1)).current;
  const boxes = otpBoxes(value);
  const active = activeBox(value);
  const filled = otpComplete(value);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 480, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 480, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [caret]);

  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))
    ).start();
  }, [error, shake]);

  const change = (text: string) => {
    const code = normalizeOtp(text);
    onChange(code);
    if (otpComplete(code)) onComplete?.(code);
  };

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityRole="none" disabled={disabled} testID={`${testID}-boxes`}>
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>
        {boxes.map((d, i) => {
          const isActive = !disabled && i === active && !filled;
          const border = error ? colors.error : isActive ? colors.primary : d ? colors.textTertiary : colors.border;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor: border,
                  backgroundColor: d ? colors.surfaceElevated : colors.surface,
                  shadowColor: isActive ? colors.primary : "transparent",
                },
                isActive && styles.boxActive,
              ]}
            >
              {d ? (
                <Text style={[styles.digit, tabular, { color: error ? colors.error : colors.textPrimary }]}>{d}</Text>
              ) : isActive ? (
                <Animated.View style={[styles.caret, { backgroundColor: colors.primary, opacity: caret }]} />
              ) : null}
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={input}
        testID={testID}
        value={value}
        onChangeText={change}
        maxLength={OTP_LENGTH + 20}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        accessibilityLabel={`${OTP_LENGTH} haneli doğrulama kodu`}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    maxWidth: 56,
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  boxActive: { borderWidth: 2, elevation: 3 },
  digit: { fontSize: 26, fontWeight: "700" },
  caret: { width: 2, height: 26, borderRadius: 1 },
  hidden: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity: 0.015, color: "transparent" },
});
