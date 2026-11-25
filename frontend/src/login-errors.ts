// Giriş hatası metinleri (saf modül; birim testi dev/test-login-errors.mjs).
// POST /auth/login gövdesinde makine okunur `code` (13 Kas 2026; docs/mobil-oturum-icin-notlar.md). `detail` ve HTTP durumları değişmedi.
//  INVALID_CREDENTIALS 401 · ACCOUNT_INACTIVE 401 · ACCOUNT_SUSPENDED 403 · SUBSCRIPTION_EXPIRED 403 · LOGIN_LOCKED 429 (+ Retry-After sn)
//  24 Kas 2026 (Amazon DPP 1.4.1): PASSWORD_EXPIRED 403 — şifre 365 günden eski; şifre sıfırlama akışı bu kullanıcıda çalışır.
//  Kilit artık kalıcı (Mongo sayacı; 10 deneme → 15 dk), metin aynı.

// reset: giriş ekranı "Yeni şifre belirle" yönlendirmesini öne çıkarır (şifre sıfırlama e-postayla doldurulmuş açılır).
export type LoginErrorView = { text: string; subscription: boolean; reset: boolean };

const WEB_RENEW = "Aboneliğinizi ObiHub web panelinden yenileyebilirsiniz.";

export function loginErrorText(e: any): LoginErrorView {
  const code = typeof e?.code === "string" ? e.code : "";
  const detail = typeof e?.message === "string" ? e.message.trim() : "";
  switch (code) {
    case "INVALID_CREDENTIALS":
      return { text: "E-posta veya şifre hatalı.", subscription: false, reset: false };
    case "ACCOUNT_INACTIVE":
      return { text: "Hesabınız aktif değil. Firma yöneticinizle ya da ObiHub destekle iletişime geçin.", subscription: false, reset: false };
    case "ACCOUNT_SUSPENDED":
      return { text: `Abonelik erişimi duraklatıldı. ${WEB_RENEW}`, subscription: true, reset: false };
    case "SUBSCRIPTION_EXPIRED":
      return { text: `Aboneliğinizin süresi doldu. ${WEB_RENEW}`, subscription: true, reset: false };
    case "PASSWORD_EXPIRED":
      // PM sözleşmesi (25 Kas): sunucunun detail metni gösterilir, kullanıcı doğrudan "Şifremi unuttum" akışına yönlenir.
      return { text: detail && !/^Sunucu hatası/.test(detail) ? detail : "Şifrenizin süresi doldu (365 gün). Lütfen 'Şifremi unuttum' ile yeni şifre belirleyin.", subscription: false, reset: true };
    case "LOGIN_LOCKED": {
      const sec = Number(e?.retryAfter);
      const min = Number.isFinite(sec) && sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 15;
      return {
        text: `Çok fazla hatalı deneme yapıldı. ${min} dakika sonra yeniden deneyin ya da "Şifremi unuttum" ile şifrenizi sıfırlayın. Sorun sürerse ObiHub destekle iletişime geçin.`,
        subscription: false,
        reset: true,
      };
    }
  }
  // Kodsuz (eski sunucu ya da başka hata): eski davranış — 403'te web'den yenileme yönlendirmesi.
  if (Number(e?.status) === 403) return { text: `${detail || "Giriş engellendi."} ${WEB_RENEW}`, subscription: true, reset: false };
  return { text: detail || "Giriş başarısız oldu.", subscription: false, reset: false };
}
