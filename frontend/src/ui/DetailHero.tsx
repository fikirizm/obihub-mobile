import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { FadeInDown } from "react-native-reanimated";
import { spacing, tabular } from "../theme/tokens";
import { PressableScale } from "../components/KPICard";
import { SafeAnimatedView } from "../components/SafeAnimatedView";
import { HeroCard, ON_HERO } from "./HeroCard";

export type HeroStat = {
  label: string;
  value: string;
  // "good" yeşil, "bad" kırmızımsı vurgulanır.
  tone?: "good" | "bad";
  // Verilirse hücre dokunulabilir olur ve altında ipucu görünür (ör. "Düzenle").
  onPress?: () => void;
  hint?: string;
  testID?: string;
};

// Detay ekranlarının üstündeki özet kartı: solda görsel/logo, başlık ve alt bilgi; büyük ana değer; altta 2-3 rakam.
// Koyu gradyan zeminlidir; içindeki metinler ON_HERO renklerini kullanır.
export function DetailHero({
  tone = "blue",
  leading,
  eyebrow,
  title,
  subtitle,
  badge,
  badgeBelow = false,
  value,
  valueLabel,
  stats,
  children,
  style,
  testID,
  onHeadPress,
  headHint,
  headTestID,
}: {
  tone?: "blue" | "emerald" | "violet";
  leading?: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  // Rozetler başlığın altında yatay satırda (çok/uzun rozette başlık sıkışmasın; ör. fatura "Resmileşti · e-Arşiv").
  badgeBelow?: boolean;
  // Kartın büyük ana değeri (ör. toplam tutar, bakiye).
  value?: string;
  valueLabel?: string;
  stats?: HeroStat[];
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  // Verilirse başlık satırı dokunulabilir olur (ör. sipariş özetinde müşteri → müşteri kartı); ipucu alt bilginin altında.
  onHeadPress?: () => void;
  headHint?: string;
  headTestID?: string;
}) {
  const head = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2} selectable={!onHeadPress}>
            {subtitle}
          </Text>
        ) : null}
        {headHint ? (
          <Text style={styles.headHint} numberOfLines={1}>
            {headHint} ›
          </Text>
        ) : null}
      </View>
      {badge && !badgeBelow ? <View style={styles.badge}>{badge}</View> : null}
    </>
  );
  return (
    <SafeAnimatedView entering={FadeInDown.duration(380)}>
      <HeroCard tone={tone} style={style}>
        <View testID={testID}>
          {onHeadPress ? (
            <PressableScale
              testID={headTestID}
              onPress={onHeadPress}
              accessibilityRole="button"
              accessibilityLabel={`${title}${headHint ? `, ${headHint}` : ""}`}
              style={styles.head}
            >
              {head}
            </PressableScale>
          ) : (
            <View style={styles.head}>{head}</View>
          )}
          {badge && badgeBelow ? <View style={styles.badgeBelow}>{badge}</View> : null}
        </View>

        {value ? (
          <View style={styles.valueBlock}>
            {valueLabel ? <Text style={styles.valueLabel}>{valueLabel}</Text> : null}
            <Text style={[styles.value, tabular]} numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Text>
          </View>
        ) : null}

        {stats && stats.length > 0 ? (
          <View style={styles.stats}>
            {stats.map((s, i) => {
              const color = s.tone === "good" ? ON_HERO.live : s.tone === "bad" ? "#FCA5A5" : ON_HERO.text;
              const cell = (
                <View style={styles.statInner}>
                  <Text style={styles.statLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text style={[styles.statValue, tabular, { color, fontSize: stats.length >= 3 ? 15 : 20 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {s.value}
                  </Text>
                  {s.hint ? <Text style={styles.statHint}>{s.hint}</Text> : null}
                </View>
              );
              return (
                <React.Fragment key={`${s.label}-${i}`}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  {s.onPress ? (
                    <PressableScale
                      testID={s.testID}
                      onPress={s.onPress}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.label}: ${s.value}${s.hint ? `, ${s.hint}` : ""}`}
                      style={styles.statCell}
                    >
                      {cell}
                    </PressableScale>
                  ) : (
                    <View testID={s.testID} style={styles.statCell} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
                      {cell}
                    </View>
                  )}
                </React.Fragment>
              );
            })}
          </View>
        ) : null}
        {children}
      </HeroCard>
    </SafeAnimatedView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  leading: { alignItems: "center", justifyContent: "center" },
  badge: { alignSelf: "flex-start" },
  badgeBelow: { marginTop: spacing.sm },
  eyebrow: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600", marginBottom: 2 },
  title: { color: ON_HERO.text, fontSize: 18, lineHeight: 23, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { color: ON_HERO.soft, fontSize: 13, lineHeight: 18, marginTop: 2 },
  headHint: { color: ON_HERO.text, fontSize: 12, fontWeight: "700", marginTop: 6, opacity: 0.9 },
  valueBlock: { marginTop: spacing.md },
  valueLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  value: { color: ON_HERO.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1 },
  stats: { flexDirection: "row", alignItems: "stretch", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: ON_HERO.faint },
  statCell: { flex: 1, minHeight: 48, justifyContent: "center" },
  statInner: { alignItems: "center", paddingHorizontal: 4 },
  statLabel: { color: ON_HERO.soft, fontSize: 12, fontWeight: "500" },
  statValue: { fontSize: 20, fontWeight: "800", marginTop: 2, letterSpacing: -0.4 },
  statHint: { color: ON_HERO.soft, fontSize: 12, fontWeight: "600", marginTop: 2, textDecorationLine: "underline" },
  divider: { width: 1, backgroundColor: ON_HERO.faint, marginVertical: 4 },
});
