// Resmileştirme (saf modül; birim testi dev/test-officialize.mjs). Dalga 2 (P2.1): POST /local-invoices/{id}/resmilestir isteğe bağlı
// gövde {internet_sale?} — yalnız e-Arşiv'e gider (alıcı e-Fatura mükellefiyse sunucu yok sayar); gövdesiz istek eski davranış.
// Kesilmiş iade faturası da aynı uçla, asıl faturaya bağlı iade e-belgesi olarak gönderilir (gider pusulası gönderilmez).
// Web: lib/internetSale.js, SalesInvoiceFormOS (canOfficializeReturn), lib/documentForm.js CODE_TEXT.

export const PAYMENT_TYPES: [string, string][] = [
  ["credit_card", "Kredi / banka kartı"],
  ["bank_transfer", "EFT / havale"],
  ["cash_on_delivery", "Kapıda ödeme"],
  ["payment_platform", "Ödeme aracısı (iyzico, PayTR vb.)"],
  ["other", "Diğer"],
];

export type InternetSale = { enabled: boolean; url: string; payment_type: string; payment_platform: string; payment_date: string };

export const blankInternetSale = (today = ""): InternetSale => ({ enabled: false, url: "", payment_type: "credit_card", payment_platform: "", payment_date: today });

export function validateInternetSale(v: InternetSale | null | undefined, today = ""): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v || !v.enabled) return e;
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(String(v.url || "").trim())) e.url = "Satışın yapıldığı web adresini https://… biçiminde girin.";
  if (v.payment_type === "payment_platform" && !String(v.payment_platform || "").trim()) e.payment_platform = "Ödeme aracısının adını yazın.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.payment_date || ""))) e.payment_date = "Ödeme tarihini seçin.";
  else if (today && v.payment_date > today) e.payment_date = "Ödeme tarihi ileri bir gün olamaz.";
  return e;
}

export function officializeBody(v: InternetSale | null | undefined) {
  if (!v || !v.enabled) return undefined;
  return {
    internet_sale: {
      url: String(v.url).trim(),
      payment_type: v.payment_type,
      payment_platform: v.payment_type === "payment_platform" ? String(v.payment_platform || "").trim() : "",
      payment_date: v.payment_date,
    },
  };
}

// Kesilmiş (gönderildi/gecikti) iade faturası; gider pusulası, aynalı ve Paraşüt'e gitmiş belge hariç.
export function canOfficializeReturn(inv: Record<string, any> | null | undefined) {
  return (
    inv?.invoice_type === "iade" &&
    inv?.return_kind !== "gider_pusulasi" &&
    inv?.read_only !== true &&
    !inv?.parasut_invoice_id &&
    !inv?.officialize_lock &&
    ["gonderildi", "gecikti"].includes(String(inv?.status || ""))
  );
}

const TEXT: Record<string, string> = {
  INTERNET_SALE_INVALID: "İnternet satışı bilgilerini kontrol edin.",
  WITHHOLDING_CODES_MIXED: "Paraşüt belge başına tek tevkifat kodu taşır; satırlardaki tevkifat kodlarını aynı yapın.",
  EXEMPTION_CODES_MIXED: "Paraşüt belge başına tek istisna kodu taşır; satırlardaki kodları aynı yapın.",
  EXPORT_CODE_REQUIRES_ZERO_VAT: "İhraç kayıtlı kod seçildiğinde tüm satırlar %0 KDV'li olmalı.",
  ISSUE_BEFORE_OPENING_DATE: "Fatura tarihi carinin açılış bakiyesi tarihinden önce olamaz.",
  LINE_EXEMPTION_INVALID: "%0 KDV'li satırda istisna kodu gerekli.",
  PARASUT_TOTAL_MISMATCH: "Paraşüt vergi kesintisini aynı tutarla uygulamadı; belge gönderilmedi. Fatura ObiHub'da değişmeden duruyor.",
  RETURN_NOT_ISSUED: "Önce iade faturasını kesin; ardından resmileştirebilirsiniz.",
  RETURN_SOURCE_NOT_OFFICIAL: "İade faturası, asıl faturaya bağlanarak kesilir: önce (iptal edilmemiş) asıl faturayı resmileştirin.",
  RETURN_KIND_NOT_SUPPORTED: "Gider pusulası Paraşüt'e fatura olarak gönderilmez; yalnız iade faturası resmileştirilir.",
  RETURN_NOT_SUPPORTED: "Bu faturadan iade e-belgesi şimdilik oluşturulamaz (tevkifat ya da ek vergi içeren satırlar).",
};

export function officializeErrorText(err: { code?: string; message?: string } | null | undefined) {
  const msg = typeof err?.message === "string" ? err.message.trim() : "";
  if (msg && !/^Sunucu hatası \(\d+\)$/.test(msg)) return msg;
  return (err?.code && TEXT[err.code]) || "Resmileştirilemedi.";
}
