// G1 — ortak özet kartı: başlık + büyük değer + alt bilgiler (marka gradyanı, HeroCard üzerine).
// Liste ekranlarının düz istatistik kutularının yerine; her iki temada aynı koyu gradyan zemin.
import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { tabular } from "../theme/tokens";
import { spacing } from "../theme/tokens";
import { HeroCard, ON_HERO } from "./HeroCard";

export type SummaryFact = { label: string; value: string; tone?: "good" | "warn" };

export function SummaryHero({
  label,
  value,
  facts = [],
  tone = "blue",
  footer,
  style,
  testID,
}: {
  label: string;
  value: string;
  facts?: SummaryFact[];
  tone?: "blue" | "emerald" | "violet";
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <HeroCard tone={tone} style={style}>
      <View testID={testID} accessible accessibilityLabel={[`${label} ${value}`, ...facts.map((f) => `${f.label} ${f.value}`)].join(", ")}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, tabular]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {facts.length ? (
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factLabel} numberOfLines={1}>
                  {f.label}
                </Text>
                <Text
                  style={[styles.factValue, tabular, f.tone === "good" && { color: ON_HERO.live }, f.tone === "warn" && { color: "#FCD34D" }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {f.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {footer}
      </View>
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  label: { color: ON_HERO.soft, fontSize: 13, fontWeight: "600" },
  value: { color: ON_HERO.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.6, marginTop: 2 },
  facts: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  fact: { flex: 1, minWidth: 0 },
  factLabel: { color: ON_HERO.soft, fontSize: 12 },
  factValue: { color: ON_HERO.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
});
