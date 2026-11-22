// Sipariş faturalandırma (Faz C4; saf modül, birim testi dev/test-order-invoice.mjs). Sözleşme:
// docs/pm/tasarim/siparis-faturalandirma-mobil-sozlesme.md. Fatura her zaman önce ObiHub'da kesilir (local_invoice_id, invoice_state);
// resmileştirme bağlı sağlayıcıyla ayrı adımdır. Rozet/eylem web orderModel.invoiceBadge ile aynı. `invoice_id` okunmaz (eski alan).

type Order = Record<string, any>;
const MARKETS = ["trendyol", "hepsiburada", "pazarama", "idefix"];
const isClosed = (o: Order) => ["cancelled", "deleted"].includes(String(o?.status || "").toLowerCase());
const hasAny = (o: Order) => Boolean(o?.local_invoice_id || o?.invoice_number || o?.parasut_invoice_id || o?.bizimhesap_invoice_guid);

export function orderInvoiceState(o: Order, channel: string) {
  const real = hasAny(o);
  const cancelledInvoice = Boolean(o?.local_invoice_id) && o?.invoice_state === "cancelled";
  const closed = isClosed(o);
  const invoiced = (real && !cancelledInvoice) || (channel === "hepsiburada" && o?.hb_invoice_missing !== true);
  return {
    hasInvoice: real,
    invoiced,
    // Fatura yoksa, hata aldıysa ya da iptal edildiyse (sipariş iptal değilken) yeniden "Faturalandır".
    canCreate: !closed && (!real || cancelledInvoice || Boolean(o?.invoice_error && !o?.local_invoice_id)),
    canOpen: Boolean(o?.local_invoice_id || o?.parasut_invoice_id || o?.parasut_invoice_url),
    // Pazaryerine iletme: ObiHub ya da Paraşüt faturası varken; resmileşmemişse sunucu 409 INVOICE_NOT_OFFICIAL döner.
    canShare: MARKETS.includes(channel) && Boolean(o?.parasut_invoice_id || o?.local_invoice_id),
    sharedToTrendyol: channel === "trendyol" && Boolean(o?.trendyol_invoice_shared),
  };
}

export type Badge = { label: string; tone: "warning" | "error" | "info" | "success" | "neutral"; action: "create" | "retry" | "officialize" | "open" | null; detail: string };
export function invoiceBadge(o: Order): Badge {
  const st = String(o?.invoice_state || "");
  if (o?.local_invoice_id) {
    if (st === "issued") return { label: "Kesildi · Resmileşmedi", tone: "info", action: "officialize", detail: "" };
    if (st === "officializing") return { label: "Gönderiliyor", tone: "info", action: null, detail: "" };
    if (st === "official") return { label: "Resmileşti", tone: "success", action: "open", detail: "" };
    if (st === "aktarildi") return { label: "BizimHesap'a aktarıldı", tone: "success", action: "open", detail: "" };
    if (st === "sent") return { label: "Paraşüt'te kesildi · e-Belge yok", tone: "info", action: "open", detail: "" };
    if (st === "cancelled") return { label: "Fatura iptal", tone: "neutral", action: "open", detail: "" };
    return { label: "Kesildi", tone: "info", action: "open", detail: "" };
  }
  if (o?.parasut_invoice_id || o?.invoice_number || o?.bizimhesap_invoice_guid) return { label: "Paraşüt'te kesildi", tone: "success", action: o?.parasut_invoice_id || o?.parasut_invoice_url ? "open" : null, detail: "" };
  if (o?.invoice_error) return { label: "Fatura hatası", tone: "error", action: isClosed(o) ? null : "retry", detail: String(o.invoice_error.message || "") };
  if (isClosed(o)) return { label: "Fatura yok", tone: "neutral", action: null, detail: "" };
  return { label: "Fatura bekliyor", tone: "warning", action: "create", detail: "" };
}

export const displayNumber = (o: Order) => String(o?.official_number || o?.obihub_invoice_number || o?.invoice_number || "");

