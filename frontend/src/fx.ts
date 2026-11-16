// Döviz (saf modül; birim testi dev/test-fx.mjs). Dalga 3 (P3.2): GET /finance/fx-rates?date= (TCMB; D tarihli belgeye D'den önceki
// ilk yayın, rate_date). Farklı para birimli virmanda to_amount zorunlu (400 TRANSFER_TARGET_AMOUNT_REQUIRED). Dövizli faturayı TL hesaba
// tahsilde cash_amount ("Alınan TL"); kur farkı ayrı satır, Paraşüt eşitlemesi kapalı. Web: components/cash/kasaModel.js.

export type Rates = Record<string, { buying?: string | number; selling?: string | number }> | null | undefined;

const trNum = (v: number, digits: number) => v.toFixed(digits).replace(".", ",");
const trRate = (v: number) => String(Number(v.toFixed(4))).replace(".", ",");
export function parseTr(s: unknown): number | null {
  const t = String(s ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
  return Number.isFinite(n) ? n : null;
}

// 1 birim dövizin TL karşılığı (TCMB döviz alış); TRY = 1; yoksa null.
export function tryRate(rates: Rates, currency: string) {
  if (!currency || currency === "TRY") return 1;
  const r = Number(rates?.[currency]?.buying);
  return Number.isFinite(r) && r > 0 ? r : null;
}

// Kasa: tüm hesapların güncel kurla YAKLAŞIK TL toplamı. Yalnız TL varsa ya da bir dövizin kuru yoksa null (eksik toplam gösterilmez).
export function approxTryTotal(lines: { currency: string; amount: number }[], rates: Rates) {
  const foreign = lines.filter((l) => l.currency !== "TRY");
  if (!foreign.length || !rates) return null;
  let cents = 0;
  for (const l of lines) {
    const r = tryRate(rates, l.currency);
    if (r === null) return null;
    const c = Math.round(l.amount * 100);
    cents += l.currency === "TRY" ? c : Math.round(c * r);
  }
  return { amount: cents / 100, currencies: foreign.map((l) => l.currency) };
}

const rateBase = (src: string, tgt: string) => (src === "TRY" ? { base: tgt, quote: "TRY" } : { base: src, quote: tgt });
export function transferRateLabel(src: string, tgt: string) {
  const { base, quote } = rateBase(src, tgt);
  return `Döviz kuru (1 ${base} = ? ${quote === "TRY" ? "₺" : quote})`;
}
export function defaultTransferRate(src: string, tgt: string, rates: Rates) {
  if (!src || !tgt || src === tgt) return "";
  const { base, quote } = rateBase(src, tgt);
  const b = tryRate(rates, base);
  const q = tryRate(rates, quote);
  if (b === null || q === null) return "";
  return trRate(b / q);
}
export function transferTargetAmount(amount: unknown, rate: unknown, src: string, tgt: string) {
  const a = parseTr(amount);
  const r = parseTr(rate);
  if (a === null || r === null || a <= 0 || r <= 0) return "";
  const value = src === "TRY" && tgt !== "TRY" ? a / r : a * r;
  return trNum(Math.round(value * 100) / 100, 2);
}

// Dövizli faturayı TL hesaba tahsil: önerilen "Alınan TL" (döviz alış kuruyla); kur yoksa boş (kullanıcı yazar).
export function suggestedTry(amount: number, currency: string, rates: Rates) {
  const r = tryRate(rates, currency);
  return r === null || !(amount > 0) ? "" : trNum(Math.round(amount * r * 100) / 100, 2);
}

const TEXT: Record<string, string> = {
  TRANSFER_TARGET_AMOUNT_REQUIRED: "Farklı para birimli virmanda karşı hesaba geçen tutarı girin.",
  FX_RATE_REQUIRED: "Dövizli belge için kur gerekli; belge tarihinin TCMB kuru alınamadı.",
  FX_COLLECTION_PARASUT_UNSUPPORTED: "Dövizli faturanın TL tahsilatı Paraşüt'e işlenmez; yalnız ObiHub'a kaydedilir.",
};
export function fxErrorText(e: { code?: string; message?: string } | null | undefined) {
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m) && m !== e?.code) return m;
  return (e?.code && TEXT[e.code]) || "İşlem yapılamadı.";
}
