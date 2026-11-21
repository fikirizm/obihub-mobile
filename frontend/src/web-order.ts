// ObiHub web mağaza siparişi (saf modül; birim testi dev/test-web-order.mjs). Faz A M2b/M2c.
// Sunucu: website_live_checkout.py (havale → status pending + payment_status awaiting_transfer; PayTR → paid), models.OrderDetail
// (payment_status, payment_method, shipping_fee, invoice_details, shipping_address_details). Havale onayı yalnız firma sahibinde:
// POST /settings/website/transfers/{sipariş id}/confirm (403; 409 ORDER_CANCELLED / TRANSFER_NOT_PENDING; tekrarında aynı sonuç).
// Web: OrderDetailModal.jsx, WebsitePaymentsPanel.jsx.

type O = { channel?: string; integration_id?: string; provider?: string; integration_provider?: string; status?: string; payment_status?: string | null } | null | undefined;

export const WEB_LABEL = "Web Mağaza";

export function isWebOrder(o: O) {
  if (!o) return false;
  if (String(o.channel || "").toLowerCase() === "website") return true;
  if (String(o.integration_id || "").startsWith("website:")) return true;
  return [o.provider, o.integration_provider].some((v) => String(v || "").toLowerCase() === "website");
}

const CANCELLED = new Set(["cancelled", "canceled", "deleted", "iptal"]);
export const awaitingTransfer = (o: O) => isWebOrder(o) && o?.payment_status === "awaiting_transfer" && !CANCELLED.has(String(o?.status || "").toLowerCase());

const METHOD: Record<string, string> = { bank_transfer: "Havale / EFT", paytr: "Kredi / banka kartı (PayTR)" };
export const paymentMethodText = (m: unknown) => METHOD[String(m || "")] || (m ? String(m) : "");

const PSTATUS: Record<string, string> = { awaiting_transfer: "Havale bekleniyor", paid: "Ödendi", refunded: "İade edildi", failed: "Ödeme başarısız" };
export const paymentStatusText = (s: unknown) => PSTATUS[String(s || "")] || "";

export function invoiceRows(d: any): [string, string][] {
  if (!d || typeof d !== "object") return [];
  const company = d.kind === "company";
  const rows: [string, string][] = [["Fatura türü", company ? "Kurumsal" : "Bireysel"]];
  const add = (label: string, v: unknown) => {
    const s = String(v ?? "").trim();
    if (s) rows.push([label, s]);
  };
  if (company) {
    add("Şirket adı", d.company_name);
    add("Vergi dairesi", d.tax_office);
    add("Vergi numarası", d.tax_number);
  } else {
    add("Ad soyad", d.name);
    add("T.C. kimlik numarası", d.identity_number);
  }
  return rows;
}

export function shippingText(a: any) {
  if (!a || typeof a !== "object") return "";
  return [a.neighborhood, a.address_detail, a.district, a.city, a.postcode].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
}

export const confirmPath = (orderId: string) => `/settings/website/transfers/${encodeURIComponent(orderId)}/confirm`;
export const canConfirmTransfer = (o: O, owner: boolean) => owner && awaitingTransfer(o);

export const CONFIRM_TEXT = "Banka hesabında bu tutarın geldiğini doğruladım. Onay, seçili banka hesabına gelir yazar ve stok düşer.";

const ERR: Record<string, string> = {
  ORDER_CANCELLED: "İptal edilen sipariş için tahsilat onaylanamaz.",
  TRANSFER_NOT_PENDING: "Bekleyen havale bulunamadı veya süresi doldu.",
};
export function transferErrorText(e: { status?: number; code?: string; message?: string } | null | undefined) {
  if (Number(e?.status) === 403) return "Havale onayını yalnız firma sahibi verebilir.";
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  if (m && !/^Sunucu hatası/.test(m) && m !== e?.code) return m;
  return (e?.code && ERR[e.code]) || "Tahsilat doğrulanamadı. Yeniden deneyin.";
}

export const shipWarning = (o: O) =>
  awaitingTransfer(o) ? "Bu siparişin havalesi henüz onaylanmadı. Para gelmeden kargolamayın ya da fatura kesmeyin." : null;