export function openTarget(o: Order): { kind: "local"; id: string } | { kind: "parasut"; id: string } | { kind: "url"; url: string } | null {
  if (o?.local_invoice_id) return { kind: "local", id: String(o.local_invoice_id) };
  if (o?.parasut_invoice_id) return { kind: "parasut", id: String(o.parasut_invoice_id) };
  if (o?.parasut_invoice_url) return { kind: "url", url: String(o.parasut_invoice_url) };
  return null;
}

export function attentionText(o: Order) {
  const a = String(o?.invoice_attention || "");
  if (a === "order_cancelled") return "Sipariş iptal edildi; kesilen faturayı iptal etmeyi düşünün.";
  if (a === "order_cancelled_official") return "Sipariş iptal edildi ama fatura resmileşmiş; iade faturası ya da e-belge iptali gerekebilir.";
  if (a === "officialize_failed") return "Resmileştirme başarısız oldu; faturayı açıp yeniden deneyin.";
  if (a === "parasut_payment_failed") return "Siparişin tahsilatı Paraşüt'e işlenemedi; Paraşüt'te fatura açık görünebilir.";
  return "";
}

export function createResult(r: any): { kind: "success" | "info" | "error"; text: string; connectHref: string | null } {
  if (r?.in_progress) return { kind: "info", text: r?.message || "Bu sipariş için fatura kesimi sürüyor.", connectHref: null };
  if (!r?.success) return { kind: "error", text: r?.message || "Fatura oluşturulamadı.", connectHref: null };
  const off = r?.officialize;
  const err = off?.error;
  if (err?.code === "NO_OFFICIALIZER") return { kind: "info", text: err.message || "Fatura kesildi; resmileştirmek için muhasebe bağlantısı kurun.", connectHref: err?.action?.href || null };
  if (off?.status === "failed") return { kind: "info", text: `Fatura kesildi; resmileştirme başarısız: ${err?.message || off?.message || "bilinmeyen hata"}`, connectHref: null };
  return { kind: "success", text: r?.message || "Fatura kesildi.", connectHref: null };
}

const CODES: Record<string, string> = {
  ORDER_CANCELLED: "İptal edilmiş sipariş faturalandırılamaz.",
  ORDER_HAS_NO_LINES: "Siparişte faturalanacak satır yok.",
  ORDER_TOTAL_MISMATCH: "Fatura toplamı sipariş toplamına eşitlenemedi; fatura kesilmedi.",
  INVOICE_IN_PROGRESS: "Bu sipariş için fatura kesimi sürüyor.",
};
const msg = (e: any) => (typeof e?.message === "string" && e.message.trim() && !/^Sunucu hatası/.test(e.message) ? e.message.trim() : "");
export const invoiceErrorText = (e: any) => CODES[String(e?.code || "")] || msg(e) || "Fatura oluşturulamadı.";
const SHARE: Record<string, string> = {
  INVOICE_NOT_OFFICIAL: "Fatura henüz resmileşmedi. Önce resmileştirin, sonra mağazaya iletin.",
  PROVIDER_NO_PDF: "Fatura BizimHesap'a aktarıldı; PDF BizimHesap'tan alınır, mağazaya buradan iletilemez.",
  PROVIDER_SHARE_NOT_SUPPORTED: "Turkcell ile resmileşen fatura mağazaya buradan iletilemez.",
};
export const shareErrorText = (e: any) => SHARE[String(e?.code || "")] || msg(e) || "Fatura mağazaya iletilemedi.";

