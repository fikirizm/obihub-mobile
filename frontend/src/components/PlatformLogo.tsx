import React from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";
import { providerKey, PLATFORM_LOGOS } from "../utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, { wrap: number; logo: number; radius: number; font: number }> = {
  xs: { wrap: 28, logo: 22, radius: 8, font: 12 },
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

  // ObiHub web mağaza: web'deki public/integrations/obihub-storefront.svg ile aynı çizim.
  if (key === "website") {
    return (
      <View style={[styles.wrap, { width: dim.wrap, height: dim.wrap, borderRadius: dim.radius }, style]} accessibilityLabel="Web Mağaza">
        <Svg width={dim.wrap} height={dim.wrap} viewBox="0 0 40 40">
          <Rect width={40} height={40} rx={10} fill="#edf4ee" />
          <G fill="none" stroke="#287d79" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m9 17 3-7h16l3 7v3H9zM12 21v10h16V21M17 31V21h6v10" />
            <Path d="M16 10v10m8-10v10" />
          </G>
        </Svg>
      </View>
    );
  }

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
      <Image
        source={logoSrc}
        style={[
          { width: dim.logo, height: dim.logo, borderRadius: dim.radius - 2 },
          // Amazon logosu beyaz zeminli: açık temada kaybolmaması için ince kenarlık (diğer logolar renkli kutudur).
          key === "amazon" && { borderWidth: 1, borderColor: colors.border },
        ]}
        resizeMode="cover"
      />
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
