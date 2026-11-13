// Giriş hatası metinleri (saf modül; birim testi dev/test-login-errors.mjs).
// POST /auth/login gövdesinde makine okunur `code` (13 Kas 2026; docs/mobil-oturum-icin-notlar.md). `detail` ve HTTP durumları değişmedi.
//  INVALID_CREDENTIALS 401 · ACCOUNT_INACTIVE 401 · ACCOUNT_SUSPENDED 403 · SUBSCRIPTION_EXPIRED 403 · LOGIN_LOCKED 429 (+ Retry-After sn)

export type LoginErrorView = { text: string; subscription: boolean };

const WEB_RENEW = "Aboneliğinizi ObiHub web panelinden yenileyebilirsiniz.";

export function loginErrorText(e: any): LoginErrorView {
  const code = typeof e?.code === "string" ? e.code : "";
  const detail = typeof e?.message === "string" ? e.message.trim() : "";
  switch (code) {
    case "INVALID_CREDENTIALS":
      return { text: "E-posta veya şifre hatalı.", subscription: false };
    case "ACCOUNT_INACTIVE":
      return { text: "Hesabınız aktif değil. Firma yöneticinizle ya da ObiHub destekle iletişime geçin.", subscription: false };
    case "ACCOUNT_SUSPENDED":
      return { text: `Abonelik erişimi duraklatıldı. ${WEB_RENEW}`, subscription: true };
    case "SUBSCRIPTION_EXPIRED":
      return { text: `Aboneliğinizin süresi doldu. ${WEB_RENEW}`, subscription: true };
    case "LOGIN_LOCKED": {
      const sec = Number(e?.retryAfter);
      const min = Number.isFinite(sec) && sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 15;
      return {
        text: `Çok fazla hatalı deneme yapıldı. ${min} dakika sonra yeniden deneyin ya da "Şifremi unuttum" ile şifrenizi sıfırlayın.`,
        subscription: false,
      };
    }
  }
  // Kodsuz (eski sunucu ya da başka hata): eski davranış — 403'te web'den yenileme yönlendirmesi.
  if (Number(e?.status) === 403) return { text: `${detail || "Giriş engellendi."} ${WEB_RENEW}`, subscription: true };
  return { text: detail || "Giriş başarısız oldu.", subscription: false };
}