// --- Kanal fatura ayarı (WP4): PUT /integrations/{id}/settings yalnız gönderilen invoice_settings alanlarını birleştirir
// (API anahtarlarına dokunmaz). obihub_kasa_id doluysa sipariş faturası "Tahsil edildi" kesilir (tahsilat bu hesaba); boşsa açık alacak.
// auto_officialize kullanıcı dokunmadıysa GÖNDERİLMEZ (sunucu okuma anında varsayılanı uygular). Web: OrderInvoiceObiHubCard.jsx.
export type InvoiceSettingsState = { obihub_kasa_id: string; auto_officialize: boolean | undefined };
export function readInvoiceSettings(inv: any): InvoiceSettingsState {
  const s = inv || {};
  return { obihub_kasa_id: String(s.obihub_kasa_id || ""), auto_officialize: typeof s.auto_officialize === "boolean" ? s.auto_officialize : undefined };
}
export function invoiceSettingsPayload(s: InvoiceSettingsState) {
  const out: { obihub_kasa_id: string; auto_officialize?: boolean } = { obihub_kasa_id: String(s?.obihub_kasa_id || "") };
  if (typeof s?.auto_officialize === "boolean") out.auto_officialize = s.auto_officialize;
  return out;
}
// Anahtarın gösterdiği etkin değer (sunucu officialize_mode ile aynı). Sağlayıcı yoksa her zaman kapalı.
export function effectiveAutoOfficialize(s: { auto_officialize?: boolean }, provider: string | null | undefined, legacy: any) {
  if (!provider) return false;
  if (typeof s?.auto_officialize === "boolean") return s.auto_officialize;
  if (provider === "parasut") return Boolean(legacy?.auto_create_e_document);
  return provider === "bizimhesap";
}
export const kasaAccounts = <A extends Record<string, any>>(list: A[]) =>
  (Array.isArray(list) ? list : []).filter(
    (a) => String(a?.currency || "TRY").toUpperCase() === "TRY" && a?.is_active !== false && a?.archived !== true && a?.read_only !== true
  );
export function kasaWarning(inv: any) {
  return inv?.mark_as_paid && inv?.payment_account_id && !inv?.obihub_kasa_id
    ? "Eski ayarda faturalar Paraşüt hesabına ödendi işaretleniyordu. ObiHub'da tahsil edildi kesilmesi için bir kasa seçin."
    : "";
}
const KASA: Record<string, string> = {
  ACCOUNT_NOT_FOUND: "Hesap bulunamadı.",
  CURRENCY_MISMATCH: "Tahsilat kasası TL olmalı.",
  ACCOUNT_INACTIVE: "Seçilen hesap pasif.",
  MIRROR_ACCOUNT_READ_ONLY: "Paraşüt'ten gelen hesap seçilemez; ObiHub hesabı seçin.",
};
export const kasaErrorText = (e: any) => KASA[String(e?.code || "")] || msg(e) || "Ayar kaydedilemedi.";

// --- C4 eki: sipariş tahsilatını Paraşüt'e yeniden işleme. POST /local-invoices/{id}/order-parasut-payment →
// {ok, state: synced|failed|uncertain|busy|not_applicable, code?, message?}. not_applicable'da "işlendi" denmez, sunucu metni gösterilir.
// Belirsiz sonuçta yeniden gönderme önerilmez (Paraşüt'te kontrol). Fatura tahsilat satırı uncertain|syncing iken "Paraşüt'e işle" yoktur (parasut-pay.ts).
export const canRetryParasutPayment = (o: Order) => o?.invoice_attention === "parasut_payment_failed" && Boolean(o?.local_invoice_id);
export const parasutPaymentPath = (localInvoiceId: string) => `/local-invoices/${encodeURIComponent(localInvoiceId)}/order-parasut-payment`;
export function parasutPaymentResult(r: any): { kind: "success" | "info" | "error"; text: string } {
  const m = typeof r?.message === "string" && r.message.trim() ? r.message.trim() : "";
  if (r?.state === "synced") return { kind: "success", text: m || "Tahsilat Paraşüt'e işlendi." };
  if (r?.state === "not_applicable" || r?.code === "NOT_APPLICABLE") return { kind: "info", text: m || "Bu sipariş için Paraşüt'e işlenecek tahsilat yok." };
  if (r?.state === "uncertain") return { kind: "info", text: `${m ? `${m} ` : ""}Sonuç belirsiz; yeniden göndermeden önce Paraşüt'te kontrol edin.` };
  if (r?.state === "busy" || r?.code === "BUSY") return { kind: "info", text: m || "Bu tahsilat için Paraşüt işlemi sürüyor; biraz sonra yenileyin." };
  if (r?.code === "PARASUT_ALREADY_PAID") return { kind: "info", text: m || "Fatura Paraşüt'te zaten ödenmiş görünüyor; ikinci tahsilat yazılmadı." };
  return { kind: "error", text: m || "Tahsilat Paraşüt'e işlenemedi." };
}
