// Teklifler (web TekliflerPage, WP-21): ObiHub'ın yerel teklifleri (liste + "Faturaya çevir"); Paraşüt bağlıysa salt okuma
// "Paraşüt teklifleri" sekmesi. Yeni teklif her zaman ObiHub'da açılır (/quotes/new).
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { useTheme } from "../../src/theme/ThemeProvider";
import { OffersList } from "../../src/screens/OffersList";
import { QuotesList } from "../../src/screens/QuotesList";
import { StackHeader } from "../../src/ui/Header";
import { Chip, ChipRow } from "../../src/ui/Chip";
import { PressableScale } from "../../src/components/KPICard";
import { PlusIcon } from "../../src/components/Icons";

export default function OffersScreen() {
  const { colors, shadows } = useTheme();
  const { user, parasutConnected } = useAuth();
  const canCreate = canManage(user, "billing");
  const [source, setSource] = useState<"local" | "parasut">("local");
  const showParasut = parasutConnected === true && source === "parasut";
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="offers-screen">
      <StackHeader
        title="Teklifler"
        subtitle={showParasut ? "Paraşüt (salt okuma)" : "Hazırla, kabul edilince faturaya çevir"}
        right={
          canCreate && !showParasut ? (
            <PressableScale
              testID="offers-new"
              onPress={() => router.push("/quotes/new")}
              accessibilityRole="button"
              accessibilityLabel="Yeni teklif"
              style={[styles.addBtn, shadows.sm, { backgroundColor: colors.primary }]}
            >
              <PlusIcon size={20} color="#FFFFFF" />
            </PressableScale>
          ) : undefined
        }
      />
      {parasutConnected === true ? (
        <ChipRow>
          <Chip testID="offers-source-local" label="ObiHub teklifleri" selected={source === "local"} onPress={() => setSource("local")} />
          <Chip testID="offers-source-parasut" label="Paraşüt teklifleri" selected={source === "parasut"} onPress={() => setSource("parasut")} />
        </ChipRow>
      ) : null}
      {showParasut ? <OffersList readOnly /> : <QuotesList />}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
