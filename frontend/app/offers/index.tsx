import React from "react";
import { View } from "react-native";
import { useTheme } from "../../src/theme/ThemeProvider";
import { OffersList } from "../../src/screens/OffersList";
import { StackHeader } from "../../src/ui/Header";

export default function OffersScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="offers-screen">
      <StackHeader title="Teklifler" subtitle="Paraşüt" />
      <OffersList />
    </View>
  );
}
