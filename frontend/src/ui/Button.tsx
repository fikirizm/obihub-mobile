import React from "react";
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, type } from "../theme/tokens";
import { haptic } from "../haptics";
import { PressableScale } from "../components/KPICard";

// Beyaz yazıyla her iki temada yeterli kontrast veren kırmızı.
export const DESTRUCTIVE_BG = "#DC2626";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  busy,
  disabled,
  size = "md",
  style,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const bg =
    variant === "primary" ? colors.primary : variant === "destructive" ? DESTRUCTIVE_BG : variant === "secondary" ? colors.surface : "transparent";
  const fg = variant === "primary" || variant === "destructive" ? "#FFFFFF" : variant === "ghost" ? colors.primary : colors.textPrimary;
  return (
    <PressableScale
      testID={testID}
      onPress={
        onPress
          ? () => {
              // Birincil ve yıkıcı eylemlerde hafif dokunuş; sonuç bildirimi (toast) kendi titreşimini verir.
              if (variant === "primary" || variant === "destructive") haptic.tap();
              onPress();
            }
          : undefined
      }
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      hitSlop={size === "sm" ? 4 : undefined}
      style={[
        styles.base,
        // Büyük yazı (Dinamik Yazı) metni kesmesin: yükseklik alt sınırdır, metin büyüdükçe düğme uzar.
        { backgroundColor: bg, minHeight: size === "sm" ? 40 : 50, paddingVertical: size === "sm" ? 6 : 10 },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          {/* Dar düğmede uzun etiket taşmaz: daralır ve en çok iki satıra ortalı sarılır (düğme uzar). */}
          <Text style={[size === "sm" ? type.callout : type.bodyStrong, { color: fg, fontWeight: "600", flexShrink: 1, textAlign: "center" }]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: "100%" },
});
