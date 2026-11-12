// G1 — ortak özet kartı: başlık + büyük değer + alt bilgiler (marka gradyanı, HeroCard üzerine).
// Liste ekranlarının düz istatistik kutularının yerine; her iki temada aynı koyu gradyan zemin.
import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { COUNT_UP_MS, countUpValue, shouldAnimate } from "../count-up";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { tabular } from "../theme/tokens";
import { spacing } from "../theme/tokens";
import { HeroCard, ON_HERO } from "./HeroCard";

// G5: sayısal değer verilirse önceki değerden yenisine sayaçla geçer ("hareketi azalt" açıksa doğrudan).
function useCountUp(target: number | undefined): number | undefined {
  const reduce = useReducedMotion();
  // İlk karede son değer görünüp sonra 0'a düşmesin: sayaç oynayacaksa ilk değer başlangıç değeridir.
  const [shown, setShown] = useState(() => (target !== undefined && shouldAnimate(0, target, reduce) ? 0 : target));
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (target === undefined) return;
    const from = last.current ?? 0;
    last.current = target;
    if (!shouldAnimate(from, target, reduce)) {
      setShown(target);
      return;
    }
    let raf = 0;
    const start = Date.now();
    const step = () => {
      const t = (Date.now() - start) / COUNT_UP_MS;
      setShown(countUpValue(from, target, t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Kare döngüsü durursa (arka plan, düşük güç) tutar yanlış kalmasın: süre sonunda hedef kesin yazılır.
    const done = setTimeout(() => setShown(target), COUNT_UP_MS + 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target, reduce]);
  return shown;
}

export type SummaryFact = { label: string; value: string; tone?: "good" | "warn" | "bad" };

export function SummaryHero({
  label,
  value,
  facts = [],
  tone = "blue",
  footer,
  style,
  testID,
  amount,
  format,
}: {
  label: string;
  value: string;
  // Verilirse büyük değer sayaçla canlanır; `value` ekran okuyucu ve son değer için kullanılır.
  amount?: number;
  format?: (n: number) => string;
  facts?: SummaryFact[];
  tone?: "blue" | "emerald" | "violet";
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const counted = useCountUp(amount);
  const display = amount !== undefined && format && counted !== undefined ? format(counted) : value;
  return (
    <HeroCard tone={tone} style={style}>
      <View testID={testID} accessible accessibilityLabel={[`${label} ${value}`, ...facts.map((f) => `${f.label} ${f.value}`)].join(", ")}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, tabular]} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
        {facts.length ? (
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factLabel} numberOfLines={1}>
                  {f.label}
                </Text>
                <Text
                  style={[styles.factValue, tabular, f.tone === "good" && { color: ON_HERO.live }, f.tone === "warn" && { color: "#FCD34D" }, f.tone === "bad" && { color: "#FCA5A5" }]}
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
