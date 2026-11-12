// Para yazımının belirsiz sonuç kuralları (saf modül: React Native bağımlılığı yok, birim testi dev/test-money-retry.mjs).

// Yazma isteğinin sonucu belirsiz mi? Bağlantı koptuğunda (status 0) ya da sunucu/ağ geçidi hatasında (5xx)
// istek sunucuda işlenmiş olabilir; uçlarda tekilleştirme anahtarı olmadığından aynı formu yeniden göndermek
// mükerrer kayıt üretir. Formlar bu durumda uyarı gösterir ve yeniden gönderim için ayrıca onay ister.
// Kalıcı çözüm (ayrı iş): sunucu uçlarına tekilleştirme (idempotency) anahtarı eklenmesi.
export function isUncertainWrite(e: unknown): boolean {
  const status = Number((e as { status?: number } | null)?.status);
  return status === 0 || status >= 500;
}

// Aşama 4 P1: belirsiz para sonucu. Ağ hatası / 5xx (MONEY_PARTIAL hariç) → aynı anahtarla güvenle yeniden gönderilebilir.
// MONEY_PARTIAL: sunucu yarım kalan işlemi geri alamadı; yeniden göndermeden önce hareketler kontrol edilmeli.
// MONEY_PENDING: kayıt sunucuda kendiliğinden tamamlanıyor; yeniden gönderilmez.
export function moneyRetryable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return isUncertainWrite(e) && code !== "MONEY_PARTIAL" && code !== "MONEY_PENDING";
}

// Aşama 4 P2: anahtarlı para yazımı. Sonuç belirsizse (ağ / 5xx, MONEY_INCOMPLETE dahil) kullanıcıya sorulur ve AYNI anahtar +
// AYNI gövdeyle yeniden gönderilir; sunucu ikinci kayıt açmaz. Kesin hata (4xx, MONEY_PARTIAL, MONEY_PENDING) yeniden denenmez.
export type KeyedMoneyOutcome<T> = { ok: true; result: T } | { ok: false; error: any; uncertain: boolean };

export async function sendKeyedMoney<T>(send: () => Promise<T>, askRetry: () => Promise<boolean>): Promise<KeyedMoneyOutcome<T>> {
  for (;;) {
    try {
      return { ok: true, result: await send() };
    } catch (e: any) {
      if (!moneyRetryable(e)) return { ok: false, error: e, uncertain: isUncertainWrite(e) };
      if (!(await askRetry())) return { ok: false, error: e, uncertain: true };
    }
  }
}

