// Mağaza sipariş çekme hatası (saf modül; birim testi dev/test-sync-error.mjs). Dalga 4 (acil): sunucu kendi 502/504'ünü 503'e çevirir
// (X-Upstream-Status); Trendyol hız sınırı 429 + Türkçe detay + Retry-After. 429/5xx geçicidir: entegrasyon hatalı gösterilmez,
// sunucu metni bilgi tonuyla ve bekleme süresiyle gösterilir. Yalnız 400/401/403 entegrasyon bilgisi sorunudur.

const generic = (m?: string) => !m || /^Sunucu hatası/.test(m);

export function syncErrorView(e: { status?: number; message?: string; retryAfter?: number } | null | undefined) {
  const status = Number(e?.status) || 0;
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (status === 429) {
    const sec = Number(e?.retryAfter) > 0 ? Number(e?.retryAfter) : 60;
    return { text: msg || "Mağaza hız sınırına ulaşıldı; 1 dakika sonra yeniden deneyin.", tone: "info" as const, cooldownMs: sec * 1000, temporary: true };
  }
  if (status >= 500) {
    return {
      text: generic(msg) ? "Mağaza servisi geçici olarak yanıt vermiyor; biraz sonra yeniden deneyin." : msg,
      tone: "info" as const,
      cooldownMs: 30000,
      temporary: true,
    };
  }
  return { text: msg || "Senkronizasyon başarısız oldu.", tone: "error" as const, cooldownMs: 0, temporary: false };
}
