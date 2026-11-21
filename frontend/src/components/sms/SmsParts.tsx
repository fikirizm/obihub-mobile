// SMS ekranının ortak parçaları: uyarı notu, anahtar satırı ve değişkenli metin düzenleyici (POST /netgsm/preview, 400 ms gecikmeli).
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { request } from "../../api";
import { appendVar, bare, previewBody, tag } from "../../sms";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../../theme/tokens";
import { PressableScale } from "../KPICard";

export function Note({ tone = "info", children, testID }: { tone?: "info" | "warning" | "error" | "success"; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const bg = { info: colors.infoBg, warning: colors.warningBg, error: colors.errorBg, success: colors.successBg }[tone];
  const fg = { info: colors.textSecondary, warning: colors.textPrimary, error: colors.error, success: colors.textPrimary }[tone];
  return (
    <View style={[styles.note, { backgroundColor: bg }]} testID={testID} accessibilityRole={tone === "error" || tone === "warning" ? "alert" : undefined}>
      {typeof children === "string" ? <Text style={[type.footnote, { color: fg }]}>{children}</Text> : children}
    </View>
  );
}

export function ToggleRow({ title, hint, value, onChange, disabled, testID, divider }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string; divider?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggle, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.bodyStrong, { color: colors.textPrimary }]}>{title}</Text>
        {hint ? <Text style={[type.caption, { color: colors.textTertiary, marginTop: 2 }]}>{hint}</Text> : null}
      </View>
      <Switch testID={testID} accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

export function useSmsPreview(token: string | null, text: string, scope: "order" | "bulk", encoding: string) {
  const [state, setState] = useState<{ data: any; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    if (!token || !String(text || "").trim()) {
      setState({ data: null, failed: false });
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      request<any>("/netgsm/preview", { method: "POST", body: JSON.stringify(previewBody(text, scope, encoding)) }, token)
        .then((data) => alive && setState({ data, failed: false }))
        .catch(() => alive && setState({ data: null, failed: true }));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token, text, scope, encoding]);
  return state;
}

export function SmsEditor({
  token,
  label,
  value,
  onChange,
  variables,
  scope,
  encoding,
  placeholder,
  testID,
  editable = true,
}: {
  token: string | null;
  label: string;
  value: string;
  onChange: (v: string) => void;
  variables: string[];
  scope: "order" | "bulk";
  encoding: string;
  placeholder?: string;
  testID?: string;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  const { data, failed } = useSmsPreview(token, value, scope, encoding);
  const unknown: string[] = Array.isArray(data?.unknown) ? data.unknown : [];
  const tooLong = data?.fits === false;
  return (
    <View style={{ gap: spacing.xs }}>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        editable={editable}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={900}
        style={[styles.text, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: unknown.length || tooLong ? colors.error : colors.border }]}
      />
      {variables.length ? (
        <View style={styles.vars} accessibilityLabel="Değişkenler">
          <Text style={[type.caption, { color: colors.textTertiary }]}>Eklemek için dokunun:</Text>
          {variables.map((v) => (
            <PressableScale
              key={bare(v)}
              disabled={!editable}
              onPress={() => onChange(appendVar(value, v))}
              accessibilityRole="button"
              accessibilityLabel={`${tag(v)} ekle`}
              style={[styles.var, { borderColor: colors.border, backgroundColor: colors.primarySoft }]}
            >
              <Text style={[type.caption, { color: colors.primary, fontWeight: "600" }]}>{tag(v)}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
      <View style={styles.meta}>
        <Text style={[type.caption, tabular, { color: tooLong ? colors.error : colors.textTertiary }]} testID={testID ? `${testID}-count` : undefined}>
          {data ? `${data.length} / ${data.limit}` : String(value || "").trim() ? (failed ? "Sayaç şu an hesaplanamadı" : "Hesaplanıyor…") : "Metin yazın"}
        </Text>
        {tooLong ? <Text style={[type.caption, { color: colors.error }]}>Metin çok uzun; kısaltın.</Text> : null}
      </View>
      {unknown.length ? <Text style={[type.caption, { color: colors.error }]}>{`Tanınmayan değişken: ${unknown.map(tag).join(", ")}`}</Text> : null}
      {data?.text && !unknown.length ? (
        <View style={[styles.sample, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[type.caption, { color: colors.textTertiary, fontWeight: "600" }]}>Örnek önizleme</Text>
          <Text style={[type.footnote, { color: colors.textSecondary }]}>{data.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { padding: spacing.sm, borderRadius: radius.md, gap: spacing.xxs },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 56 },
  text: { minHeight: 96, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, fontSize: 15, textAlignVertical: "top" },
  vars: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  var: { borderWidth: 1, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, justifyContent: "center" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sample: { borderRadius: radius.md, padding: spacing.sm, gap: 2 },
});
