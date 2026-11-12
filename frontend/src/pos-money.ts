// POS para kuralları (saf modül; birim testi: dev/test-pos-money.mjs). Sunucu: backend/routers/pos.py _compute_totals.
// Satır = birim × adet × (1 − satır iskontosu/100) YUVARLAMASIZ; toplam = ROUND_HALF_UP(Σ satır − genel indirim) kuruşa.
// Float yok: sayılar ondalık metinden BigInt'e (12 basamak) çevrilir (web lib/posPayment.js ile aynı yöntem).

export const toCents = (n: number) => (Number.isFinite(n) ? Math.round(n * 100 + Math.sign(n) * Number.EPSILON * 100) : 0);
export const fromCents = (c: number) => (c / 100).toFixed(2);

const SCALE_DIGITS = 12;
const S = BigInt(10) ** BigInt(SCALE_DIGITS);
const B0 = BigInt(0);
const B2 = BigInt(2);
const B100 = BigInt(100);

function toScaled(value: number | string | null | undefined): bigint {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return B0;
  let text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) text = n.toFixed(SCALE_DIGITS);
  const neg = text.startsWith("-");
  const [int, frac = ""] = text.replace("-", "").split(".");
  const digits = BigInt(int + frac.slice(0, SCALE_DIGITS).padEnd(SCALE_DIGITS, "0"));
  return neg ? -digits : digits;
}

// n / d, yarım yukarı (n >= 0, d > 0)
const divHalfUp = (n: bigint, d: bigint) => (n <= B0 ? B0 : (B2 * n + d) / (B2 * d));

export type PosMoneyLine = { unit_price: number; quantity: number; discount_percent?: number };

// Genel indirim TUTAR olarak (mobilde yüzde indirim yok). İndirim ara toplamı aşamaz.
export function posTotalsCents(lines: PosMoneyLine[], discountAmount: number) {
  const den = B100 * S * S;
  let subN = B0;
  for (const l of lines) {
    const qty = BigInt(Math.trunc(Number(l.quantity) || 0));
    subN += toScaled(l.unit_price) * qty * (B100 * S - toScaled(l.discount_percent || 0));
  }
  if (subN < B0) subN = B0;
  const subtotalCents = divHalfUp(subN * B100, den);
  let discountCents = divHalfUp(toScaled(Math.max(0, discountAmount || 0)) * B100, S);
  if (discountCents * den > subN * B100) discountCents = subtotalCents;
  const totalCents = divHalfUp(subN * B100 - discountCents * den, den);
  return { subtotalCents: Number(subtotalCents), discountCents: Number(discountCents), totalCents: Number(totalCents) };
}

// Karma: kart = toplam − nakit (kuruşta), böylece bölme toplamı her zaman fiş tutarına eşittir.
export function splitCents(totalCents: number, cashCents: number) {
  const cash = Math.min(Math.max(cashCents, 0), totalCents);
  return { cash, card: totalCents - cash };
}

export function karmaPayments(totalCents: number, cashCents: number) {
  const s = splitCents(totalCents, cashCents);
  return [
    { method: "nakit" as const, amount: fromCents(s.cash) },
    { method: "kart" as const, amount: fromCents(s.card) },
  ];
}

// POS satış hatasından sonra işlem anahtarı ne olur:
//  retry-same: sonuç belirsiz (ağ, 5xx, stok işlemi süren 409) → aynı anahtar + aynı sepetle tekrar; sepet kilitli.
//  new-key:    kesin ret (POS_* 4xx, diğer 4xx) → hiçbir şey yazılmadı; sonraki deneme yeni anahtar.
//  conflict:   anahtar farklı sepetle kullanılmış → yeni anahtar, ayrı uyarı.
export type PosErrorAction = "retry-same" | "new-key" | "conflict";
export function posErrorAction(e: { status?: number; code?: string; message?: string } | null | undefined): PosErrorAction {
  const status = Number(e?.status || 0);
  const code = String(e?.code || "");
  if (code === "IDEMPOTENCY_CONFLICT" || (status === 409 && /farklı bir sepet/i.test(String(e?.message || "")))) return "conflict";
  if (status === 0 || status >= 500) return "retry-same";
  if (code.startsWith("POS_")) return "new-key";
  if (status === 409) return "retry-same";
  return "new-key";
}

export function nextPosKey(key: string, e: { status?: number; code?: string; message?: string }, make: () => string) {
  return posErrorAction(e) === "retry-same" ? key : make();
}
