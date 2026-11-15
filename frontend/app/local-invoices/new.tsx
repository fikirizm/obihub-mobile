// Satış faturası formu (yeni / ?id= ile düzenleme). Ekran: src/screens/DocumentFormScreen.tsx (teklifle ortak).
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { DocumentFormScreen } from "../../src/screens/DocumentFormScreen";

export default function NewLocalInvoiceScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  return <DocumentFormScreen docType="sales" id={params.id ? String(params.id) : undefined} />;
}
