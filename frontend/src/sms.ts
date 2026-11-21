// Netgsm SMS ekranının saf kuralları (birim testi dev/test-sms.mjs). Uçlar /netgsm/* (backend/routers/netgsm.py), hata gövdesi
// {code, detail}. Web: frontend/src/components/sms/*. Belge: docs/netgsm-sms.md "2. Mobil iş listesi".
// Kurallar: gönderici adı seçilmeden gönderim yok (birden çok ad varsa kendiliğinden seçilmez); toplu gönderimde request_id her
// denemede bir kez üretilir, yinelemede aynısı gider; UNKNOWN_OUTCOME'da yeniden gönderme yok; ticaride İYS filtresi + onay zorunlu.
// Netgsm şifresi cihazda saklanmaz (bu modül şifreye hiç dokunmaz).

export const RULES: [string, string, string][] = [
  ["created", "Sipariş alındığında", "Müşteriye sipariş onayı gider."],
  ["shipped", "Kargoya verildiğinde", "Müşteriye kargo bilgisi gider."],
  ["delivered", "Teslim edildiğinde", "Müşteriye teslimat haberi gider."],
  ["cancelled", "İptal edildiğinde", "Müşteriye iptal haberi gider."],
  ["admin_created", "Yeni siparişte yetkiliye haber ver", "Yeni sipariş geldiğinde aşağıdaki numaralara SMS gider."],
];
export const RULE_KEYS = RULES.map((r) => r[0]);
export const MAX_ADMIN_PHONES = 5;
export const EVENT_LABEL: Record<string, string> = {
  created: "Sipariş alındı",
  shipped: "Kargoya verildi",
  delivered: "Teslim edildi",
  cancelled: "İptal",
  admin_created: "Yetkili bildirimi",
};
export const SOURCES: [string, string][] = [
  ["customers", "Cariler"],
  ["website_members", "Web mağaza üyeleri"],
  ["store_orders", "Web mağaza sipariş müşterileri"],
  ["woocommerce_orders", "WooCommerce sipariş müşterileri"],
];
export const IYS_OPTIONS: [string, string][] = [
  ["BRAND", "Marka izinlerine göre"],
  ["RETAILER", "Bayi izinlerine göre"],
  ["BRAND_AND_RETAILER", "Marka ve bayi izinlerine göre"],
];
export const SENDER_TYPE: Record<string, string> = { ALPHANUMERIC: "Gönderici adı", SUBSCRIBER_NUMBER: "Abone numarası", UNKNOWN: "Tür bilinmiyor" };
export const CONSENT_TEXT = "Alıcıların ticari ileti izninin bende kayıtlı olduğunu ve İYS'ye bildirildiğini onaylıyorum.";
export const COMMERCIAL_NOTE =
  "Kampanya ve tanıtım SMS'leri ticari elektronik iletidir; İYS'de onayı olmayan numaralara gönderilemez. Netgsm, seçtiğiniz filtreye göre izinsiz numaraları eler. İzin sorumluluğu gönderen firmadadır.";
export const CONFLICT_TEXT = "Ayarlar başka yerde değişti. Yeniden yükleyip değişikliklerinizi tekrar yapın.";
export const UNKNOWN_TEXT = "Yeniden göndermeyin; Netgsm panelinden ya da Geçmiş'ten kontrol edin.";

const nf = (n: unknown) => (Number(n) || 0).toLocaleString("tr-TR");
const msg = (e: any, fallback: string) => (typeof e?.message === "string" && e.message.trim() ? e.message.trim() : fallback);

// Değişken adı sunucudan "siparis_no" ya da "[siparis_no]" gelebilir; ekranda hep köşeli parantezle.
export const bare = (v: unknown) => String(v ?? "").replace(/^\[|\]$/g, "");
export const tag = (v: unknown) => `[${bare(v)}]`;
export function appendVar(text: string, name: string) {
  const t = String(text || "");
  return `${t}${t && !/\s$/.test(t) ? " " : ""}${tag(name)}`;
}

// Elle girilen numara → "+905xxxxxxxxx"; geçersizse "".
export function normalizePhone(raw: unknown) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? `+90${d}` : "";
}

