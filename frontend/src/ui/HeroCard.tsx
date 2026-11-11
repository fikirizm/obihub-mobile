import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme/tokens";

// Koyu gradyanlı vurgu kartı. Her iki temada da koyu zeminlidir; içindeki yazılar ON_HERO renklerini kullanır.
export const ON_HERO = { text: "#FFFFFF", soft: "#CBD5E1", faint: "rgba(255,255,255,0.14)", live: "#4ADE80", ink: "#0B1220" };

const TONES = {
  blue: { from: "#1E3A8A", to: "#0B1220", glow: "#60A5FA" },
  emerald: { from: "#065F46", to: "#06201A", glow: "#34D399" },
  violet: { from: "#4C1D95", to: "#140B2E", glow: "#A78BFA" },
};

export function HeroCard({ tone = "blue", children, style }: { tone?: keyof typeof TONES; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { shadows } = useTheme();
  const t = TONES[tone];
  const id = `hero-${tone}`;
  return (
    <View style={[styles.card, shadows.lg, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t.from} />
              <Stop offset="1" stopColor={t.to} />
            </LinearGradient>
            <LinearGradient id={`${id}-glow`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t.glow} stopOpacity="0.28" />
              <Stop offset="1" stopColor={t.glow} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-bg)`} />
          <Circle cx="88%" cy="6%" r="120" fill={`url(#${id}-glow)`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, borderRadius: radius.xxl, padding: spacing.lg, overflow: "hidden" },
});
