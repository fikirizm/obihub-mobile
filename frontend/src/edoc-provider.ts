// E-belge sağlayıcısı özeti (saf modül; birim testi dev/test-edoc-provider.mjs). EDM e-Fatura (25 Kas 2026, canlı f5650b8d0) ve
// Trendyol E-Faturam ile resmileşmiş satış faturası. Web: components/sales/EdmEdocCard.jsx, TrendyolEdocCard.jsx, lib/edmEfatura.js.
// Sözleşme: docs/pm/tasarim/edm-efatura-final-rapor-2026-11-25.md. Alanlar: edoc_provider, edoc_kind, edoc_remote_state, edoc_remote_code,
// official_number, edoc_ettn, edoc_previous_ettns, edoc_test_mode, edoc_internet_sale, edoc_number_pending, edoc_resend_*.
// Test ortamı rozeti ve önceki ETTN listesi PM isteğiyle mobilde (web faturada göstermiyor).

const PROVIDERS: Record<string, string> = { edm_efatura: "EDM e-Fatura", trendyol_efaturam: "Trendyol E-Faturam" };
const KIND: Record<string, string> = { e_fatura: "e-Fatura", e_arsiv: "e-Arşiv" };
export type Tone = "ok" | "warn" | "crit" | "neutral";

const REMOTE: Record<string, [string, Tone]> = {
  pending: ["Bekliyor", "warn"],
  accepted: ["Onaylandı", "ok"],
  rejected: ["Reddedildi", "crit"],
  failed: ["Hatalı", "crit"],
  cancelled: ["İptal edildi", "neutral"],
  not_found: ["Bulunamadı", "warn"],
  unknown: ["Bilinmiyor", "neutral"],
};
const PROCESSING = ["PACKAGE - PROCESSING", "SEND - PROCESSING", "SEND - WAIT_GIB_RESPONSE", "SEND - WAIT_SYSTEM_RESPONSE", "UNKNOWN - UNKNOWN"];
const EDM_STATUS: Record<string, [string, Tone]> = {
  "SEND - SUCCEED": ["Gönderildi", "ok"],
  "SEND - WAIT_APPLICATION_RESPONSE": ["Alıcı yanıtı bekleniyor", "warn"],
  "ACCEPTED - SUCCEED": ["Alıcı kabul etti", "ok"],
  "REJECTED - SUCCEED": ["Alıcı reddetti", "crit"],
  "SEND - FAILED": ["Gönderim başarısız", "crit"],
  "PACKAGE - FAIL": ["Gönderim başarısız", "crit"],
  "CANCELLED - SUCCEED": ["İptal edildi", "neutral"],
  ...Object.fromEntries(PROCESSING.map((k) => [k, ["İşleniyor", "warn"] as [string, Tone]])),
};
const normCode = (raw: unknown) => String(raw ?? "").trim().replace(/\s+/g, " ").replace(/\s*-\s*/g, " - ").toUpperCase();

export type EdocNote = { key: "test" | "number" | "resend" | "failed" | "rejected"; text: string; tone: "warn" | "info" };
export type EdocProviderView = {
  provider: string;
  isEdm: boolean;
  status: { label: string; tone: Tone } | null;
  testMode: boolean;
  facts: [string, string][];
  previousEttns: string[];
  notes: EdocNote[];
  canResend: boolean;
};

