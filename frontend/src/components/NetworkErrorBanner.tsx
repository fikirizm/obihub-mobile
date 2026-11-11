import React from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
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
    ? "Çevrimdışısınız, önbellekteki veriler gösteriliyor."
    : "Bağlantı hatası, veriler güncellenemiyor.";
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
      accessibilityRole="alert"
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
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: 6,
  },
  text: { ...type.caption, fontWeight: "600", flex: 1, minWidth: 0 },
});
