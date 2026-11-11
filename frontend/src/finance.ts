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

// Sunucu vade geçmişliğini kendi (UTC) gününe göre hesaplar; Türkiye'de gece yarısından sonraki ilk saatlerde
// dün vadesi dolan fatura henüz gecikmiş gelmez. Sunucunun kuralı cihazın yerel gününe göre de uygulanır.
const OVERDUE_STATUSES = ["gonderildi", "resmilesti", "gecikti"];

export function isInvoiceOverdue(inv: {
  status?: string;
  display_status?: string;
  is_overdue?: boolean;
  invoice_type?: string;
  due_date?: string;
  remaining_amount?: number | null;
}) {
  if (inv.is_overdue || (inv.display_status || inv.status) === "gecikti") return true;
  if (!OVERDUE_STATUSES.includes(String(inv.status || "")) || inv.invoice_type === "teklif") return false;
  const due = String(inv.due_date || "").slice(0, 10);
  if (!due || due >= todayIso()) return false;
  return inv.remaining_amount == null || Number(inv.remaining_amount) > 0;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
