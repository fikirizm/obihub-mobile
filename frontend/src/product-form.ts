// Yeni ürün formu kuralları (saf modül; birim testi dev/test-product-form.mjs).
// PM 14 Kas 2026 (P1 Dalga A): POST /products SKU yoksa 422 SKU_REQUIRED; doğrulama hatalarında detail düz Türkçe metin
// (GTIP_INVALID, PRICE_INVALID, VAT_INVALID, VALIDATION_FAILED).

export const SKU_HINT = "Zorunlu; önerilen kod otomatik verildi, değiştirebilirsiniz.";

export function skuProblem(sku: string, tried: boolean): string | null {
  if (sku.length > 64) return "SKU en çok 64 karakter olabilir.";
  if (tried && !sku.trim()) return "SKU girin.";
  return null;
}

const CODE_TEXT: Record<string, string> = {
  SKU_REQUIRED: "SKU girin.",
  PRICE_INVALID: "Geçerli bir fiyat girin.",
  VAT_INVALID: "KDV oranı geçersiz.",
  GTIP_INVALID: "GTİP kodu geçersiz.",
  VALIDATION_FAILED: "Ürün bilgileri geçersiz; alanları kontrol edin.",
};

export function createErrorText(e: { status?: number; code?: string; message?: string } | null | undefined): string {
  const code = String(e?.code || "");
  // api.ts sunucu metni yoksa "Sunucu hatası (NNN)" yazar; o durumda koda göre Türkçe metin tercih edilir.
  const raw = String(e?.message || "").trim();
  const msg = /^Sunucu hatası \(\d+\)$/.test(raw) ? "" : raw;
  if (msg) return msg;
  return CODE_TEXT[code] || "Ürün oluşturulamadı.";
}
