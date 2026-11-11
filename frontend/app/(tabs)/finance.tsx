import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing } from "../../src/theme/tokens";
import { WalletIcon } from "../../src/components/Icons";
import { EmptyState } from "../../src/components/EmptyState";
import { InvoicesList } from "../../src/screens/InvoicesList";
import { OffersList } from "../../src/screens/OffersList";
import { TabHeader } from "../../src/ui/Header";
import { SegmentedControl } from "../../src/ui/Chip";

type View_ = "invoices" | "offers";

export default function FinanceScreen() {
  const { parasutConnected } = useAuth();
  const { colors } = useTheme();
  const [view, setView] = useState<View_>("invoices");

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="finance-screen">
      <TabHeader title="Finans" subtitle={parasutConnected === false ? undefined : "Paraşüt"} />
      {parasutConnected === false ? (
        // Fatura ve teklif ekranları şimdilik yalnızca Paraşüt verisi gösterir.
        <EmptyState
          icon={<WalletIcon size={30} color={colors.textTertiary} />}
          title="Finans ekranları hazırlanıyor"
          description="Mobilde fatura ve teklifler şu an Paraşüt bağlantısıyla çalışıyor. Hesabınızın finans işlemlerine web panelinden ulaşabilirsiniz."
        />
      ) : (
        <>
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: "invoices", label: "Faturalar" },
              { value: "offers", label: "Teklifler" },
            ]}
          />
          <View style={{ flex: 1, marginTop: spacing.xs }}>{view === "invoices" ? <InvoicesList /> : <OffersList />}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