// Sunucu kalıbı ^[A-Za-z0-9_-]{6,64}$.
export function makeRequestId() {
  try {
    const c: any = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === "function") return String(c.randomUUID());
  } catch {
    /* yedek */
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export const firstLine = (t: unknown) => String(t || "").split(/\r?\n/)[0].trim();
export const previewBody = (text: string, scope: "order" | "bulk", encoding: unknown) => ({
  text,
  scope,
  encoding: encoding === "DEFAULT" ? "DEFAULT" : "TURKISH",
});

// --- Ayar taslağı (Bağlantı + Otomatik SMS; tek PUT /netgsm/settings, expected_revision ile) ---
export type Rule = { enabled: boolean; text: string; phones?: string[] };
export type Draft = {
  enabled: boolean;
  sender: string;
  encoding: "TURKISH" | "DEFAULT";
  store_name: string;
  channels: { website: boolean; woocommerce: boolean };
  rules: Record<string, Rule>;
};
export function toDraft(v: any): Draft {
  const rules: Record<string, Rule> = {};
  for (const k of RULE_KEYS) {
    const r = v?.rules?.[k] || {};
    rules[k] = { enabled: r.enabled === true, text: String(r.text || ""), ...(k === "admin_created" ? { phones: Array.isArray(r.phones) ? r.phones.map(String) : [] } : {}) };
  }
  return {
    enabled: v?.enabled === true,
    sender: String(v?.sender || ""),
    encoding: v?.encoding === "DEFAULT" ? "DEFAULT" : "TURKISH",
    store_name: String(v?.store_name || ""),
    channels: { website: v?.channels?.website === true, woocommerce: v?.channels?.woocommerce === true },
    rules,
  };
}
export function toPayload(revision: number, d: Draft) {
  const rules: Record<string, Rule> = {};
  for (const k of RULE_KEYS) {
    const r = d.rules[k];
    rules[k] =
      k === "admin_created"
        ? { enabled: r.enabled, text: r.text, phones: (r.phones || []).map((p) => String(p).trim()).filter(Boolean) }
        : { enabled: r.enabled, text: r.text };
  }
  return { expected_revision: revision, enabled: d.enabled, sender: d.sender, encoding: d.encoding, store_name: d.store_name, channels: { ...d.channels }, rules };
}
export function settingsError(e: any) {
  if (Number(e?.status) === 409 || e?.code === "DRAFT_CHANGED") return { conflict: true, text: CONFLICT_TEXT };
  return { conflict: false, text: msg(e, "Ayarlar kaydedilemedi.") };
}

// --- Gönderici adı ---
const SENDER_REASON: Record<string, string> = {
  ROUTING_CODE_MISSING: "Netgsm'de bu gönderici adının tanımı tamamlanmamış.",
  SUBSCRIBER_NUMBER_RESTRICTED: "Bu abone numarasıyla SMS gönderimi kısıtlı.",
};
export const senderReason = (code: unknown) => SENDER_REASON[String(code || "")] || "Netgsm bu gönderici adıyla gönderime izin vermiyor.";
export function senderRows(senders: any[]) {
  return (Array.isArray(senders) ? senders : []).map((s) => ({
    name: String(s?.name || ""),
    usable: s?.usable === true,
    typeLabel: SENDER_TYPE[String(s?.type || "")] || SENDER_TYPE.UNKNOWN,
    reason: s?.usable === true ? "" : senderReason(s?.reason),
  }));
}
export const usableSenderCount = (view: any) => (Array.isArray(view?.senders) ? view.senders : []).filter((s: any) => s?.usable === true).length;
// Bağlı ama gönderici adı seçilmemiş: her sekmede açıkça söylenir.
export function senderMissingText(view: any) {
  if (!view?.connected || view?.sender) return "";
  const n = usableSenderCount(view);
  return `Gönderici adı seçilmedi. ${n > 1 ? `Hesabınızda ${n} gönderici adı var; biri kendiliğinden seçilmez. ` : ""}Bağlantı bölümünden bir ad seçip kaydedin. Seçilmeden SMS gönderilmez.`;
}

// --- Toplu SMS ---
export type Selection = Record<string, string>; // telefon → ad
export function addRecipients(sel: Selection, rows: { name?: string; phone: string }[], max: number) {
  const next: Selection = { ...sel };
  let size = Object.keys(next).length;
  let capped = false;
  for (const r of rows) {
    if (next[r.phone] !== undefined) continue;
    if (size >= max) {
      capped = true;
      break;
    }
    next[r.phone] = String(r.name || "");
    size += 1;
  }
  return { sel: next, capped };
}
export function sendBlockReason(s: { sender: string; count: number; text: string; commercial: boolean; iys: string; consent: boolean }): string | null {
  if (!s.sender) return "Göndermek için önce Bağlantı bölümünden gönderici adı seçin.";
  if (s.count <= 0) return "Göndermek için en az bir alıcı seçin.";
  if (!String(s.text || "").trim()) return "Göndermek için mesaj metnini yazın.";
  if (s.commercial && !s.iys) return "Ticari mesajda İYS filtresini seçin.";
  if (s.commercial && !s.consent) return "Ticari mesajda izin onay kutusunu işaretleyin.";
  return null;
}
export function campaignBody(requestId: string, text: string, commercial: boolean, iys: string, consent: boolean, sel: Selection) {
  return {
    request_id: requestId,
    text,
    commercial,
    iys_filter: commercial ? iys : "NONE",
    consent_ack: commercial ? consent : false,
    recipients: Object.entries(sel).map(([phone, name]) => ({ name, phone })),
  };
}
// İstek atıldı ama sonuç alınamadıysa (503 UNKNOWN_OUTCOME) sonuç "belirsiz" sayılır: yeniden gönderme düğmesi gösterilmez.
export function campaignFailure(e: any): { result: { state: "unknown"; error: string } } | { error: string } {
  if (e?.code === "UNKNOWN_OUTCOME") return { result: { state: "unknown", error: msg(e, "Gönderimin sonucu alınamadı; SMS'ler gitmiş olabilir.") } };
  return { error: msg(e, "Gönderim yapılamadı.") };
}
export function resultView(r: any) {
  const st = String(r?.state || "");
  const lines: string[] = [];
  const error = typeof r?.error === "string" ? r.error.trim() : "";
  let title = "Gönderim sıraya alındı";
  let tone: "success" | "warning" | "error" | "info" = "info";
  if (st === "sent") {
    title = `${nf(r.accepted)} numara Netgsm'e iletildi`;
    tone = "success";
    if (Number(r.invalid) > 0) lines.push(`${nf(r.invalid)} geçersiz numara atlandı.`);
    if (Number(r.duplicates) > 0) lines.push(`${nf(r.duplicates)} tekrar eden numara tek sayıldı.`);
  } else if (st === "unknown") {
    title = "Gönderimin sonucu belirsiz";
    tone = "warning";
    if (error) lines.push(error);
    lines.push(UNKNOWN_TEXT);
  } else if (st === "failed") {
    title = "SMS gönderilemedi";
    tone = "error";
    if (error) lines.push(error);
  } else {
    lines.push("Durumu Geçmiş bölümünden izleyebilirsiniz.");
  }
  const rejected = st === "sent" && Number(r.rejected) > 0;
  return {
    title,
    tone,
    lines,
    rejectedTitle: rejected ? `${nf(r.rejected)} numara reddedildi` : "",
    rejectedItems: rejected && Array.isArray(r.rejected_items) ? r.rejected_items.slice(0, 50).map((x: any) => ({ phone: String(x?.phone || ""), reason: String(x?.reason || "") })) : [],
    // Başarısız deneme formu açık bırakır ve yeni istek kimliği ister; diğerleri sonuç ekranında kalır (yeniden gönderme yok).
    finished: st !== "failed",
    newRequestId: st === "failed",
  };
}

// --- Geçmiş ---
const FAIL_REASON: Record<string, string> = {
  INVALID_NUMBER: "Numara geçersiz",
  INVALID_NUMBER_FORMAT: "Numara biçimi hatalı",
  TIMEOUT: "Süresi doldu, telefona ulaşmadı",
  OPERATOR_TIMEOUT: "Operatör zamanında yanıt vermedi",
  OPERATOR_REJECTED: "Operatör kabul etmedi",
  OPERATOR_ERROR: "Operatör hatası",
  NOT_SENT_TO_OPERATOR: "Operatöre iletilemedi",
  SEND_ERROR: "Gönderim hatası",
  DUPLICATE: "Aynı mesaj yinelendi",
  INSUFFICIENT_CREDIT: "Netgsm bakiyesi yetersiz",
  BLACKLISTED: "Numara kara listede",
  IYS_REJECTED: "İYS izni yok",
  IYS_ERROR: "İYS sorgusu yapılamadı",
  SMS_DISABLED_ON_DEVICE: "Telefonda SMS kapalı",
  DEVICE_NOT_SUPPORTED: "Telefon desteklemiyor",
  UNKNOWN_SUBSCRIBER: "Abone bulunamadı",
  ILLEGAL_SUBSCRIBER: "Abone geçersiz",
  NO_INTERNATIONAL_PERMISSION: "Yurt dışı gönderim izni yok",
  ROUTING_FAILED: "Yönlendirilemedi",
  SYSTEM_ERROR: "Netgsm sistem hatası",
};
export const failReason = (code: unknown) => (code ? FAIL_REASON[String(code)] || "Netgsm iletemedi" : "");
export type Tone = "success" | "warning" | "error" | "info";
export function stateInfo(row: any): { label: string; tone: Tone; detail: string } {
  const s = row?.state;
  if (s === "sent") {
    if (row.delivery === "DELIVERED") return { label: "İletildi", tone: "success", detail: "" };
    if (row.delivery === "NOT_DELIVERED") return { label: "İletilmedi", tone: "error", detail: failReason(row.fail_reason) };
    return { label: "Gönderildi", tone: "success", detail: "" };
  }
  if (s === "failed") return { label: "Gönderilemedi", tone: "error", detail: String(row.error || "") };
  if (s === "unknown") return { label: "Sonuç belirsiz", tone: "warning", detail: String(row.error || "") };
  if (s === "sending") return { label: "Gönderiliyor", tone: "info", detail: "" };
  return { label: "Sırada", tone: "info", detail: "" };
}

export function fmtDate(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}