export function edocProviderView(inv: any): EdocProviderView | null {
  const key = String(inv?.edoc_provider || "");
  if (!PROVIDERS[key]) return null;
  const isEdm = key === "edm_efatura";
  const stateKey = String(inv?.edoc_remote_state || "").trim().toLowerCase();
  const byCode = isEdm ? EDM_STATUS[normCode(inv?.edoc_remote_code)] : undefined;
  const st = byCode || (stateKey ? REMOTE[stateKey] || REMOTE.unknown : null);
  const cancelled = inv?.edoc_state === "cancelled" || Boolean(inv?.edoc_cancelled_at) || stateKey === "cancelled";
  const numberPending = inv?.edoc_number_pending === true && !inv?.official_number;
  const resendPending = Boolean(inv?.edoc_resend_lock || inv?.edoc_resend_uncertain || inv?.edoc_resend_ettn);
  const failed = stateKey === "failed" && !cancelled;
  const testMode = inv?.edoc_test_mode === true;

  const notes: EdocNote[] = [];
  if (testMode)
    notes.push({ key: "test", tone: "warn", text: "Test ortamında kesildi: resmî geçerliliği yoktur ve pazaryerine gönderilmez. Canlı bağlantıyla kesilen faturalar iletilir." });
  if (numberPending) notes.push({ key: "number", tone: "info", text: "Resmî fatura numarası henüz alınamadı. Durumu yenileyin; numara gelince resmî PDF de açılır." });
  if (resendPending && !cancelled) notes.push({ key: "resend", tone: "warn", text: "Yeniden gönderimin sonucu henüz bilinmiyor. Durumu yenileyin; bu sırada iptal ve yeni gönderim yapılamaz." });
  else if (failed) notes.push({ key: "failed", tone: "warn", text: "Sağlayıcı faturanın gönderimini tamamlayamadı. Bilgileri kontrol edip yeniden gönderebilirsiniz; fatura numarası değişmez." });
  if (stateKey === "rejected") notes.push({ key: "rejected", tone: "warn", text: "Alıcı bu e-Faturayı reddetti. Düzeltme için iade faturası oluşturun." });

  const facts: [string, string][] = (
    [
      ["Belge türü", KIND[String(inv?.edoc_kind || "")] || ""],
      ["Resmî numara", String(inv?.official_number || "")],
      ["ETTN", String(inv?.edoc_ettn || "")],
      ["İnternet satışı", inv?.edoc_internet_sale ? "Evet" : ""],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const prev = (Array.isArray(inv?.edoc_previous_ettns) ? inv.edoc_previous_ettns : []).filter((x: unknown) => typeof x === "string" && x).reverse();

  return {
    provider: PROVIDERS[key],
    isEdm,
    status: st ? { label: st[0], tone: st[1] } : null,
    testMode,
    facts,
    previousEttns: prev,
    notes,
    canResend: isEdm && failed && !resendPending,
  };
}

// ---- hata metinleri (web lib/edmEfatura.js edmErrorText) ----
const EDM_ERROR_TEXT: Record<string, string> = {
  EDM_INPUT_INVALID: "Girdiğiniz bilgilerde eksik ya da hatalı alan var.",
  EDM_UNAUTHORIZED: "EDM web servis kullanıcı adı veya şifresi hatalı. Bağlantıyı web panelinden kontrol edin.",
  EDM_NOT_CONNECTED: "EDM e-Fatura bağlı değil. Web panelinde Uygulamalar bölümünden bağlanın.",
  EDM_ACCOUNT_SUSPENDED: "EDM hesabınız askıya alınmış (genellikle ödenmemiş borç nedeniyle). EDM müşteri temsilcinizle görüşün.",
  EDM_ACCESS_DENIED: "EDM bu kullanıcıya web servis erişimi tanımlamamış ya da erişimi engellemiş.",
  EDM_GIB_ACCOUNT_INACTIVE: "GİB e-Fatura hesabınız aktif görünmüyor. EDM ile görüşüp GİB kaydınızı kontrol ettirin.",
  EDM_TAX_ID_MISMATCH: "VKN/TCKN, EDM kullanıcınızın kayıtlı olduğu firmayla uyuşmuyor.",
  EDM_ALIAS_MISMATCH: "Gönderici etiketiniz EDM kayıtlarıyla uyuşmuyor. Bağlantıyı web panelinden yenileyin.",
  EDM_SENDER_ALIAS_MISSING: "Firmanız e-Fatura mükellefi görünmüyor; yalnız e-Arşiv faturası kesilebilir.",
  EDM_SERIES_MISSING: "EDM portalında bu belge türü için fatura serisi tanımlı değil.",
  EDM_VALIDATION_FAILED: "Fatura EDM/GİB doğrulamasından geçemedi. Fatura bilgilerini kontrol edin.",
  EDM_NOT_FOUND: "Belge EDM'de bulunamadı.",
  EDM_CANCEL_FAILED: "e-Arşiv faturası iptal edilemedi.",
  EDM_TIMEOUT: "EDM zamanında yanıt vermedi. Belge gönderilmiş olabilir; durumunu sorgulayın.",
  EDM_NETWORK_UNAVAILABLE: "EDM'ye şu an ulaşılamıyor. Biraz sonra yeniden deneyin.",
  EDM_TEMPORARILY_UNAVAILABLE: "EDM servisi geçici olarak kullanılamıyor. Birkaç dakika sonra yeniden deneyin.",
  EDM_PROVIDER_ERROR: "EDM isteği tamamlayamadı. Biraz sonra yeniden deneyin.",
};
const DETAIL_FIRST = new Set(["EDM_VALIDATION_FAILED", "EDM_CANCEL_FAILED", "EDM_PROVIDER_ERROR", "EDM_INPUT_INVALID"]);
const usable = (m: string) => Boolean(m) && !/^Sunucu hatası/.test(m);

export function edocErrorText(err: any, fallback = "e-Belge işlemi tamamlanamadı."): string {
  const code = typeof err?.code === "string" ? err.code : "";
  const detail = typeof err?.message === "string" ? err.message.trim() : "";
  if (code && EDM_ERROR_TEXT[code]) return DETAIL_FIRST.has(code) && usable(detail) ? detail : EDM_ERROR_TEXT[code];
  // EDOC_TEST_MODE, EDOC_RESEND_PENDING, EDOC_RESEND_IN_PROGRESS, UBL_* ve diğerleri: sunucunun Türkçe metni.
  return usable(detail) ? detail : fallback;
}
