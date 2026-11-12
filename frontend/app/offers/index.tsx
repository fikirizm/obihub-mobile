import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { useTheme } from "../../src/theme/ThemeProvider";
import { OffersList } from "../../src/screens/OffersList";
import { StackHeader } from "../../src/ui/Header";
import { PressableScale } from "../../src/components/KPICard";
import { PlusIcon } from "../../src/components/Icons";

export default function OffersScreen() {
  const { colors, shadows } = useTheme();
  const { user } = useAuth();
  // C8: web "Yeni Teklif" (pages/TekliflerPage.js CreateModal).
  const canCreate = canManage(user, "billing");
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="offers-screen">
      <StackHeader
        title="Teklifler"
        subtitle="Paraşüt"
        right={
          canCreate ? (
            <PressableScale
              testID="offers-new"
              onPress={() => router.push("/offers/new")}
              accessibilityRole="button"
              accessibilityLabel="Yeni teklif"
              style={[styles.addBtn, shadows.sm, { backgroundColor: colors.primary }]}
            >
              <PlusIcon size={20} color="#FFFFFF" />
            </PressableScale>
          ) : undefined
        }
      />
      <OffersList />
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
