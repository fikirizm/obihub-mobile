// Gelen kutusu (saf modül; birim testi dev/test-inbox-ui.mjs). Sözleşme: docs/pm/tasarim/D-17.md.
// Web: components/incoming/incomingSync.js (sorgu, satır), IncomingWorkflow.jsx (görünüm, kabul/red, toplu işlem), IncomingInvoicesOS.jsx (durum metni).

export const VIEW_OPTIONS: [string, string][] = [
  ["unprocessed", "İşlenmemiş"],
  ["archived", "Arşivlenmiş"],
  ["rejected", "Reddedilen"],
  ["all", "Tümü"],
];
export const DEFAULT_VIEW = "unprocessed";
export const SORT_OPTIONS: [string, string][] = [
  ["-issue_date", "En yeni"],
  ["issue_date", "En eski"],
  ["-amount", "Tutar (yüksek)"],
  ["amount", "Tutar (düşük)"],
];
const SERVER_SORTS = ["-issue_date", "issue_date", "amount", "-amount", "supplier", "-supplier"];

export function viewLabel(view: string, counts: Record<string, unknown> | null | undefined) {
  const label = (VIEW_OPTIONS.find((v) => v[0] === view) || [view, view])[1];
  const n = counts ? Number(counts[view]) : NaN;
  return counts && Number.isFinite(n) ? `${label} · ${n}` : label;
}

export function inboxQuery(o: { provider: string; page: number; pageSize: number; q?: string; view?: string; sort?: string }) {
  const qs = new URLSearchParams({ provider: o.provider, page: String(o.page), page_size: String(o.pageSize) });
  const text = String(o.q || "").trim();
  if (text) qs.set("q", text);
  if (o.view && VIEW_OPTIONS.some((v) => v[0] === o.view)) qs.set("view", o.view);
  if (o.sort && SERVER_SORTS.includes(o.sort)) qs.set("sort", o.sort);
  return qs.toString();
}

export type Kind = "success" | "info" | "warning" | "error" | "neutral";
const STATUS_KIND: Record<string, Kind> = { awaiting_response: "warning", accepted: "success", accepted_basic: "success", rejected: "error", returned: "neutral", unknown: "neutral" };

export type ResponseRequest = { decision?: string; state?: string; requested_at?: string | null; message?: string | null } | null;
export type InboxRow = {
  id: string;
  invoice_no?: string;
  sender_name: string;
  sender_tax_no: string;
  issue_date: string;
  gross_total?: number;
  currency?: string;
  status: string;
  statusText: string | null;
  statusKind: Kind;
  type_label: string | null;
  import_status?: string;
  import_state: string | null;
  importLabel: string | null;
  importedElsewhere: boolean;
  import_reimportable: boolean;
  archived: boolean;
  can_respond: boolean;
  response_request: ResponseRequest;
  pdf_id: string;
};

export function inboxRow(x: any, provider: string): InboxRow {
  const supplier = x?.supplier && typeof x.supplier === "object" ? x.supplier : {};
  const status = String(x?.status || "");
  const label = typeof x?.status_label === "string" && x.status_label ? x.status_label : null;
  const days = x?.response_days_left;
  const nDays = days == null || days === "" ? NaN : Number(days);
  const statusText = label && status === "awaiting_response" && Number.isFinite(nDays) ? `${label} · ${nDays <= 0 ? "son gün" : `${nDays} gün`}` : label;
  const docKey = String(x?.document_key || "");
  return {
    id: docKey,
    invoice_no: x?.invoice_no || undefined,
    sender_name: supplier.name || "",
    sender_tax_no: supplier.tax_no || "",
    issue_date: x?.issue_date || "",
    gross_total: x?.payable_amount ?? undefined,
    currency: x?.currency || undefined,
    status,
    statusText,
    statusKind: STATUS_KIND[status] || "neutral",
    type_label: x?.type_label || null,
    import_status: x?.import_status,
    import_state: x?.import_state || null,
    importLabel: x?.import_state_label || null,
    importedElsewhere: x?.import_state === "imported_elsewhere",
    import_reimportable: x?.import_reimportable === true,
    archived: x?.archived === true,
    can_respond: x?.can_respond === true,
    response_request: x?.response_request && typeof x.response_request === "object" ? x.response_request : null,
    // PDF uçları sağlayıcının kendi kimliğini ister (yalnız satır bu sağlayıcıdansa).
    pdf_id: x?.native_id && (!x?.source || x.source === provider) ? String(x.native_id) : docKey,
  };
}

export function responseNote(req: ResponseRequest): string | null {
  if (!req || typeof req !== "object") return null;
  if (req.state === "queued") return "Yanıt gönderildi · Paraşüt sonucu bekleniyor";
  if (req.state === "sending") return "Yanıt gönderiliyor…";
  if (req.state === "unknown") return "Yanıt sonucu belirsiz · Paraşüt'te kontrol edin";
  if (req.state === "failed") {
    const msg = typeof req.message === "string" ? req.message.trim() : "";
    return `Yanıt gönderilemedi · ${msg || "yeniden deneyebilirsiniz"}`;
  }
  return null;
}

export const RESPOND_COPY = {
  accept: { title: "Faturayı kabul et", confirm: "Kabul et ve gönder", check: "Kabulün GİB'e gönderileceğini ve geri alınamayacağını anlıyorum." },
  reject: { title: "Faturayı reddet", confirm: "Reddet ve gönder", check: "Reddin GİB'e gönderileceğini ve geri alınamayacağını anlıyorum." },
};
export const RESPOND_WARNING = "Bu yanıt GİB üzerinden tedarikçiye gönderilir ve geri alınamaz.";
export const REASON_MAX = 500;

export function respondBody(decision: "accept" | "reject", reason: string, confirmed: boolean): { body?: Record<string, unknown>; error?: string } {
  const text = String(reason || "").trim();
  if (decision === "reject" && !text) return { error: "Red gerekçesi zorunludur." };
  if (decision === "reject" && text.length > REASON_MAX) return { error: `Gerekçe en çok ${REASON_MAX} karakter olabilir.` };
  if (!confirmed) return { error: "Geri alınamayacağını onaylayın." };
  return { body: { decision, confirm_irreversible: true, ...(decision === "reject" ? { reason: text } : {}) } };
}

export const respondDoneText = (res: any, decision: string) =>
  res?.response_request?.state === "queued" ? "Yanıt gönderildi, Paraşüt sonucu bekleniyor." : decision === "accept" ? "Fatura kabul edildi." : "Fatura reddedildi.";

export const MAX_DOWNLOAD = 20;
export function downloadProblem(count: number): string | null {
  if (count <= 0) return "Önce belge seçin.";
  if (count > MAX_DOWNLOAD) return `İndirme için en çok ${MAX_DOWNLOAD} belge seçin.`;
  return null;
}
export function downloadText(done: number, missing: number, format: string) {
  const f = format.toUpperCase();
  return missing > 0 ? `${done} belge ${f} olarak indirildi; ${missing} belge indirilemedi (zip içindeki EKSIK.txt'de yazar).` : `${done} belge ${f} olarak indirildi (zip).`;
}
export const archiveText = (n: number, archived: boolean) => (archived ? `${n} belge arşivlendi.` : `${n} belge arşivden çıkarıldı.`);

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}
