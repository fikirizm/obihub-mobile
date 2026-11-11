// Finans ekranlarının ortak etiketleri.
import type { StatusKind } from "./utils";

export const PAYMENT_METHODS = [
  { value: "nakit", label: "Nakit" },
  { value: "havale", label: "Havale / EFT" },
  { value: "kredi_karti", label: "Kredi kartı" },
  { value: "cek", label: "Çek" },
  { value: "diger", label: "Diğer" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

const INVOICE_STATUS: Record<string, { label: string; kind: StatusKind }> = {
  taslak: { label: "Taslak", kind: "neutral" },
  gonderildi: { label: "Gönderildi", kind: "info" },
  resmilesti: { label: "Resmileşti", kind: "info" },
  gecikti: { label: "Gecikti", kind: "error" },
  odendi: { label: "Ödendi", kind: "success" },
  iptal: { label: "İptal", kind: "neutral" },
};

export function invoiceStatus(status?: string) {
  return INVOICE_STATUS[String(status || "")] || { label: status || "-", kind: "neutral" as StatusKind };
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
