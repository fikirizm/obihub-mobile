// Teklif (görüntüle / düzenle / faturaya çevir / kabul-red / sil). Ekran: src/screens/DocumentFormScreen.tsx.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { DocumentFormScreen } from "../../src/screens/DocumentFormScreen";

export default function QuoteScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  return <DocumentFormScreen docType="quote" id={String(params.id || "")} />;
}
