// Açık fatura satırları: her faturaya dağıtılacak tutar (Türkçe giriş).  Web: components/customers/AllocationRows.jsx.
// Veri ve doğrulama çağıranda (src/allocation.ts buildAllocations).
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing, tabular, type } from "../theme/tokens";
import { formatMinor, toMinor, toTrInput, type OpenInvoice } from "../allocation";
import { Button } from "../ui/Button";

const dateText = (s?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "vadesiz";
};

export function AllocationRows({
  invoices,
  values,
  errors,
  currency,
  disabled,
  onChange,
}: {
  invoices: OpenInvoice[];
  values: Record<string, string>;
  errors: Record<string, string>;
  currency: string;
  disabled?: boolean;
  onChange: (id: string, value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel="Açık faturalar">
      {invoices.map((inv, i) => {
        const err = errors[inv.id];
        return (
          <View key={inv.id} testID={`alloc-row-${inv.id}`} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                  {inv.invoice_number || "Numarasız fatura"}
                </Text>
                <Text style={[type.footnote, tabular, { color: colors.textSecondary }]} numberOfLines={1}>
                  {`Vade ${dateText(inv.due_date)} · Kalan ${formatMinor(toMinor(inv.remaining) ?? 0n, currency)}`}
                </Text>
              </View>
              <TextInput
                testID={`alloc-input-${inv.id}`}
                style={[styles.input, type.body, tabular, { color: colors.textPrimary, borderColor: err ? colors.error : colors.border, backgroundColor: colors.surface }]}
                value={values[inv.id] ?? ""}
                onChangeText={(v) => onChange(inv.id, v)}
                editable={!disabled}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel={`${inv.invoice_number || "Fatura"} dağıtım tutarı`}
              />
            </View>
            <View style={styles.tools}>
              {err ? (
                <Text accessibilityRole="alert" style={[type.caption, { color: colors.error, flex: 1 }]}>
                  {err}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Button testID={`alloc-fill-${inv.id}`} size="sm" variant="secondary" label="Kalanı yaz" disabled={disabled} onPress={() => onChange(inv.id, toTrInput(inv.remaining))} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { width: 116, minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, textAlign: "right" },
  tools: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
