import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { ZapIcon } from "./Icons";

type Props = {
  visible: boolean;
  message?: string;
  offline?: boolean;
};

export function NetworkErrorBanner({ visible, message, offline }: Props) {
  const { colors } = useTheme();
  if (!visible) return null;
  const bg = offline ? colors.warningBg : colors.errorBg;
  const fg = offline ? colors.warning : colors.error;
  const defaultMsg = offline
    ? "Çevrimdışı — önbellek verisi gösteriliyor."
    : "Bağlantı hatası — veriler güncellenemiyor.";
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.banner, { backgroundColor: bg, borderColor: fg }]}
    >
      <ZapIcon size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {message || defaultMsg}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 6,
  },
  text: { fontSize: 12, fontWeight: "600", flex: 1 },
});
