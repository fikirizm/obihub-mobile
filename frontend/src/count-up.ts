// G5 — özet tutarı sayaç animasyonu (saf modül; birim testi dev/test-count-up.mjs).
// Ara değer ease-out (kübik) ile hesaplanır ve kuruşa yuvarlanır; son karede hedef değer aynen gösterilir.

export const COUNT_UP_MS = 650;

export function countUpValue(from: number, to: number, t: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return to;
  if (t >= 1) return to;
  if (t <= 0) return from;
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.round((from + (to - from) * eased) * 100) / 100;
}

// Değer değişmediyse, fark kuruştan küçükse ya da "hareketi azalt" açıksa doğrudan gösterilir.
export function shouldAnimate(from: number, to: number, reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return Math.abs(to - from) >= 0.005;
}
