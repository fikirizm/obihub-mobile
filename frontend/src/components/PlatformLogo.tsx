import React from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { providerKey, PLATFORM_LOGOS } from "../utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, { wrap: number; logo: number; radius: number; font: number }> = {
  xs: { wrap: 28, logo: 22, radius: 8, font: 11 },
  sm: { wrap: 36, logo: 28, radius: 10, font: 13 },
  md: { wrap: 44, logo: 34, radius: 12, font: 16 },
  lg: { wrap: 56, logo: 44, radius: 14, font: 20 },
};

export function PlatformLogo({
  provider,
  size = "md",
  style,
}: {
  provider: string;
  size?: Size;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const key = providerKey(provider);
  const dim = sizes[size];

  if (key === "other") {
    return (
      <View
        style={[
          styles.wrap,
          {
            width: dim.wrap,
            height: dim.wrap,
            borderRadius: dim.radius,
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: dim.font }}>IN</Text>
      </View>
    );
  }

  const logoSrc = PLATFORM_LOGOS[key];

  return (
    <View
      style={[
        styles.wrap,
        {
          width: dim.wrap,
          height: dim.wrap,
          borderRadius: dim.radius,
          backgroundColor: "transparent",
          borderColor: "transparent",
        },
        style,
      ]}
    >
      <Image source={logoSrc} style={{ width: dim.logo, height: dim.logo, borderRadius: dim.radius - 2 }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
