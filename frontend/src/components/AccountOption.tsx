import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { spacing, tabular, type } from "../theme/tokens";
import { formatMoney } from "../utils";
import { CheckIcon, WalletIcon } from "./Icons";
import { PressableScale } from "./KPICard";
import { IconTile } from "../ui/ListRow";
import type { CashAccount } from "../types";

// Seçilebilir hesap satırı: seçili olan renkli çerçeve ve onay simgesiyle ayrılır.
export function AccountOption({ account, selected, onPress, testID, divider }: { account: CashAccount; selected: boolean; onPress: () => void; testID: string; divider: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${account.name}, bakiye ${formatMoney(account.balance, account.currency)}`}
      accessibilityState={{ selected }}
    >
      <View style={[styles.option, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <IconTile tint={selected ? colors.emerald : colors.surfaceMuted}>
          {selected ? <CheckIcon size={18} color={colors.surface} /> : <WalletIcon size={18} color={colors.textSecondary} />}
        </IconTile>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
            {account.name}
          </Text>
          {account.bank_name ? (
            <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
              {account.bank_name}
            </Text>
          ) : null}
        </View>
        <Text style={[type.callout, tabular, { color: Number(account.balance) < 0 ? colors.error : colors.textPrimary, fontWeight: "600" }]} numberOfLines={1}>
          {formatMoney(account.balance, account.currency)}
        </Text>
      </View>
    </PressableScale>
  );
}


const styles = StyleSheet.create({
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
