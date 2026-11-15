// Uzun oturum kuralları (saf modül; birim testi dev/test-session-refresh.mjs). Sözleşme: docs/pm/tasarim/mobil-oturum-push.md.
// Erişim anahtarı kısa ömürlü; yenileme anahtarı her kullanımda değişir. 401'de sessizce bir kez yenilenir; aynı anda gelen
// isteklerde tek yenileme yapılır. Kullanıcı yalnız yenileme gerçekten reddedilirse çıkışa düşer (ağ hatası oturumu korur).

const REFRESH_SKEW_MS = 5 * 60 * 1000;

function b64urlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
    if (typeof atob === "function") return decodeURIComponent(escape(atob(b64)));
    return null;
  } catch {
    return null;
  }
}

// JWT'nin bitiş zamanı (ms). Opak anahtar ya da exp yoksa null (istemci süreyi bilmez; 401'de yenilenir).
export function jwtExpMs(token: string | null | undefined): number | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const json = b64urlDecode(parts[1]);
  if (!json) return null;
  try {
    const exp = Number(JSON.parse(json)?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function refreshDue(token: string | null | undefined, now = Date.now(), skewMs = REFRESH_SKEW_MS): boolean {
  const exp = jwtExpMs(token);
  return exp !== null && exp - now <= skewMs;
}

// Aynı anda gelen çağrılar tek işi paylaşır; iş bitince (başarı ya da hata) sonraki çağrı yeniden çalıştırır.
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) {
      inflight = fn().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}

// Sözleşme §2: bu kodlar yeniden giriş gerektirir (hepsi 401 gelir). 429 / ağ / 5xx'te çıkış yapılmaz.
const REJECT_CODES = ["REFRESH_INVALID", "REFRESH_EXPIRED", "REFRESH_REUSED", "SESSION_REVOKED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND", "REFRESH_TOKEN_INVALID"];
// "rejected": yenileme anahtarı geçersiz/iptal → çıkış. "transient": ağ/sunucu → oturum korunur, sonra yeniden denenir.
export function refreshFailureKind(e: any): "rejected" | "transient" {
  const status = Number(e?.status || 0);
  if (status === 401 || status === 403) return "rejected";
  if (typeof e?.code === "string" && REJECT_CODES.includes(e.code)) return "rejected";
  return "transient";
}
