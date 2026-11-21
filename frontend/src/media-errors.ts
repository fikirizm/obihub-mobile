// Ürün görseli hata ve yanıt kuralları (saf modül; birim testi dev/test-media-errors.mjs). Faz A M5: yönetilen R2 görseli tüm firmalarda
// varsayılan; dış adres ana görsel yapılınca sunucu onu WebP olarak R2'ye alır. Yanıttaki image_url / images esas alınır.

export function mediaError(e: { status?: number; message?: string } | null | undefined): { text: string; reload: boolean } {
  const s = Number(e?.status || 0);
  if (s === 409) return { text: "Ürün başka bir işlemde değişti; görseller yeniden okundu. Gerekirse işlemi tekrarlayın.", reload: true };
  if (s === 413) return { text: "Görsel 10 MB'tan büyük; daha küçük bir görsel seçin.", reload: false };
  if (s === 415) return { text: "Yalnız JPEG, PNG ya da WebP görsel yüklenebilir.", reload: false };
  if (s === 422) return { text: "Görsel okunamadı ya da adresi geçersiz. Başka bir görsel deneyin.", reload: false };
  if (s === 503) return { text: "Görsel depolama şu an kullanılamıyor. Biraz sonra yeniden deneyin.", reload: false };
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  return { text: m && !/^Sunucu hatası/.test(m) ? m : "Görsel güncellenemedi.", reload: false };
}

// PATCH / DELETE yanıtındaki ana görsel; yanıt alanı taşımıyorsa istenen değer.
export function mainFromResponse(r: any, requested: string | null): string | null {
  if (r && typeof r === "object" && "image_url" in r) return r.image_url ? String(r.image_url) : null;
  return requested;
}
