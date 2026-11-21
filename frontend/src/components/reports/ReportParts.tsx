// Finans raporlarının ortak parçaları: dönem seçici (hazır dönem + elle tarih), para birimi seçici, özet kartı ve not.
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PRESETS, presetOf, presetRange, rangeLabel } from "../../finance-reports";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { FormField, OptionChips } from "../../ui/FormField";
import { HeroCard, ON_HERO } from "../../ui/HeroCard";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function RangeBar({ from, to, onChange, presets = PRESETS }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void; presets?: [string, string][] }) {
  const { colors } = useTheme();
  const [custom, setCustom] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [err, setErr] = useState("");
  useEffect(() => {
    setF(from);
    setT(to);
  }, [from, to]);
  const preset = presetOf(from, to) || "";
  const apply = () => {
    if (!DATE.test(f) || !DATE.test(t) || Number.isNaN(Date.parse(f)) || Number.isNaN(Date.parse(t))) return setErr("Tarihleri YYYY-AA-GG biçiminde yazın.");
    if (t < f) return setErr("Bitiş tarihi başlangıçtan önce olamaz.");
    setErr("");
    onChange({ from: f, to: t });
  };
  return (
    <View style={{ gap: spacing.xs }}>
      <OptionChips
        testIDPrefix="report-preset"
        options={[...presets.map(([value, label]) => ({ value, label })), { value: "custom", label: "Özel" }]}
        value={custom ? "custom" : preset || "custom"}
        onChange={(v) => {
          if (v === "custom") return setCustom(true);
          setCustom(false);
          onChange(presetRange(v));
        }}
      />
      {custom ? (
        <View style={{ gap: spacing.xs }}>
          <View style={styles.pair}>
            <FormField testID="report-from" style={{ flex: 1 }} label="Başlangıç" value={f} onChangeText={setF} maxLength={10} autoCapitalize="none" placeholder="YYYY-AA-GG" />
            <FormField testID="report-to" style={{ flex: 1 }} label="Bitiş" value={t} onChangeText={setT} maxLength={10} autoCapitalize="none" placeholder="YYYY-AA-GG" />
          </View>
          {err ? <Text style={[type.caption, { color: colors.error }]}>{err}</Text> : null}
          <Button testID="report-apply" size="sm" variant="secondary" label="Uygula" onPress={apply} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : (
        <Text style={[type.caption, { color: colors.textTertiary }]}>{rangeLabel(from, to)}</Text>
      )}
    </View>
  );
}

export function CurrencyChips({ list, value, onChange }: { list: { currency: string }[]; value: string; onChange: (c: string) => void }) {
  if (!Array.isArray(list) || list.length < 2) return null;
  return <OptionChips testIDPrefix="report-currency" options={list.map((c) => ({ value: c.currency, label: c.currency }))} value={value} onChange={onChange} />;
}

export function FigureHero({ title, value, hint, cells, testID }: { title: string; value: string; hint?: string; cells: { label: string; value: string }[]; testID?: string }) {
  return (
    <HeroCard tone="blue" style={{ marginHorizontal: 0 }}>
      <View testID={testID}>
        <Text style={{ color: ON_HERO.soft, fontSize: 13, fontWeight: "600" }}>{title}</Text>
        <Text style={[tabular, styles.heroValue]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {hint ? <Text style={{ color: ON_HERO.soft, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
        {cells.length ? (
          <View style={styles.heroFoot}>
            {cells.map((c) => (
              <View key={c.label} style={styles.heroCell}>
                <Text style={styles.heroLabel}>{c.label}</Text>
                <Text style={[tabular, styles.heroSub]} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </HeroCard>
  );
}

export function InfoNote({ children, tone = "info" }: { children: string; tone?: "info" | "warning" }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: tone === "warning" ? colors.warningBg : colors.infoBg }]}>
      <Text style={[type.footnote, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: spacing.sm },
  heroValue: { color: ON_HERO.text, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroFoot: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm, marginTop: spacing.md },
  heroCell: { width: "50%" },
  heroLabel: { color: ON_HERO.soft, fontSize: 12 },
  heroSub: { color: ON_HERO.text, fontSize: 16, fontWeight: "700", marginTop: 2 },
  note: { padding: spacing.sm, borderRadius: radius.md },
});
