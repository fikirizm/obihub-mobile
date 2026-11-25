// E-belge yeniden deneme alıcı formu (saf modül; birim testi dev/test-edoc-recipient.mjs).
// Web: lib/edocRecipient.js + components/sales/EdocRetryDialog.jsx. Sunucu: POST /local-invoices/{id}/edoc-retry
// (gövde isteğe bağlı {city, district, tax_number}); eksik alıcı bilgisi 422 RECIPIENT_INCOMPLETE {missing, suggested, individual_allowed};
// başarıda {edoc_state, status, message, synced?, resent?}. İl/ilçe serbest metin: sunucu kesinleştirir (web liste önerir).

export const RETRY_SENTENCE = "Paraşüt'teki fatura korunur, yalnız e-belge yeniden denenir.";
export const INDIVIDUAL_TAX_NO = "11111111111";
export const FIELD_LABEL: Record<string, string> = { city: "İl", district: "İlçe", tax_number: "VKN / TCKN" };
const ORDER = ["city", "district", "tax_number"];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function isValidVkn(value: unknown): boolean {
  return /^\d{10}$/.test(String(value ?? ""));
}
export function isValidTckn(value: unknown): boolean {
  const s = String(value ?? "");
  if (!/^\d{11}$/.test(s) || s[0] === "0") return false;
  const d = s.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return tenth === d[9] && eleventh === d[10];
}

export type RecipientValue = { city: string; district: string; tax_number: string; individual: boolean };
export type RetryForm = { missing: string[]; individualAllowed: boolean; value: RecipientValue };

// Sunucunun 422 RECIPIENT_INCOMPLETE gövdesinden form; başka hata ya da eksik yoksa null.
export function retryForm(err: any): RetryForm | null {
  const d = err?.data && typeof err.data === "object" ? err.data : null;
  if (!d || (err?.code !== "RECIPIENT_INCOMPLETE" && d.code !== "RECIPIENT_INCOMPLETE")) return null;
  const missing = ORDER.filter((k) => Array.isArray(d.missing) && d.missing.includes(k));
  if (!missing.length) return null;
  const s = d.suggested && typeof d.suggested === "object" ? d.suggested : {};
  const individualAllowed = d.individual_allowed !== false;
  const sugTax = str(s.tax_number);
  const tax = !individualAllowed && sugTax === INDIVIDUAL_TAX_NO ? "" : sugTax;
  return {
    missing,
    individualAllowed,
    value: { city: str(s.city), district: str(s.district), tax_number: tax, individual: missing.includes("tax_number") && individualAllowed && !tax },
  };
}

export function validateRecipient(v: Partial<RecipientValue>, missing: string[] = [], individualAllowed = true): Record<string, string> {
  const e: Record<string, string> = {};
  if (missing.includes("city") && !str(v.city)) e.city = "İl yazın";
  if (missing.includes("district") && !str(v.district)) e.district = "İlçe yazın";
  if (missing.includes("tax_number") && !(v.individual && individualAllowed)) {
    const t = str(v.tax_number);
    if (!(isValidVkn(t) || isValidTckn(t) || (individualAllowed && t === INDIVIDUAL_TAX_NO))) e.tax_number = "10 haneli VKN ya da geçerli 11 haneli TCKN girin";
  }
  return e;
}

export function recipientBody(v: Partial<RecipientValue>, missing: string[] = [], individualAllowed = true) {
  const body: Record<string, string> = { city: str(v.city), district: str(v.district) };
  if (missing.includes("tax_number")) body.tax_number = v.individual && individualAllowed ? INDIVIDUAL_TAX_NO : str(v.tax_number);
  return body;
}

export function retryResult(r: any): { tone: "success" | "info" | "error"; text: string } {
  if (r?.edoc_state === "failed") {
    const why = str(r?.message) || str(r?.edoc_error) || (Array.isArray(r?.edoc_errors) ? r.edoc_errors.map(str).filter(Boolean).join("; ") : "");
    return { tone: "error", text: why ? `E-belge yine düzenlenemedi: ${why}` : "E-belge yine düzenlenemedi." };
  }
  if (r?.synced && r?.resent === false && str(r?.message)) return { tone: "success", text: str(r.message) };
  const st = r?.edoc_state || r?.status;
  if (st === "done" || st === "resmilesti" || r?.status === "resmilesti") return { tone: "success", text: "E-belge düzenlendi; fatura resmileşti." };
  return { tone: "info", text: "E-belge yeniden gönderildi; sonuç bekleniyor. Birkaç dakika sonra durumu sorgulayabilirsiniz." };
}
